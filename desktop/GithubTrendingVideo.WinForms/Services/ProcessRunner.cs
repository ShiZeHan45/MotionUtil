using System.Diagnostics;
using System.Text;

namespace GitHubTrendingVideo.Services;

public sealed record ProcessResult(int ExitCode, string StandardOutput, string StandardError);

public sealed class ProcessRunner
{
    public async Task<ProcessResult> RunAsync(
        string executable,
        IEnumerable<string> arguments,
        string workingDirectory,
        IReadOnlyDictionary<string, string?>? environment = null,
        Action<string>? onLine = null,
        CancellationToken cancellationToken = default)
    {
        var start = new ProcessStartInfo
        {
            FileName = executable,
            WorkingDirectory = workingDirectory,
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            StandardOutputEncoding = new UTF8Encoding(false),
            StandardErrorEncoding = new UTF8Encoding(false),
        };
        foreach (var argument in arguments) start.ArgumentList.Add(argument);
        if (environment is not null)
            foreach (var pair in environment) start.Environment[pair.Key] = pair.Value;

        using var process = new Process { StartInfo = start, EnableRaisingEvents = true };
        var stdout = new StringBuilder();
        var stderr = new StringBuilder();
        process.OutputDataReceived += (_, eventArgs) =>
        {
            if (eventArgs.Data is null) return;
            lock (stdout) stdout.AppendLine(eventArgs.Data);
            onLine?.Invoke(eventArgs.Data);
        };
        process.ErrorDataReceived += (_, eventArgs) =>
        {
            if (eventArgs.Data is null) return;
            lock (stderr) stderr.AppendLine(eventArgs.Data);
            onLine?.Invoke(eventArgs.Data);
        };

        process.Start();
        process.BeginOutputReadLine();
        process.BeginErrorReadLine();
        try
        {
            await process.WaitForExitAsync(cancellationToken);
        }
        catch (OperationCanceledException)
        {
            try { process.Kill(true); } catch { }
            await process.WaitForExitAsync(CancellationToken.None);
            throw;
        }
        process.WaitForExit();
        return new ProcessResult(process.ExitCode, stdout.ToString(), stderr.ToString());
    }

    public async Task<ProcessResult> RunCheckedAsync(
        string executable,
        IEnumerable<string> arguments,
        string workingDirectory,
        IReadOnlyDictionary<string, string?>? environment = null,
        Action<string>? onLine = null,
        CancellationToken cancellationToken = default)
    {
        var result = await RunAsync(executable, arguments, workingDirectory, environment, onLine, cancellationToken);
        if (result.ExitCode != 0)
        {
            var details = string.Join(Environment.NewLine, new[] { result.StandardError.Trim(), result.StandardOutput.Trim() }.Where(x => x.Length > 0));
            if (details.Length > 5000) details = details[^5000..];
            throw new InvalidOperationException($"命令退出代码 {result.ExitCode}。{Environment.NewLine}{details}");
        }
        return result;
    }
}
