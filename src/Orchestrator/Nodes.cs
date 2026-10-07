using System.Diagnostics;
using System.Text.Json;
using MotionVideoPipeline.Contracts;

namespace MotionVideoPipeline.Orchestrator;

public sealed record NodeContext(string ProjectRoot, string RendererRoot, string ArtifactsRoot, string ConfigVersion = "1");

public interface IPipelineNode
{
    string NodeId { get; }
    string NodeVersion { get; }
    IReadOnlyList<Diagnostic> Validate(JsonElement input, NodeContext context);
    Task<JsonElement> RunAsync(JsonElement input, NodeContext context, IProgress<NodeProgress>? progress = null, CancellationToken cancellationToken = default);
}

public sealed class EnvironmentCheckNode : IPipelineNode
{
    public string NodeId => "EnvironmentCheckNode";
    public string NodeVersion => "0.1.0";
    public IReadOnlyList<Diagnostic> Validate(JsonElement input, NodeContext context) => [];

    public Task<JsonElement> RunAsync(JsonElement input, NodeContext context, IProgress<NodeProgress>? progress = null, CancellationToken cancellationToken = default)
    {
        progress?.Report(new NodeProgress(0.2, "检查 .NET / Node.js / Python"));
        var result = new { dotnet = Environment.Version.ToString(), node = FindOnPath("node"), python = FindOnPath("py"), rendererRoot = context.RendererRoot };
        progress?.Report(new NodeProgress(1, "环境检查完成"));
        return Task.FromResult(JsonSerializer.SerializeToElement(result));
    }

    private static string? FindOnPath(string name)
    {
        var path = Environment.GetEnvironmentVariable("PATH") ?? string.Empty;
        return path.Split(Path.PathSeparator).Select(folder => Path.Combine(folder, name + (OperatingSystem.IsWindows() ? ".exe" : string.Empty))).FirstOrDefault(File.Exists);
    }
}

public sealed class ProjectRunCreator : IPipelineNode
{
    private readonly ProjectRunStore store;
    public ProjectRunCreator(ProjectRunStore store) => this.store = store;
    public string NodeId => "ProjectRunCreator";
    public string NodeVersion => "0.1.0";
    public IReadOnlyList<Diagnostic> Validate(JsonElement input, NodeContext context) => input.ValueKind == JsonValueKind.Object ? [] : [new("input.object.required", "项目输入必须是 JSON object")];

    public async Task<JsonElement> RunAsync(JsonElement input, NodeContext context, IProgress<NodeProgress>? progress = null, CancellationToken cancellationToken = default)
    {
        progress?.Report(new NodeProgress(0.1, "创建项目运行快照"));
        var projectId = input.TryGetProperty("projectId", out var value) ? value.GetString() ?? "m0-sample" : "m0-sample";
        var run = await store.CreateAsync(projectId, input, cancellationToken);
        progress?.Report(new NodeProgress(1, "项目运行快照已创建", run.RunId));
        return JsonSerializer.SerializeToElement(run);
    }
}

public sealed class VoiceCatalogPreloader : IPipelineNode
{
    public string NodeId => "VoiceCatalogPreloader";
    public string NodeVersion => "0.1.0";
    public IReadOnlyList<Diagnostic> Validate(JsonElement input, NodeContext context) => input.TryGetProperty("catalogPath", out _) ? [] : [new("voice.catalog.required", "必须提供 voice-catalog.json")];
    public Task<JsonElement> RunAsync(JsonElement input, NodeContext context, IProgress<NodeProgress>? progress = null, CancellationToken cancellationToken = default)
    {
        var catalogPath = input.GetProperty("catalogPath").GetString()!;
        var exists = File.Exists(catalogPath);
        progress?.Report(new NodeProgress(exists ? 1 : 0, exists ? "音色目录已就绪" : "音色目录缺失"));
        return Task.FromResult(JsonSerializer.SerializeToElement(new { catalogPath, status = exists ? "ready-for-worker" : "failed" }));
    }
}

public sealed class CanvasSeedNode : IPipelineNode
{
    public string NodeId => "CanvasSeedNode";
    public string NodeVersion => "0.1.0";
    public IReadOnlyList<Diagnostic> Validate(JsonElement input, NodeContext context) => [];
    public Task<JsonElement> RunAsync(JsonElement input, NodeContext context, IProgress<NodeProgress>? progress = null, CancellationToken cancellationToken = default)
    {
        progress?.Report(new NodeProgress(0.5, "初始化单一 CanvasWorld"));
        return Task.FromResult(JsonSerializer.SerializeToElement(new { canvasWorldId = "CanvasWorld", width = 1080, height = 1920, fps = 30, durationInFrames = 150 }));
    }
}

public sealed class RemotionThreeRenderer : IPipelineNode
{
    public string NodeId => "RemotionThreeRenderer";
    public string NodeVersion => "0.1.0";
    public IReadOnlyList<Diagnostic> Validate(JsonElement input, NodeContext context) => Directory.Exists(context.RendererRoot) ? [] : [new("renderer.missing", "renderer 目录不存在")];
    public async Task<JsonElement> RunAsync(JsonElement input, NodeContext context, IProgress<NodeProgress>? progress = null, CancellationToken cancellationToken = default)
    {
        progress?.Report(new NodeProgress(0.1, "调用确定性 CanvasWorld 渲染器"));
        var script = Path.Combine(context.RendererRoot, "src", "render-blank-canvas.ts");
        var start = new ProcessStartInfo("node", $"--experimental-strip-types \"{script}\"") { WorkingDirectory = context.RendererRoot, RedirectStandardOutput = true, RedirectStandardError = true, UseShellExecute = false, CreateNoWindow = true };
        using var process = Process.Start(start) ?? throw new InvalidOperationException("无法启动 renderer");
        await process.WaitForExitAsync(cancellationToken);
        if (process.ExitCode != 0) throw new InvalidOperationException(await process.StandardError.ReadToEndAsync(cancellationToken));
        progress?.Report(new NodeProgress(1, "Remotion/Three.js 空白画布样片完成"));
        return JsonSerializer.SerializeToElement(new { status = "rendered", outputRoot = context.ArtifactsRoot });
    }
}

public sealed class ArtifactPublisherNode : IPipelineNode
{
    private readonly ArtifactPublisher publisher;
    public ArtifactPublisherNode(ArtifactPublisher publisher) => this.publisher = publisher;
    public string NodeId => "ArtifactPublisher";
    public string NodeVersion => "0.1.0";
    public IReadOnlyList<Diagnostic> Validate(JsonElement input, NodeContext context) => [];
    public async Task<JsonElement> RunAsync(JsonElement input, NodeContext context, IProgress<NodeProgress>? progress = null, CancellationToken cancellationToken = default)
    {
        progress?.Report(new NodeProgress(0.4, "写入固定 artifacts 目录"));
        var path = await publisher.PublishAsync("m0-run.json", input.GetRawText(), cancellationToken);
        progress?.Report(new NodeProgress(1, "产物发布完成", path));
        return JsonSerializer.SerializeToElement(new { path });
    }
}
