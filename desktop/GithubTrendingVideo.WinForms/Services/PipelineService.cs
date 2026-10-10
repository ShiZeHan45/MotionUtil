using System.Text.Json;
using System.Globalization;
using GitHubTrendingVideo.Models;

namespace GitHubTrendingVideo.Services;

public sealed class PipelineService(RuntimePaths paths, ProcessRunner processes, EnvironmentService environment)
{
    public event Action<int, string, int>? StepChanged;
    public event Action<int, string>? StepActivityChanged;
    public event Action<string>? LogLine;
    public event Action<int, int>? OverallProgressChanged;
    public event Action<string>? RunIdChanged;

    private static readonly string[] Commands = ["trending", "repos", "scripts", "tts", "render"];
    private static readonly string[] Labels = ["采集周榜", "收集项目资料", "生成讲稿", "生成中文配音", "渲染视频"];

    public async Task RunFromStepAsync(int startIndex, AppSettings settings, string projectDirectory, CancellationToken cancellationToken)
    {
        if (startIndex is < 0 or > 4) throw new ArgumentOutOfRangeException(nameof(startIndex));
        var outputDirectory = paths.OutputDirectory(settings, projectDirectory);
        Directory.CreateDirectory(outputDirectory);

        string runId;
        PipelineReport report;
        if (startIndex == 0)
        {
            runId = DateTimeOffset.UtcNow.ToString("yyyy-MM-dd'T'HH-mm-ss-fff'Z'");
            report = new PipelineReport { RunId = runId, StartedAt = DateTimeOffset.UtcNow };
        }
        else
        {
            var latestPath = Path.Combine(outputDirectory, "latest-run.json");
            if (!File.Exists(latestPath)) throw new InvalidOperationException("还没有可继续的运行期次，请先从“采集周榜”开始。");
            using var latestDoc = JsonDocument.Parse(await File.ReadAllTextAsync(latestPath, cancellationToken));
            runId = latestDoc.RootElement.GetProperty("runId").GetString() ?? throw new InvalidOperationException("最近运行期次记录无效。");
            ValidateInputs(startIndex, Path.Combine(outputDirectory, runId));
            var reportPath = Path.Combine(outputDirectory, runId, "run-report.json");
            report = File.Exists(reportPath)
                ? JsonSerializer.Deserialize<PipelineReport>(await File.ReadAllTextAsync(reportPath, cancellationToken)) ?? new PipelineReport()
                : new PipelineReport { RunId = runId, StartedAt = Directory.GetCreationTimeUtc(Path.Combine(outputDirectory, runId)) };
            report.RunId = runId;
            report.CompletedNodes ??= [];
            report.NodeDurationsSeconds ??= [];
            report.FinishedAt = null;
            report.Error = null;
            report.FailedAt = null;
            report.Status = "running";
        }

        RunIdChanged?.Invoke(runId);
        var runDirectory = Path.Combine(outputDirectory, runId);
        Directory.CreateDirectory(runDirectory);
        var reportFile = Path.Combine(runDirectory, "run-report.json");
        await SaveLatestRunAsync(outputDirectory, runId);
        // Starting at a later node means the required input files are already
        // present. Keep those earlier nodes marked complete even when the
        // previous run was started from an individual node and its report did
        // not contain the earlier completion markers.
        report.CompletedNodes = Enumerable.Range(1, startIndex).Select(node => $"节点 {node}").ToList();
        await SaveReportAsync(reportFile, report, cancellationToken);

        try
        {
            for (var index = startIndex; index < Commands.Length; index++)
            {
                cancellationToken.ThrowIfCancellationRequested();
                _activeIndex = index;
                _activeStartedAt = DateTimeOffset.UtcNow;
                _compressingScript = false;
                _modelActivity = "生成讲稿";
                _modelRetry = "";
                _modelProject = "";
                StepChanged?.Invoke(index, "运行中", 2);
                LogLine?.Invoke($"\n── 节点 {index + 1}/5 · {Labels[index]} ──");
                var node = environment.NodeExecutable ?? throw new InvalidOperationException("找不到 Node.js。请先到“环境与下载”安装运行环境。");
                var cliRunner = Path.Combine(projectDirectory, "node_modules", "tsx", "dist", "cli.mjs");
                var cliEntry = Path.Combine(projectDirectory, "src", "cli.ts");
                var env = CreateProcessEnvironment(settings, projectDirectory, outputDirectory);

                await processes.RunCheckedAsync(node, [cliRunner, cliEntry, Commands[index], "--run-id", runId], projectDirectory, env,
                    line =>
                    {
                        LogLine?.Invoke(line);
                        if (line.StartsWith("[节点 3]", StringComparison.Ordinal)) UpdateModelActivity(line);
                        if (index == 3 && !_compressingScript &&
                            (line.StartsWith("[节点 4] 等待讲稿压缩", StringComparison.Ordinal) || line.StartsWith("[节点 3]", StringComparison.Ordinal)))
                        {
                            _compressingScript = true;
                            StepChanged?.Invoke(3, "等待讲稿压缩", 0);
                            StepChanged?.Invoke(2, "运行中", 2);
                            OverallProgressChanged?.Invoke(2, Commands.Length);
                        }
                        if (index == 3 && _compressingScript && line.StartsWith("[节点 4] 节点 3 修订完成", StringComparison.Ordinal))
                        {
                            _compressingScript = false;
                            StepChanged?.Invoke(2, "已完成", 100);
                            StepChanged?.Invoke(3, "运行中", 2);
                            OverallProgressChanged?.Invoke(3, Commands.Length);
                            return;
                        }
                        var progressIndex = _compressingScript ? 2 : index;
                        var match = System.Text.RegularExpressions.Regex.Match(line, @"^\[节点 (\d)\] (\d+)/(\d+)\s");
                        if (match.Success && int.TryParse(match.Groups[1].Value, out var loggedNode) && loggedNode == progressIndex + 1 &&
                            int.TryParse(match.Groups[2].Value, out var current) && int.TryParse(match.Groups[3].Value, out var total))
                            StepChanged?.Invoke(progressIndex, "运行中", Math.Clamp((int)(current * 100.0 / Math.Max(total, 1)), 2, 95));
                        if (_compressingScript) return;
                        var percent = System.Text.RegularExpressions.Regex.Match(line, @"(?:构建|渲染).*?(\d{1,3})%");
                        if (percent.Success && int.TryParse(percent.Groups[1].Value, out var value))
                            StepChanged?.Invoke(index, "运行中", Math.Clamp(value, 2, 98));
                    }, cancellationToken);

                var label = $"节点 {index + 1}";
                if (!report.CompletedNodes.Contains(label)) report.CompletedNodes.Add(label);
                report.Status = "running";
                if (_activeStartedAt.HasValue)
                    report.NodeDurationsSeconds[$"节点 {index + 1}"] = Math.Max(0.1, (DateTimeOffset.UtcNow - _activeStartedAt.Value).TotalSeconds);
                await SaveReportAsync(reportFile, report, cancellationToken);
                StepChanged?.Invoke(index, "已完成", 100);
                OverallProgressChanged?.Invoke(index + 1, Commands.Length);
                LogLine?.Invoke($"节点 {index + 1} 完成：{Labels[index]}");
            }

            report.Status = "nodes-1-to-5-complete";
            report.FinishedAt = DateTimeOffset.UtcNow;
            await SaveReportAsync(reportFile, report, cancellationToken);
            LogLine?.Invoke("本期全部 5 个节点已完成。");
        }
        catch (OperationCanceledException)
        {
            report.Status = "failed";
            report.FailedAt = $"节点 {_activeIndex + 1}";
            report.Error = "已停止当前运行。";
            report.FinishedAt = DateTimeOffset.UtcNow;
            SaveActiveDuration(report);
            await SaveReportAsync(reportFile, report, CancellationToken.None);
            LogLine?.Invoke("已停止运行。");
            throw;
        }
        catch (Exception error)
        {
            var failedIndex = FindActiveStepIndex();
            if (failedIndex < 0) failedIndex = startIndex;
            // Node 4 can call the model on behalf of Node 3 to shorten an
            // overlong script. Expose that failure as Node 3 so the desktop
            // continuation starts at the model step instead of jumping back
            // into the audio step with the same stale script.
            if (failedIndex == 3 && (_compressingScript || error.Message.Contains("自动压缩讲稿", StringComparison.Ordinal))) failedIndex = 2;
            report.Status = "failed";
            report.FailedAt = $"节点 {failedIndex + 1}";
            report.Error = error.Message;
            report.FinishedAt = DateTimeOffset.UtcNow;
            SaveActiveDuration(report);
            await SaveReportAsync(reportFile, report, CancellationToken.None);
            StepChanged?.Invoke(failedIndex, "失败", 0);
            LogLine?.Invoke($"运行失败：{error.Message}");
            throw;
        }
    }

