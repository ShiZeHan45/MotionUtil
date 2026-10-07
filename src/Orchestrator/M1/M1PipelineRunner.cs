using System.Diagnostics;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using MotionVideoPipeline.Contracts;

namespace MotionVideoPipeline.Orchestrator.M1;

public sealed record M1RunOptions(
    string WorkspaceRoot,
    string ArtifactsRoot,
    string VoiceCatalogPath,
    string VoiceCacheRoot,
    string VoiceId = "zf_001",
    bool FixtureMode = false,
    bool SkipRender = false,
    string? ContentWorkerScript = null,
    string? VoiceWorkerScript = null,
    string? RendererScript = null,
    JsonElement? ModelProfile = null,
    TimeSpan? WorkerTimeout = null,
    M1ConcurrencyGates? ConcurrencyGates = null);

public enum M1PipelineStage
{
    SourceCollection,
    AiPlanning,
    Rendering
}

public sealed class M1ConcurrencyGates : IDisposable
{
    public SemaphoreSlim SourceCollection { get; }
    public SemaphoreSlim AiPlanning { get; }
    public SemaphoreSlim Rendering { get; }

    public M1ConcurrencyGates(int sourceCollectionConcurrency = 3, int aiPlanningConcurrency = 2, int renderingConcurrency = 1)
    {
        if (sourceCollectionConcurrency < 1) throw new ArgumentOutOfRangeException(nameof(sourceCollectionConcurrency));
        if (aiPlanningConcurrency < 1) throw new ArgumentOutOfRangeException(nameof(aiPlanningConcurrency));
        if (renderingConcurrency < 1) throw new ArgumentOutOfRangeException(nameof(renderingConcurrency));
        SourceCollection = new SemaphoreSlim(sourceCollectionConcurrency, sourceCollectionConcurrency);
        AiPlanning = new SemaphoreSlim(aiPlanningConcurrency, aiPlanningConcurrency);
        Rendering = new SemaphoreSlim(renderingConcurrency, renderingConcurrency);
    }

    public async Task<T> RunAsync<T>(M1PipelineStage stage, Func<Task<T>> operation, CancellationToken cancellationToken)
    {
        var semaphore = stage switch
        {
            M1PipelineStage.SourceCollection => SourceCollection,
            M1PipelineStage.AiPlanning => AiPlanning,
            M1PipelineStage.Rendering => Rendering,
            _ => throw new ArgumentOutOfRangeException(nameof(stage))
        };
        await semaphore.WaitAsync(cancellationToken);
        try { return await operation(); }
        finally { semaphore.Release(); }
    }

    public void Dispose()
    {
        SourceCollection.Dispose();
        AiPlanning.Dispose();
        Rendering.Dispose();
    }
}

public sealed record M1ProjectResult(
    string ProjectId,
    string RepositoryUrl,
    string Status,
    string RunDirectory,
    IReadOnlyList<string> Warnings,
    string? Error = null);

public sealed class M1PipelineRunner
{
    private readonly WorkerProcessManager workers;

    public M1PipelineRunner(WorkerProcessManager? workers = null) => this.workers = workers ?? new WorkerProcessManager();

