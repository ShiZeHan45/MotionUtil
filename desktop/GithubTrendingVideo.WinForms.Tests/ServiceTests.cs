using GitHubTrendingVideo.Models;
using GitHubTrendingVideo.Services;

namespace GithubTrendingVideo.WinForms.Tests;

[TestClass]
public sealed class ServiceTests
{
    [TestMethod]
    public void Runtime_paths_recognize_the_repository_root_and_resolve_custom_output()
    {
        var paths = new RuntimePaths();
        var project = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", ".."));
        Assert.IsTrue(RuntimePaths.IsProjectRoot(project), $"Expected the repository root to be recognized: {project}");
        var settings = new AppSettings { OutputDirectory = Path.Combine(Path.GetTempPath(), "github-trending-video-test-output") };
        Assert.AreEqual(Path.GetFullPath(settings.OutputDirectory), paths.OutputDirectory(settings, project));
    }

    [TestMethod]
    public void Runtime_paths_find_the_user_level_python312_installation()
    {
        var paths = new RuntimePaths();
        var python = paths.FindPython312Executable();
        Assert.IsNotNull(python, "Python 3.12 should be discoverable in the managed or standard Windows install directories.");
        StringAssert.Contains(python!, "Python312", "The fallback must resolve a Python 3.12 installation.");
        Assert.IsTrue(File.Exists(python));
    }

    [TestMethod]
    public void Runtime_paths_prefer_the_project_virtual_environment()
    {
        var project = Path.Combine(Path.GetTempPath(), "github-trending-video-venv-test", Guid.NewGuid().ToString("N"));
        var python = Path.Combine(project, ".venv-kokoro", "Scripts", "python.exe");
        Directory.CreateDirectory(Path.GetDirectoryName(python)!);
        File.WriteAllBytes(python, []);
        try
        {
            var paths = new RuntimePaths();
            Assert.AreEqual(Path.GetFullPath(python), paths.KokoroPython(project));
        }
        finally { Directory.Delete(project, true); }
    }

    [TestMethod]
    public async Task Environment_check_reports_the_existing_kokoro_venv_as_ready()
    {
        var project = FindRepositoryRoot();
        var paths = new RuntimePaths();
        var service = new EnvironmentService(paths, new ProcessRunner());
        var items = await service.CheckAsync(new AppSettings(), project);
        var item = items.Single(x => x.Id == "python");
        Assert.AreEqual(EnvironmentCheckState.Ready, item.State, item.Detail);
        StringAssert.Contains(item.Detail, ".venv-kokoro");
    }

    [TestMethod]
    public async Task Process_runner_reports_output_and_non_zero_exit_codes()
    {
        var runner = new ProcessRunner();
        var result = await runner.RunAsync("cmd.exe", ["/c", "echo", "hello"], Environment.CurrentDirectory);
        Assert.AreEqual(0, result.ExitCode);
        StringAssert.Contains(result.StandardOutput, "hello");

        var error = await Assert.ThrowsExceptionAsync<InvalidOperationException>(() =>
            runner.RunCheckedAsync("cmd.exe", ["/c", "exit", "7"], Environment.CurrentDirectory));
        StringAssert.Contains(error.Message, "退出代码 7");
    }

    [TestMethod]
    public async Task Pipeline_rejects_invalid_step_before_starting_a_process()
    {
        var paths = new RuntimePaths();
        var environment = new EnvironmentService(paths, new ProcessRunner());
        var pipeline = new PipelineService(paths, new ProcessRunner(), environment);
        await Assert.ThrowsExceptionAsync<ArgumentOutOfRangeException>(() =>
            pipeline.RunFromStepAsync(5, new AppSettings(), Environment.CurrentDirectory, CancellationToken.None));
    }

    [TestMethod]
    public async Task Pipeline_continuation_explains_when_there_is_no_previous_run()
    {
        var paths = new RuntimePaths();
        var environment = new EnvironmentService(paths, new ProcessRunner());
        var pipeline = new PipelineService(paths, new ProcessRunner(), environment);
        var settings = new AppSettings { OutputDirectory = Path.Combine(Path.GetTempPath(), "github-trending-video-empty-run") };
        Directory.CreateDirectory(settings.OutputDirectory);
        var error = await Assert.ThrowsExceptionAsync<InvalidOperationException>(() =>
            pipeline.RunFromStepAsync(1, settings, Environment.CurrentDirectory, CancellationToken.None));
        StringAssert.Contains(error.Message, "还没有可继续的运行期次");
    }

    private static string FindRepositoryRoot()
    {
        var current = new DirectoryInfo(AppContext.BaseDirectory);
        while (current is not null)
        {
            if (RuntimePaths.IsProjectRoot(current.FullName)) return current.FullName;
            current = current.Parent;
        }
        throw new AssertFailedException("Could not locate the repository root from the test output directory.");
    }
}
