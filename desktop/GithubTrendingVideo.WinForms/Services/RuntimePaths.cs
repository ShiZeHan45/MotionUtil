using GitHubTrendingVideo.Models;

namespace GitHubTrendingVideo.Services;

public sealed class RuntimePaths
{
    public string AppDataRoot { get; } = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "GitHubTrendingVideo");
    public string ManagedNodeDirectory => Path.Combine(AppDataRoot, "runtime", "node");
    public string ManagedNodeExecutable => Path.Combine(ManagedNodeDirectory, "node.exe");
    public string ManagedPythonInstaller => Path.Combine(AppDataRoot, "downloads", "python-3.12.10-amd64.exe");
    public string ManagedPythonDirectory => Path.Combine(AppDataRoot, "runtime", "python312");
    public string ManagedPythonExecutable => Path.Combine(ManagedPythonDirectory, "python.exe");
    public string PnpmDirectory => Path.Combine(AppDataRoot, "runtime", "pnpm");
    public string PnpmCli => Path.Combine(PnpmDirectory, "node_modules", "pnpm", "bin", "pnpm.cjs");
    public string SettingsFile => Path.Combine(AppDataRoot, "settings.json");

    public string ResolveProjectDirectory(AppSettings settings)
    {
        if (Directory.Exists(settings.ProjectDirectory) && IsProjectRoot(settings.ProjectDirectory)) return Path.GetFullPath(settings.ProjectDirectory);

        var start = new DirectoryInfo(AppContext.BaseDirectory);
        while (start is not null)
        {
            if (IsProjectRoot(start.FullName)) return start.FullName;
            start = start.Parent;
        }

        var current = new DirectoryInfo(Environment.CurrentDirectory);
        while (current is not null)
        {
            if (IsProjectRoot(current.FullName)) return current.FullName;
            current = current.Parent;
        }
        return "";
    }

    public static bool IsProjectRoot(string directory) =>
        File.Exists(Path.Combine(directory, "package.json")) &&
        File.Exists(Path.Combine(directory, "src", "cli.ts")) &&
        Directory.Exists(Path.Combine(directory, "src", "video"));

    public string OutputDirectory(AppSettings settings, string projectDirectory)
    {
        if (!string.IsNullOrWhiteSpace(settings.OutputDirectory)) return Path.GetFullPath(settings.OutputDirectory);
        return Path.Combine(projectDirectory, "output");
    }

    public string KokoroPython(string projectDirectory)
    {
        var virtualEnvPython = Path.Combine(projectDirectory, ".venv-kokoro", "Scripts", "python.exe");
        return File.Exists(virtualEnvPython) ? virtualEnvPython : ManagedPythonExecutable;
    }

    public string KokoroCacheDirectory(string projectDirectory) => Path.Combine(projectDirectory, ".cache", "kokoro");

    public string? FindOnPath(string executable)
    {
        var extensions = OperatingSystem.IsWindows()
            ? (Environment.GetEnvironmentVariable("PATHEXT") ?? ".EXE;.CMD;.BAT").Split(';')
            : [""];
        foreach (var directory in (Environment.GetEnvironmentVariable("PATH") ?? "").Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries))
        {
            foreach (var extension in extensions)
            {
                var candidate = Path.Combine(directory.Trim('"'), executable.EndsWith(extension, StringComparison.OrdinalIgnoreCase) ? executable : executable + extension);
                if (File.Exists(candidate)) return candidate;
            }
        }
        return null;
    }
}