    public async Task<M1ProjectResult> RunProjectAsync(
        RankingItem project,
        string projectId,
        M1RunOptions options,
        CancellationToken cancellationToken = default)
    {
        var root = Path.GetFullPath(options.ArtifactsRoot);
        var runDirectory = Path.Combine(root, "runs", projectId);
        Directory.CreateDirectory(runDirectory);
        var warnings = new List<string>();
        var logPath = Path.Combine(runDirectory, "run.log.jsonl");
        await AppendLogAsync(logPath, new { eventName = "run-started", projectId, repositoryUrl = project.RepositoryUrl, at = DateTimeOffset.UtcNow }, cancellationToken);
        await AtomicFileWriter.WriteAsync(Path.Combine(runDirectory, "input.json"), JsonSerializer.Serialize(project, JsonOptions()), cancellationToken);

        try
        {
            if (!options.FixtureMode && options.ModelProfile is null)
                throw new M1PipelineException("LLM_CONFIGURATION_MISSING", "真实任务未配置 OpenAI-compatible 模型。");

            var plan = await RunContentAsync(options, "research_plan", new { project, modelProfile = options.ModelProfile ?? JsonSerializer.SerializeToElement(new { }), fixtureMode = options.FixtureMode }, cancellationToken);
            await AppendLogAsync(logPath, new { eventName = "node-completed", nodeId = "AIResearchPlanner", at = DateTimeOffset.UtcNow }, cancellationToken);
            var urls = plan.TryGetProperty("urls", out var urlValue) && urlValue.ValueKind == JsonValueKind.Array
                ? urlValue.EnumerateArray().Select(x => x.GetString() ?? string.Empty).Where(x => x.Length > 0).ToArray()
                : Array.Empty<string>();
            object sourcePayload = options.FixtureMode
                ? new { operation = "collect_sources", fixtureMode = true, urls, sources = BuildFixtureSources(project, urls) }
                : new { operation = "collect_sources", urls };
            var sourceResult = await RunContentAsync(options, "collect_sources", sourcePayload, cancellationToken);
            await AppendLogAsync(logPath, new { eventName = "node-completed", nodeId = "SourceCollector", at = DateTimeOffset.UtcNow }, cancellationToken);
            var sources = sourceResult.GetProperty("sources");
            var evidenceResult = await RunContentAsync(options, "build_evidence", new { operation = "build_evidence", project, projectId, sources }, cancellationToken);
            var evidence = evidenceResult.GetProperty("evidencePack");
            var evidenceErrors = evidenceResult.TryGetProperty("errors", out var evidenceErrorValue) && evidenceErrorValue.ValueKind == JsonValueKind.Array
                ? evidenceErrorValue.EnumerateArray().Select(value => value.GetString() ?? value.GetRawText()).Where(value => value.Length > 0).ToArray()
                : Array.Empty<string>();
            if (evidenceErrors.Length > 0)
                throw new M1PipelineException("EVIDENCE_INSUFFICIENT", string.Join("; ", evidenceErrors));
            await AtomicFileWriter.WriteAsync(Path.Combine(runDirectory, "evidence-pack.json"), evidence.GetRawText(), cancellationToken);
            await AppendLogAsync(logPath, new { eventName = "node-completed", nodeId = "EvidenceVerifier", at = DateTimeOffset.UtcNow }, cancellationToken);

            var scriptPayload = new
            {
                operation = "script",
                fixtureMode = options.FixtureMode,
                project,
                projectId,
                starCountSpoken = IntegerToChinese(project.StargazersCount),
                evidence,
                modelProfile = options.ModelProfile ?? JsonSerializer.SerializeToElement(new { })
            };
            var scriptResult = await RunContentAsync(options, "script", scriptPayload, cancellationToken);
            await AppendLogAsync(logPath, new { eventName = "node-completed", nodeId = "ScriptPlanner", at = DateTimeOffset.UtcNow }, cancellationToken);
            var storyboard = JsonNode.Parse(scriptResult.GetProperty("storyboard").GetRawText())?.AsObject()
                ?? throw new InvalidDataException("Script worker 未返回 storyboard。");

            var voiceManifest = await RunVoiceAsync(options, "preload_catalog", new { operation = "preload_catalog", catalogPath = Path.GetFullPath(options.VoiceCatalogPath), cacheRoot = Path.GetFullPath(options.VoiceCacheRoot), fixtureMode = options.FixtureMode }, cancellationToken);
            await AppendLogAsync(logPath, new { eventName = "node-completed", nodeId = "VoiceCatalogPreloader", at = DateTimeOffset.UtcNow }, cancellationToken);
            await AtomicFileWriter.WriteAsync(Path.Combine(runDirectory, "voice-cache-manifest.json"), voiceManifest.GetRawText(), cancellationToken);
            if (!voiceManifest.TryGetProperty("profiles", out var profiles) || profiles.EnumerateArray().Any(x => !string.Equals(x.GetProperty("status").GetString(), "ready", StringComparison.Ordinal)))
                throw new M1PipelineException("VOICE_CACHE_NOT_READY", "配置音色未全部预热完成。");

            var audioManifest = new JsonObject { ["voiceId"] = options.VoiceId, ["beats"] = new JsonArray() };
            var cues = new List<SubtitleCue>();
            var cursorMs = 0;
            foreach (var chapter in storyboard["chapters"]!.AsArray())
            {
                foreach (var beat in chapter!["beats"]!.AsArray())
                {
                    cancellationToken.ThrowIfCancellationRequested();
                    var beatId = beat!["id"]!.GetValue<string>();
                    var text = beat["pronunciationText"]?.GetValue<string>() ?? beat["spokenText"]?.GetValue<string>() ?? string.Empty;
                    var audioPath = Path.Combine(runDirectory, "audio", $"{beatId}.wav");
                    var audio = await RunVoiceAsync(options, "synthesize_beat", new { operation = "synthesize_beat", catalogPath = Path.GetFullPath(options.VoiceCatalogPath), manifestPath = Path.Combine(Path.GetFullPath(options.VoiceCacheRoot), "VoiceCacheManifest.json"), voiceId = options.VoiceId, pronunciationText = text, outputPath = audioPath, fixtureMode = options.FixtureMode }, cancellationToken);
                    var durationMs = audio.GetProperty("durationMs").GetInt32();
                    beat["audioPath"] = audioPath;
                    beat["durationMs"] = durationMs;
                    audioManifest["beats"]!.AsArray().Add(new JsonObject
                    {
                        ["beatId"] = beatId,
                        ["audioPath"] = audioPath,
                        ["sampleRate"] = audio.GetProperty("sampleRate").GetInt32(),
                        ["frameCount"] = audio.GetProperty("frameCount").GetInt32(),
                        ["durationMs"] = durationMs,
                        ["sha256"] = audio.GetProperty("sha256").GetString()
                    });
                    var subtitle = beat["subtitleText"]?.GetValue<string>() ?? text;
                    cues.Add(new SubtitleCue(cues.Count + 1, beatId, cursorMs, cursorMs + durationMs, subtitle));
                    cursorMs += durationMs;
                }
            }

            await AtomicFileWriter.WriteAsync(Path.Combine(runDirectory, "storyboard.json"), storyboard.ToJsonString(JsonOptions()), cancellationToken);
            await AtomicFileWriter.WriteAsync(Path.Combine(runDirectory, "audio-manifest.json"), audioManifest.ToJsonString(JsonOptions()), cancellationToken);
            await AtomicFileWriter.WriteAsync(Path.Combine(runDirectory, "subtitle-timeline.json"), JsonSerializer.Serialize(new { cues }, JsonOptions()), cancellationToken);
            await AtomicFileWriter.WriteAsync(Path.Combine(runDirectory, "subtitles.srt"), ToSrt(cues), cancellationToken);
            await AppendLogAsync(logPath, new { eventName = "node-completed", nodeId = "AudioTimelineBuilder", beatCount = cues.Count, at = DateTimeOffset.UtcNow }, cancellationToken);

            if (!options.SkipRender)
            {
                var renderInput = new JsonObject
                {
                    ["projectId"] = projectId,
                    ["runDirectory"] = runDirectory,
                    ["projectName"] = project.ProjectName,
                    ["stargazersCount"] = project.StargazersCount,
                    ["starCountSpoken"] = IntegerToChinese(project.StargazersCount),
                    ["projectNames"] = new JsonArray(project.ProjectName, "remotion", "three.js", "kokoro", "open-source", "ai-tool"),
                    ["storyboard"] = storyboard,
                    ["audioManifest"] = audioManifest,
                    ["evidence"] = JsonNode.Parse(evidence.GetRawText()),
                    ["subtitleTimeline"] = JsonNode.Parse(JsonSerializer.Serialize(new { cues }))
                };
                var renderInputPath = Path.Combine(runDirectory, "render-input.json");
                await AtomicFileWriter.WriteAsync(renderInputPath, renderInput.ToJsonString(JsonOptions()), cancellationToken);
                await RunRendererAsync(options, renderInputPath, cancellationToken);
                var qualityPath = Path.Combine(runDirectory, "quality-report.json");
                if (!File.Exists(qualityPath)) throw new M1PipelineException("QUALITY_REPORT_MISSING", "渲染器未生成 quality-report.json。");
                var quality = JsonNode.Parse(await File.ReadAllTextAsync(qualityPath, cancellationToken))?.AsObject();
                if (!string.Equals(quality?["status"]?.GetValue<string>(), "pass", StringComparison.Ordinal))
                    throw new M1PipelineException("QUALITY_GATE_FAILED", quality?["checks"]?.ToJsonString() ?? "质量门禁失败");
                await AppendLogAsync(logPath, new { eventName = "node-completed", nodeId = "RemotionThreeRenderer", at = DateTimeOffset.UtcNow }, cancellationToken);
            }
            else
            {
                warnings.Add("渲染已跳过，仅用于逻辑夹具验证。");
            }

            await AtomicFileWriter.WriteAsync(Path.Combine(runDirectory, "run.json"), JsonSerializer.Serialize(new { projectId, project.RepositoryUrl, status = "completed", completedAt = DateTimeOffset.UtcNow }, JsonOptions()), cancellationToken);
            await AppendLogAsync(logPath, new { eventName = "run-completed", status = "completed", at = DateTimeOffset.UtcNow }, cancellationToken);
            return new M1ProjectResult(projectId, project.RepositoryUrl, "completed", runDirectory, warnings);
        }
        catch (Exception error) when (error is not OperationCanceledException)
        {
            await AtomicFileWriter.WriteAsync(Path.Combine(runDirectory, "run.json"), JsonSerializer.Serialize(new { projectId, project.RepositoryUrl, status = "quarantined", error = error.Message, updatedAt = DateTimeOffset.UtcNow }, JsonOptions()), cancellationToken);
            await AppendLogAsync(logPath, new { eventName = "run-quarantined", status = "quarantined", error = error.Message, at = DateTimeOffset.UtcNow }, cancellationToken);
            throw;
        }
    }