    public static string[] StepLabels => Labels;
    public static bool IsStepCompleted(PipelineReport report, int index) =>
        report.CompletedNodes?.Any(label => label == $"节点 {index + 1}" || label == Labels[index]) == true;

    private int _activeIndex;
    private bool _compressingScript;
    private string _modelActivity = "生成讲稿";
    private string _modelRetry = "";
    private string _modelProject = "";
    private DateTimeOffset? _activeStartedAt;
    private int FindActiveStepIndex() => _activeIndex;

    private void UpdateModelActivity(string line)
    {
        if (line.Contains("讲稿格式需要修复", StringComparison.Ordinal)) _modelActivity = "修复讲稿";
        else if (line.Contains("自动压缩", StringComparison.Ordinal) || line.Contains("正在压缩", StringComparison.Ordinal)) _modelActivity = "压缩讲稿";
        else if (line.StartsWith("[节点 3] 正在生成 ", StringComparison.Ordinal)) _modelActivity = "生成讲稿";
        if (line.StartsWith("[节点 3] 请求接口：", StringComparison.Ordinal)) _modelRetry = "";
        var project = System.Text.RegularExpressions.Regex.Match(line, @"^\[节点 3\] 正在生成 (.+?) 的九段讲稿（(\d+)/(\d+)）");
        if (project.Success) _modelProject = $"{project.Groups[2].Value}/{project.Groups[3].Value} {project.Groups[1].Value}";
        var retry = System.Text.RegularExpressions.Regex.Match(line, @"(?:网络波动|服务无响应)，正在重试（第 (\d+)/(\d+) 次）");
        var received = System.Text.RegularExpressions.Regex.Match(line, @"已接收 (\d+) 字符");
        if (retry.Success) _modelRetry = $"网络重试 {retry.Groups[1].Value}/{retry.Groups[2].Value}";
        var phase = string.IsNullOrEmpty(_modelRetry) ? _modelActivity : _modelRetry;
        var activity = received.Success ? $"{phase} · 已接收 {received.Groups[1].Value} 字符"
            : line.Contains("等待服务响应", StringComparison.Ordinal) ? $"{phase} · 等待服务响应"
            : line.Contains("已连接", StringComparison.Ordinal) ? $"{phase} · 已连接，等待正文"
            : phase;
        if (!string.IsNullOrEmpty(_modelProject)) activity = $"{_modelProject} · {activity}";
        StepActivityChanged?.Invoke(2, activity);
    }

