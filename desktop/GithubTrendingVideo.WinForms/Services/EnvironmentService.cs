using System.IO.Compression;
using System.Net;
using System.Text;
using GitHubTrendingVideo.Models;

namespace GitHubTrendingVideo.Services;

public sealed class EnvironmentService(RuntimePaths paths, ProcessRunner processes)
{
    private const string NodeVersion = "v22.16.0";
    private const string PythonVersion = "3.12.10";
    private static readonly HttpClient Http = new() { Timeout = TimeSpan.FromMinutes(10) };

    public string? NodeExecutable => File.Exists(paths.ManagedNodeExecutable)
        ? paths.ManagedNodeExecutable
        : FindUsableSystemNode();

    public string PythonExecutable(string projectDirectory) => paths.KokoroPython(projectDirectory);

    public async Task<IReadOnlyList<EnvironmentItem>> CheckAsync(AppSettings settings, string projectDirectory, CancellationToken cancellationToken = default)
    {
        var result = new List<EnvironmentItem>();
        var node = NodeExecutable;
        if (node is null)
        {
            result.Add(new("node", "Node.js 22", "运行工作流与 Remotion 的 JavaScript 运行环境。", EnvironmentCheckState.Missing, "未找到 Node.js 22 或更新版本（下载约 35 MB）。", "下载 Node.js"));
        }
        else
        {
            var version = await GetVersionAsync(node, projectDirectory, cancellationToken);
            var parsed = ParseVersion(version);
            var valid = parsed.major >= 22;
            result.Add(new("node", "Node.js 22", "运行工作流与 Remotion 的 JavaScript 运行环境。", valid ? EnvironmentCheckState.Ready : EnvironmentCheckState.Missing, valid ? $"已就绪 · {version} · {node}" : $"需要 22 或更新版本，当前为 {version}。", valid ? "已安装" : "下载新版"));
        }

        var nodeModules = Path.Combine(projectDirectory, "node_modules");
        var depsReady = File.Exists(Path.Combine(nodeModules, "tsx", "dist", "cli.mjs")) &&
                        File.Exists(Path.Combine(nodeModules, "@remotion", "renderer", "package.json")) &&
                        File.Exists(Path.Combine(nodeModules, "@remotion", "bundler", "package.json"));
        result.Add(new("js-deps", "项目处理组件", "包括 Remotion、脚本流程和渲染依赖，按项目锁文件安装。", depsReady ? EnvironmentCheckState.Ready : EnvironmentCheckState.Missing, depsReady ? "已安装 · pnpm-lock.yaml 锁定版本" : "尚未安装或安装不完整（大小取决于锁定依赖）。", depsReady ? "已安装" : "安装组件"));

        var python = PythonExecutable(projectDirectory);
        var pythonReady = File.Exists(python);
        var pythonDetail = "尚未安装项目配音环境。";
        if (pythonReady)
        {
            var version = await GetVersionAsync(python, projectDirectory, cancellationToken);
            pythonDetail = $"Python {version} · {python}";
            if (ParseVersion(version).major != 3 || ParseVersion(version).minor != 12)
            {
                pythonReady = false;
                pythonDetail = $"需要 Python 3.12，当前为 {version}。";
            }
            else
            {
                var imports = await processes.RunAsync(python,
                    ["-c", "import importlib.util,json; names=['torch','kokoro','misaki','soundfile','huggingface_hub']; print(json.dumps({n: importlib.util.find_spec(n) is not None for n in names}))"],
                    projectDirectory, cancellationToken: cancellationToken);
                if (imports.ExitCode == 0)
                {
                    var json = imports.StandardOutput.Split('\n', StringSplitOptions.RemoveEmptyEntries).LastOrDefault();
                    try
                    {
                        var packages = System.Text.Json.JsonSerializer.Deserialize<Dictionary<string, bool>>(json ?? "{}");
                        var missing = packages?.Where(p => !p.Value).Select(p => p.Key).ToArray() ?? [];
                        if (missing.Length > 0)
                        {
                            pythonReady = false;
                            pythonDetail = $"Python 已安装，但配音组件缺少：{string.Join("、", missing)}。";
                        }
                    }
                    catch { pythonReady = false; pythonDetail = "无法读取 Python 配音组件状态。"; }
                }
                else { pythonReady = false; pythonDetail = "Python 已安装，但检查配音组件失败。"; }
            }
        }
        result.Add(new("python", "Kokoro 配音环境", "隔离的 Python 3.12 环境和 CPU 版 PyTorch、Kokoro 中文语音组件。", pythonReady ? EnvironmentCheckState.Ready : EnvironmentCheckState.Missing, pythonReady ? $"已就绪 · {pythonDetail}" : $"{pythonDetail}（Python 安装程序约 26 MB，配音运行库另计）", pythonReady ? "已安装" : "安装配音环境"));

        var modelFolder = Path.Combine(paths.KokoroCacheDirectory(projectDirectory), "hub", "models--" + settings.KokoroModel.Replace("/", "--", StringComparison.Ordinal));
        var snapshotsDirectory = Path.Combine(modelFolder, "snapshots");
        var modelReady = Directory.Exists(snapshotsDirectory) && Directory.EnumerateDirectories(snapshotsDirectory).Any();
        result.Add(new("model", "Kokoro 中文语音模型", "本地配音所需模型，首次下载后可离线重复使用。", modelReady ? EnvironmentCheckState.Ready : EnvironmentCheckState.Missing, modelReady ? $"已下载 · {settings.KokoroModel}" : $"尚未下载 · {settings.KokoroModel}（约 350 MB）", modelReady ? "已下载" : "下载模型"));

        var browser = Path.Combine(nodeModules, ".remotion", "chrome-headless-shell", "win64", "chrome-headless-shell-win64", "chrome-headless-shell.exe");
        var browserReady = File.Exists(browser) && File.Exists(Path.Combine(nodeModules, ".remotion", "chrome-headless-shell", "VERSION"));
        if (!string.IsNullOrWhiteSpace(settings.RemotionBrowserExecutable) && File.Exists(settings.RemotionBrowserExecutable))
        {
            browserReady = true;
            browser = settings.RemotionBrowserExecutable;
        }
        result.Add(new("browser", "Remotion 渲染浏览器", "用于把场景动画渲染成 H.264/AAC 视频。", browserReady ? EnvironmentCheckState.Ready : EnvironmentCheckState.Missing, browserReady ? $"已就绪 · {browser}" : "未找到 Remotion Headless Chrome。", browserReady ? "已安装" : "检查/下载浏览器"));
        return result;
    }