    private async Task<JsonElement> RunContentAsync(M1RunOptions options, string operation, object payload, CancellationToken cancellationToken)
    {
        var script = options.ContentWorkerScript ?? Path.Combine(options.WorkspaceRoot, "workers", "content-runtime", "src", "content-worker.ts");
        var requestPayload = AddOperation(payload is JsonElement element ? element : JsonSerializer.SerializeToElement(payload, JsonOptions()), operation);
        var request = WorkerMessage.Create(Guid.NewGuid().ToString("N"), "content-runtime", "0.1.0", WorkerMessageTypes.Request, requestPayload);
        async Task<JsonElement> ExecuteAsync()
        {
            var messages = await workers.RunAsync("node", $"--experimental-strip-types \"{script}\"", request, options.WorkerTimeout ?? TimeSpan.FromMinutes(2), cancellationToken);
            return ExtractResult(messages, operation);
        }
        var stage = operation is "research_plan" or "script" ? M1PipelineStage.AiPlanning : operation == "collect_sources" ? M1PipelineStage.SourceCollection : (M1PipelineStage?)null;
        return stage is { } selected && options.ConcurrencyGates is not null
            ? await options.ConcurrencyGates.RunAsync(selected, ExecuteAsync, cancellationToken)
            : await ExecuteAsync();
    }