    private void SaveActiveDuration(PipelineReport report)
    {
        if (_activeStartedAt.HasValue)
            report.NodeDurationsSeconds[$"节点 {_activeIndex + 1}"] = Math.Max(0.1, (DateTimeOffset.UtcNow - _activeStartedAt.Value).TotalSeconds);
    }

    private static Dictionary<string, string?> CreateProcessEnvironment(AppSettings settings, string projectDirectory, string outputDirectory)
    {
        var python = Path.Combine(projectDirectory, ".venv-kokoro", "Scripts", "python.exe");
        var env = new Dictionary<string, string?>
        {
            ["OPENAI_BASE_URL"] = AppSettings.ResolveModelBaseUrl(settings.OpenAiBaseUrl, settings.OpenAiApiKey),
            ["OPENAI_MODEL"] = settings.OpenAiModel.Trim(),
            ["OPENAI_REASONING_EFFORT"] = AppSettings.NormalizeReasoningEffort(settings.OpenAiReasoningEffort),
            ["OPENAI_API_KEY"] = settings.OpenAiApiKey,
            ["GITHUB_TOKEN"] = settings.GithubToken,
            ["GITHUB_TOP_N"] = Math.Clamp(settings.TrendingTopN, 1, 20).ToString(CultureInfo.InvariantCulture),
            ["KOKORO_MODEL"] = settings.KokoroModel,
            ["KOKORO_VOICE"] = settings.KokoroVoice,
            ["KOKORO_DEVICE"] = settings.KokoroDevice,
            ["KOKORO_SPEED"] = settings.KokoroSpeed.ToString(CultureInfo.InvariantCulture),
            ["KOKORO_PYTHON"] = File.Exists(python) ? python : "python",
            ["KOKORO_CACHE_DIR"] = Path.Combine(projectDirectory, ".cache", "kokoro"),
            ["VIDEO_BACKGROUND_PATH"] = settings.VideoBackgroundPath,
            ["GITHUB_TRENDING_OUTPUT_DIR"] = outputDirectory,
            ["PYTHONIOENCODING"] = "utf-8",
            ["HF_HUB_DISABLE_XET"] = "1",
            ["HF_HUB_DISABLE_SYMLINKS_WARNING"] = "1",
        };
        var modelUri = Uri.TryCreate(env["OPENAI_BASE_URL"], UriKind.Absolute, out var parsedUri)
            ? parsedUri
            : new Uri("https://api.buzzai.cc/v1");
        var systemProxy = System.Net.WebRequest.DefaultWebProxy;
        if (systemProxy is not null && !systemProxy.IsBypassed(modelUri))
        {
            var proxyUri = systemProxy.GetProxy(modelUri);
            if (proxyUri is not null && proxyUri != modelUri)
            {
                env["HTTP_PROXY"] = proxyUri.AbsoluteUri;
                env["HTTPS_PROXY"] = proxyUri.AbsoluteUri;
                env["NODE_USE_ENV_PROXY"] = "1";
                env["NO_PROXY"] = "localhost,127.0.0.1,::1";
                env["no_proxy"] = "localhost,127.0.0.1,::1";
            }
        }
        if (!string.IsNullOrWhiteSpace(settings.RemotionBrowserExecutable)) env["REMOTION_BROWSER_EXECUTABLE"] = settings.RemotionBrowserExecutable;
        else env["REMOTION_BROWSER_EXECUTABLE"] = "";
        return env;
    }