    public async Task InstallNodeAsync(IProgress<(long done, long? total)>? progress, Action<string> log, CancellationToken cancellationToken)
    {
        Directory.CreateDirectory(paths.AppDataRoot);
        var archive = Path.Combine(paths.AppDataRoot, "downloads", $"node-{NodeVersion}-win-x64.zip");
        await DownloadAsync($"https://nodejs.org/dist/{NodeVersion}/node-{NodeVersion}-win-x64.zip", archive, progress, cancellationToken);
        log("正在展开 Node.js 运行环境…");
        var extractRoot = Path.Combine(paths.AppDataRoot, "runtime", "node-extract");
        if (Directory.Exists(extractRoot)) Directory.Delete(extractRoot, true);
        Directory.CreateDirectory(extractRoot);
        ZipFile.ExtractToDirectory(archive, extractRoot, true);
        var source = Path.Combine(extractRoot, $"node-{NodeVersion}-win-x64");
        Directory.CreateDirectory(paths.ManagedNodeDirectory);
        foreach (var file in Directory.EnumerateFiles(source, "*", SearchOption.AllDirectories))
        {
            var relative = Path.GetRelativePath(source, file);
            var target = Path.Combine(paths.ManagedNodeDirectory, relative);
            Directory.CreateDirectory(Path.GetDirectoryName(target)!);
            File.Copy(file, target, true);
        }
        Directory.Delete(extractRoot, true);
        File.Delete(archive);
        log($"Node.js {NodeVersion} 已安装到应用管理目录。后续更新由软件单独维护。 ");
    }