    private async Task<JsonElement> RunVoiceAsync(M1RunOptions options, string operation, object payload, CancellationToken cancellationToken)
    {
        var script = options.VoiceWorkerScript ?? Path.Combine(options.WorkspaceRoot, "workers", "voice-runtime", "voice_worker.py");
        var requestPayload = AddOperation(payload is JsonElement element ? element : JsonSerializer.SerializeToElement(payload, JsonOptions()), operation);
        var request = WorkerMessage.Create(Guid.NewGuid().ToString("N"), "voice-runtime", "0.1.0", WorkerMessageTypes.Request, requestPayload);
        var messages = await workers.RunAsync("py", $"-3 \"{script}\"", request, options.WorkerTimeout ?? TimeSpan.FromMinutes(5), cancellationToken);
        return ExtractResult(messages, operation);
    }

    private static JsonElement AddOperation(JsonElement payload, string operation)
    {
        var node = JsonNode.Parse(payload.GetRawText())?.AsObject() ?? new JsonObject();
        node["operation"] = operation;
        return JsonSerializer.Deserialize<JsonElement>(node.ToJsonString())!;
    }

    private static JsonElement ExtractResult(IReadOnlyList<WorkerMessage> messages, string operation)
    {
        var error = messages.LastOrDefault(x => x.Type == WorkerMessageTypes.Error);
        if (error is not null)
        {
            var code = error.Payload.TryGetProperty("code", out var codeValue) ? codeValue.GetString() : "WORKER_ERROR";
            var message = error.Payload.TryGetProperty("message", out var messageValue) ? messageValue.GetString() : error.Payload.GetRawText();
            throw new M1PipelineException(code ?? "WORKER_ERROR", $"{operation}: {message}");
        }
        var result = messages.LastOrDefault(x => x.Type == WorkerMessageTypes.Result);
        return result?.Payload ?? throw new M1PipelineException("WORKER_RESULT_MISSING", $"{operation} 未返回 result。");
    }

