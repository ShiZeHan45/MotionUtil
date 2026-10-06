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
}