    public async Task InstallProjectDependenciesAsync(string projectDirectory, Action<string> log, CancellationToken cancellationToken)
    {
        var node = NodeExecutable ?? throw new InvalidOperationException("请先安装 Node.js 22。");
        var nodeDirectory = Path.GetDirectoryName(node)!;
        var pnpm = paths.PnpmCli;
        if (!File.Exists(pnpm))
        {
            var npm = Path.Combine(nodeDirectory, "node_modules", "npm", "bin", "npm-cli.js");
            if (!File.Exists(npm)) throw new InvalidOperationException("当前 Node.js 安装中没有 npm。请先从软件内安装 Node.js 运行环境，再安装项目组件。");
            Directory.CreateDirectory(paths.PnpmDirectory);
            log("正在获取 pnpm 包管理器…");
            await processes.RunCheckedAsync(node, [npm, "install", "--global", "--prefix", paths.PnpmDirectory, "pnpm@10"], projectDirectory, onLine: log, cancellationToken: cancellationToken);
            pnpm = paths.PnpmCli;
        }
        log("正在按照 pnpm-lock.yaml 安装项目组件…首次可能需要几分钟。");
        await processes.RunCheckedAsync(node, [pnpm, "install", "--frozen-lockfile", "--reporter", "append-only"], projectDirectory, onLine: log, cancellationToken: cancellationToken);
        log("项目组件安装完成。");
    }

    public async Task InstallKokoroAsync(string projectDirectory, IProgress<(long done, long? total)>? progress, Action<string> log, CancellationToken cancellationToken)
    {
        var python = paths.ManagedPythonExecutable;
        Directory.CreateDirectory(Path.GetDirectoryName(paths.ManagedPythonInstaller)!);
        if (!File.Exists(python))
        {
            await DownloadAsync($"https://www.python.org/ftp/python/{PythonVersion}/python-{PythonVersion}-amd64.exe", paths.ManagedPythonInstaller, progress, cancellationToken);
            log("正在以当前 Windows 用户安装 Python 3.12…");
            var args = new[] { "/quiet", "InstallAllUsers=0", "PrependPath=0", "Shortcuts=0", "Include_doc=0", "Include_test=0", "Include_launcher=0", "Include_tcltk=0", "Include_pip=1", $"TargetDir={paths.ManagedPythonDirectory}" };
            var result = await processes.RunAsync(paths.ManagedPythonInstaller, args, projectDirectory, cancellationToken: cancellationToken);
            if (result.ExitCode is not (0 or 3010)) throw new InvalidOperationException($"Python 安装程序退出代码 {result.ExitCode}。请重试；若安装窗口被系统阻止，请检查 Windows 安全提示。\n{result.StandardError}");
        }
        if (!File.Exists(python)) throw new InvalidOperationException("Python 安装已结束，但没有找到 python.exe。请重试或检查安装日志。");

        var venv = Path.Combine(projectDirectory, ".venv-kokoro");
        var venvPython = Path.Combine(venv, "Scripts", "python.exe");
        if (!File.Exists(venvPython))
        {
            log("正在为本项目创建隔离的 Python 配音环境…");
            await processes.RunCheckedAsync(python, ["-m", "venv", venv], projectDirectory, onLine: log, cancellationToken: cancellationToken);
        }
        log("正在安装 CPU 配音运行库 PyTorch…下载量较大，安装期间可查看实时日志。");
        var env = new Dictionary<string, string?> { ["PIP_DISABLE_PIP_VERSION_CHECK"] = "1", ["PIP_PROGRESS_BAR"] = "on" };
        await processes.RunCheckedAsync(venvPython, ["-m", "pip", "install", "torch", "--index-url", "https://download.pytorch.org/whl/cpu"], projectDirectory, env, log, cancellationToken);
        log("正在安装 Kokoro 中文配音组件…");
        await processes.RunCheckedAsync(venvPython, ["-m", "pip", "install", "kokoro>=0.9.4", "misaki[zh]>=0.8.2", "soundfile", "huggingface_hub"], projectDirectory, env, log, cancellationToken);
        log("Kokoro 配音环境已就绪。");
    }