    private static async Task RunRendererAsync(M1RunOptions options, string inputPath, CancellationToken cancellationToken)
    {
        var script = options.RendererScript ?? Path.Combine(options.WorkspaceRoot, "renderer", "src", "render-m1-remotion.ts");
        var start = new ProcessStartInfo("node", $"--experimental-strip-types \"{script}\" \"{inputPath}\"")
        {
            WorkingDirectory = Path.GetDirectoryName(script) ?? options.WorkspaceRoot,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true
        };
        async Task ExecuteAsync()
        {
            using var process = Process.Start(start) ?? throw new M1PipelineException("RENDERER_START_FAILED", "无法启动 Remotion renderer。");
            var stdoutTask = process.StandardOutput.ReadToEndAsync(cancellationToken);
            var stderrTask = process.StandardError.ReadToEndAsync(cancellationToken);
            await process.WaitForExitAsync(cancellationToken);
            var stdout = await stdoutTask;
            var stderr = await stderrTask;
            if (process.ExitCode != 0)
                throw new M1PipelineException(stderr.Contains("ffmpeg", StringComparison.OrdinalIgnoreCase) ? "FFMPEG_MISSING" : "RENDER_FAILED", string.IsNullOrWhiteSpace(stderr) ? stdout : stderr);
        }
        if (options.ConcurrencyGates is not null)
            await options.ConcurrencyGates.RunAsync(M1PipelineStage.Rendering, async () => { await ExecuteAsync(); return true; }, cancellationToken);
        else
            await ExecuteAsync();
    }

    private static IReadOnlyList<object> BuildFixtureSources(RankingItem project, IReadOnlyList<string> urls)
    {
        return urls.Select((url, index) => new
        {
            sourceId = $"fixture-source-{index + 1}", url, fetchedAt = project.CapturedAt.ToString("O"), status = 200,
            contentType = "text/plain", text = url.Contains("LICENSE", StringComparison.OrdinalIgnoreCase) ? "License: MIT" : $"Official source for {project.ProjectName}. stargazers_count: {project.StargazersCount}. Example and limitation are documented here.",
            sha256 = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(url.Contains("LICENSE", StringComparison.OrdinalIgnoreCase) ? "License: MIT" : $"Official source for {project.ProjectName}. stargazers_count: {project.StargazersCount}. Example and limitation are documented here."))).ToLowerInvariant()
        }).Cast<object>().ToArray();
    }

    private static JsonSerializerOptions JsonOptions() => new() { WriteIndented = true, PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

    private static string IntegerToChinese(long value)
    {
        if (value == 0) return "零";
        if (value < 0) return "负" + IntegerToChinese(-value);
        var digits = new[] { "零", "一", "二", "三", "四", "五", "六", "七", "八", "九" };
        string Under(long n)
        {
            var units = new[] { (1000L, "千"), (100L, "百"), (10L, "十"), (1L, "") };
            var output = new StringBuilder(); var zero = false;
            foreach (var (unitValue, unit) in units)
            {
                var digit = n / unitValue; n %= unitValue;
                if (digit > 0)
                {
                    if (zero && output.Length > 0) output.Append('零');
                    output.Append(digit == 2 && unit is "千" or "百" ? "两" : digits[digit]);
                    output.Append(unit); zero = false;
                }
                else if (output.Length > 0 && n > 0) zero = true;
            }
            return output.ToString();
        }
        var result = new StringBuilder(); var hundredMillion = value / 100000000; var remainder = value % 100000000;
        var tenThousand = remainder / 10000; var rest = remainder % 10000;
        if (hundredMillion > 0) result.Append(Under(hundredMillion)).Append("亿");
        if (tenThousand > 0)
        {
            if (result.Length > 0 && tenThousand < 1000) result.Append('零');
            result.Append(Under(tenThousand)).Append("万");
        }
        if (rest > 0)
        {
            if (result.Length > 0 && rest < 1000) result.Append('零');
            result.Append(Under(rest));
        }
        return result.ToString();
    }

    private sealed record SubtitleCue(int index, string beatId, int startMs, int endMs, string text);

    private static string ToSrt(IReadOnlyList<SubtitleCue> cues) => string.Join("\n\n", cues.Select(cue => $"{cue.index}\n{Timestamp(cue.startMs)} --> {Timestamp(cue.endMs)}\n{cue.text}")) + "\n";
    private static string Timestamp(int ms) => $"{ms / 3600000:00}:{ms / 60000 % 60:00}:{ms / 1000 % 60:00},{ms % 1000:000}";
    private static async Task AppendLogAsync(string path, object entry, CancellationToken cancellationToken)
    {
        var line = JsonSerializer.Serialize(entry, new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase }).Replace("\r", string.Empty).Replace("\n", string.Empty);
        await File.AppendAllTextAsync(path, line + Environment.NewLine, Encoding.UTF8, cancellationToken);
    }
}

public sealed class M1PipelineException : Exception
{
    public string Code { get; }
    public M1PipelineException(string code, string message) : base(message) => Code = code;
}