    private static void ValidateInputs(int startIndex, string runDirectory)
    {
        var requiredFiles = startIndex switch
        {
            1 => new[] { "trending.json" },
            2 => new[] { Path.Combine("repos", "index.json") },
            3 => new[] { Path.Combine("scripts", "index.json") },
            4 => new[] { Path.Combine("audio", "render-projects.json"), "trending.json" },
            _ => []
        };
        var missing = requiredFiles.Where(file => !File.Exists(Path.Combine(runDirectory, file))).ToArray();
        if (missing.Length > 0) throw new InvalidOperationException($"此步骤需要前序结果，但本期缺少：{string.Join("、", missing)}。请从较早节点继续。");
    }

    private static async Task SaveReportAsync(string path, PipelineReport report, CancellationToken cancellationToken)
    {
        var temp = path + ".tmp";
        var json = JsonSerializer.Serialize(report, new JsonSerializerOptions { WriteIndented = true });
        await File.WriteAllTextAsync(temp, json, cancellationToken);
        File.Move(temp, path, true);
    }

    private static Task SaveLatestRunAsync(string outputDirectory, string runId)
    {
        var path = Path.Combine(outputDirectory, "latest-run.json");
        return File.WriteAllTextAsync(path, JsonSerializer.Serialize(new { runId }), CancellationToken.None);
    }
}