    public async Task DownloadKokoroModelAsync(AppSettings settings, string projectDirectory, Action<string> log, CancellationToken cancellationToken)
    {
        var python = PythonExecutable(projectDirectory);
        if (!File.Exists(python)) throw new InvalidOperationException("请先安装 Kokoro 配音环境。");
        var script = Path.Combine(projectDirectory, "tools", "ensure_kokoro_model.py");
        var cache = paths.KokoroCacheDirectory(projectDirectory);
        Directory.CreateDirectory(cache);
        var env = new Dictionary<string, string?> { ["HF_HOME"] = cache, ["HF_HUB_DISABLE_XET"] = "1", ["HF_HUB_DISABLE_SYMLINKS_WARNING"] = "1", ["PYTHONIOENCODING"] = "utf-8" };
        await processes.RunCheckedAsync(python, [script, settings.KokoroModel, "download"], projectDirectory, env, log, cancellationToken);
        log("中文语音模型已下载并缓存到本机。");
    }

    public async Task EnsureRemotionBrowserAsync(string projectDirectory, Action<string> log, CancellationToken cancellationToken)
    {
        var node = NodeExecutable ?? throw new InvalidOperationException("请先安装 Node.js。");
        var pnpm = File.Exists(paths.PnpmCli) ? paths.PnpmCli : null;
        if (pnpm is null) throw new InvalidOperationException("请先安装项目处理组件。");
        await processes.RunCheckedAsync(node, [pnpm, "exec", "remotion", "browser", "ensure"], projectDirectory, onLine: log, cancellationToken: cancellationToken);
        log("Remotion 渲染浏览器已可用。");
    }

    private async Task DownloadAsync(string url, string destination, IProgress<(long done, long? total)>? progress, CancellationToken cancellationToken)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(destination)!);
        // Windows 不允许移动仍被当前进程打开的文件；每次下载使用独立临时文件，避免重试和旧进程互相占用。
        var partial = $"{destination}.{Environment.ProcessId}.{Guid.NewGuid():N}.partial";
        try
        {
            using var response = await Http.GetAsync(url, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
            response.EnsureSuccessStatusCode();
            var total = response.Content.Headers.ContentLength;
            long received = 0;
            await using (var source = await response.Content.ReadAsStreamAsync(cancellationToken))
            await using (var target = new FileStream(partial, FileMode.CreateNew, FileAccess.Write, FileShare.None, 131072, true))
            {
                var buffer = new byte[131072];
                int count;
                while ((count = await source.ReadAsync(buffer, cancellationToken)) > 0)
                {
                    await target.WriteAsync(buffer.AsMemory(0, count), cancellationToken);
                    received += count;
                    progress?.Report((received, total));
                }
                await target.FlushAsync(cancellationToken);
            }
            // 上面的 using 块结束后，partial 文件句柄已经释放，Windows 下可以安全替换目标文件。
            File.Move(partial, destination, true);
        }
        catch
        {
            if (File.Exists(partial)) File.Delete(partial);
            throw;
        }
    }

    private string? FindUsableSystemNode()
    {
        var candidate = paths.FindOnPath("node.exe");
        return candidate is not null && !candidate.StartsWith(Path.Combine(paths.AppDataRoot, "runtime"), StringComparison.OrdinalIgnoreCase) ? candidate : null;
    }

    private async Task<string> GetVersionAsync(string executable, string directory, CancellationToken cancellationToken)
    {
        try
        {
            var result = await processes.RunAsync(executable, ["--version"], directory, cancellationToken: cancellationToken);
            if (result.ExitCode == 0) return result.StandardOutput.Trim().Split('\n').LastOrDefault()?.Trim() ?? "未知";
        }
        catch { }
        return "无法读取版本";
    }

    private static (int major, int minor, int patch) ParseVersion(string value)
    {
        var clean = value.Trim().TrimStart('v');
        var parts = clean.Split('.');
        return (int.TryParse(parts.ElementAtOrDefault(0), out var a) ? a : 0, int.TryParse(parts.ElementAtOrDefault(1), out var b) ? b : 0, int.TryParse(parts.ElementAtOrDefault(2), out var c) ? c : 0);
    }
}
