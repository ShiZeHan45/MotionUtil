using System.Diagnostics;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using MotionVideoPipeline.Contracts;

namespace MotionVideoPipeline.Orchestrator;

public sealed class SingleInstanceGuard : IDisposable
{
    private readonly Mutex mutex;
    private bool ownsMutex;

    public SingleInstanceGuard(string name)
    {
        mutex = new Mutex(false, name);
    }

    public bool TryAcquire()
    {
        if (ownsMutex) return true;
        try
        {
            ownsMutex = mutex.WaitOne(TimeSpan.Zero);
            return ownsMutex;
        }
        catch (AbandonedMutexException)
        {
            ownsMutex = true;
            return true;
        }
    }

    public void Dispose()
    {
        if (ownsMutex) mutex.ReleaseMutex();
        mutex.Dispose();
    }
}

public sealed class ProgressAggregator
{
    private readonly Dictionary<string, NodeProgress> progress = new(StringComparer.Ordinal);
    public IReadOnlyDictionary<string, NodeProgress> Snapshot => progress;

    public void Update(string nodeId, NodeProgress value) => progress[nodeId] = value with { Value = Math.Clamp(value.Value, 0, 1) };
    public double Overall => progress.Count == 0 ? 0 : progress.Values.Average(item => item.Value);
}

public static class CacheKeyBuilder
{
    public static string Build(string nodeId, string nodeVersion, string configVersion, object input)
    {
        var json = JsonSerializer.Serialize(new { nodeId, nodeVersion, configVersion, input }, new JsonSerializerOptions { WriteIndented = false });
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(json));
        return Convert.ToHexString(bytes).ToLowerInvariant();
    }
}

public static class AtomicFileWriter
{
    public static async Task WriteAsync(string path, string contents, CancellationToken cancellationToken = default)
    {
        var directory = Path.GetDirectoryName(path) ?? throw new ArgumentException("目标路径必须包含目录。", nameof(path));
        Directory.CreateDirectory(directory);
        var temporary = path + ".tmp-" + Guid.NewGuid().ToString("N");
        await File.WriteAllTextAsync(temporary, contents, new UTF8Encoding(false), cancellationToken);
        File.Move(temporary, path, true);
    }
}

public sealed class ProjectRunStore
{
    private readonly string root;
    public ProjectRunStore(string root) => this.root = root;

    public async Task<ProjectRun> CreateAsync(string projectId, object input, CancellationToken cancellationToken = default)
    {
        var runId = $"run-{DateTimeOffset.UtcNow:yyyyMMddHHmmss}-{Guid.NewGuid():N}";
        var runDirectory = Path.Combine(root, runId);
        Directory.CreateDirectory(runDirectory);
        var inputPath = Path.Combine(runDirectory, "input.json");
        await AtomicFileWriter.WriteAsync(inputPath, JsonSerializer.Serialize(input, new JsonSerializerOptions { WriteIndented = true }), cancellationToken);
        var run = new ProjectRun(runId, projectId, DateTimeOffset.UtcNow.ToString("O"), "created", inputPath);
        await AtomicFileWriter.WriteAsync(Path.Combine(runDirectory, "run.json"), JsonSerializer.Serialize(run, new JsonSerializerOptions { WriteIndented = true }), cancellationToken);
        return run;
    }

    public Task SaveCheckpointAsync(ProjectRun run, object checkpoint, CancellationToken cancellationToken = default)
    {
        var path = Path.Combine(root, run.RunId, "checkpoint.json");
        return AtomicFileWriter.WriteAsync(path, JsonSerializer.Serialize(checkpoint, new JsonSerializerOptions { WriteIndented = true }), cancellationToken);
    }
}

public sealed class ArtifactPublisher
{
    public string ArtifactsRoot { get; }
    public ArtifactPublisher(string root) => ArtifactsRoot = Path.GetFullPath(root);

    public async Task<string> PublishAsync(string name, string contents, CancellationToken cancellationToken = default)
    {
        Directory.CreateDirectory(ArtifactsRoot);
        var path = Path.Combine(ArtifactsRoot, name);
        await AtomicFileWriter.WriteAsync(path, contents, cancellationToken);
        return path;
    }
}

public sealed class WorkerProcessManager
{
    public async Task<IReadOnlyList<WorkerMessage>> RunAsync(
        string executable,
        string arguments,
        WorkerMessage request,
        TimeSpan timeout,
        CancellationToken cancellationToken = default)
    {
        var startInfo = new ProcessStartInfo(executable, arguments)
        {
            RedirectStandardInput = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            StandardInputEncoding = new UTF8Encoding(false),
            StandardOutputEncoding = new UTF8Encoding(false),
            StandardErrorEncoding = new UTF8Encoding(false),
            UseShellExecute = false,
            CreateNoWindow = true
        };
        SystemNetwork.ConfigureNodeProxy(startInfo);
        using var process = new Process { StartInfo = startInfo, EnableRaisingEvents = true };
        if (!process.Start()) throw new InvalidOperationException($"无法启动 Worker: {executable}");
        await process.StandardInput.WriteLineAsync(request.ToJsonLine());
        await process.StandardInput.FlushAsync(cancellationToken);
        process.StandardInput.Close();

        var messages = new List<WorkerMessage>();
        using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeoutCts.CancelAfter(timeout);
        try
        {
            // Drain both pipes concurrently so a verbose diagnostic stream cannot block stdout.
            var stdoutTask = process.StandardOutput.ReadToEndAsync(timeoutCts.Token);
            var stderrTask = process.StandardError.ReadToEndAsync(timeoutCts.Token);
            await process.WaitForExitAsync(timeoutCts.Token);
            var stdout = await stdoutTask;
            var stderr = await stderrTask;
            foreach (var line in stdout.Split(["\r\n", "\n"], StringSplitOptions.RemoveEmptyEntries))
            {
                if (WorkerMessage.TryParse(line, out var message, out var error) && message is not null) messages.Add(message);
                else throw new InvalidDataException($"Worker stdout 不是有效 JSONL: {error}; line={line}");
            }
            if (process.ExitCode != 0) throw new InvalidOperationException($"Worker 退出码 {process.ExitCode}。诊断: {stderr}");
        }
        catch (OperationCanceledException)
        {
            TryKill(process);
            throw;
        }
        return messages;
    }

    private static void TryKill(Process process)
    {
        try { if (!process.HasExited) process.Kill(true); } catch { /* 进程已退出 */ }
    }

}
