using System.Text.Json;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using MotionVideoPipeline.Contracts;
using MotionVideoPipeline.Orchestrator;
using MotionVideoPipeline.Orchestrator.M1;

namespace MotionVideoPipeline.Tests;

[TestClass]
public class CoreTests
{
    [TestMethod]
    public void Mutex_allows_one_owner()
    {
        using var first = new SingleInstanceGuard("MotionVideoPipeline.M0.Tests");
        Assert.IsTrue(first.TryAcquire());
        var secondAcquired = Task.Run(() =>
        {
            using var second = new SingleInstanceGuard("MotionVideoPipeline.M0.Tests");
            return second.TryAcquire();
        }).GetAwaiter().GetResult();
        Assert.IsFalse(secondAcquired);
    }

    [TestMethod]
    public void Cache_key_is_stable()
    {
        var a = CacheKeyBuilder.Build("node", "1.0", "cfg", new { value = 1 });
        var b = CacheKeyBuilder.Build("node", "1.0", "cfg", new { value = 1 });
        Assert.AreEqual(a, b);
        Assert.AreNotEqual(a, CacheKeyBuilder.Build("node", "1.1", "cfg", new { value = 1 }));
    }

    [TestMethod]
    public void Protocol_round_trips_jsonl()
    {
        var original = WorkerMessage.Create("r1", "n1", "1.0.0", WorkerMessageTypes.Request, new { value = 3 });
        var jsonLine = original.ToJsonLine();
        StringAssert.Contains(jsonLine, "\"requestId\":\"r1\"");
        Assert.IsTrue(WorkerMessage.TryParse(jsonLine, out var parsed, out _));
        Assert.AreEqual("r1", parsed!.RequestId);
        Assert.AreEqual(3, parsed.Payload.GetProperty("value").GetInt32());
    }

    [TestMethod]
    public void Progress_is_clamped_and_aggregated()
    {
        var aggregator = new ProgressAggregator();
        aggregator.Update("a", new NodeProgress(2, "done"));
        aggregator.Update("b", new NodeProgress(-1, "pending"));
        Assert.AreEqual(0.5, aggregator.Overall, 0.0001);
    }

    [TestMethod]
    public async Task Atomic_writer_replaces_target()
    {
        var root = Path.Combine(Path.GetTempPath(), "mvp-" + Guid.NewGuid().ToString("N"));
        var path = Path.Combine(root, "nested", "value.txt");
        await AtomicFileWriter.WriteAsync(path, "one");
        await AtomicFileWriter.WriteAsync(path, "two");
        Assert.AreEqual("two", await File.ReadAllTextAsync(path));
        Assert.IsFalse(Directory.EnumerateFiles(Path.GetDirectoryName(path)!, "*.tmp-*", SearchOption.TopDirectoryOnly).Any());
        Directory.Delete(root, true);
    }

    [TestMethod]
    public async Task Publisher_uses_fixed_root()
    {
        var root = Path.Combine(Path.GetTempPath(), "mvp-artifacts-" + Guid.NewGuid().ToString("N"));
        var path = await new ArtifactPublisher(root).PublishAsync("MotionVideoPipeline.exe", "placeholder");
        Assert.AreEqual(Path.Combine(Path.GetFullPath(root), "MotionVideoPipeline.exe"), path);
        Directory.Delete(root, true);
    }

    [TestMethod]
    public void Trending_html_parser_extracts_ranked_repository()
    {
        var html = "<article class=\"Box-row\"><h2><a href=\"/acme/demo\">acme / demo</a></h2><span itemprop=\"programmingLanguage\">TypeScript</span><a href=\"/acme/demo/stargazers\">12,345</a><span>1,234 stars this week</span></article>";
        var item = TrendingHtmlParser.Parse(html, DateTimeOffset.UtcNow).Single();
        Assert.AreEqual("demo", item.ProjectName);
        Assert.AreEqual("acme", item.Owner);
        Assert.AreEqual(12345, item.StargazersCount);
        Assert.AreEqual(1234, item.StarsDelta);
        Assert.AreEqual("TypeScript", item.Language);
    }

    [TestMethod]
    public void Candidate_selector_filters_deduplicates_and_handles_shortage()
    {
        var now = DateTimeOffset.UtcNow;
        var items = new[]
        {
            new RankingItem(1, "one", "https://github.com/a/one", "a", 100, "C#", "", null, ["tool"], false, now),
            new RankingItem(2, "one-copy", "https://github.com/a/one", "a", 100, "C#", "", null, ["tool"], false, now),
            new RankingItem(3, "two", "https://github.com/a/two", "a", 10, "Python", "", null, ["tool"], false, now)
        };
        var selector = new CandidateSelector();
        var selection = selector.Select(new RankingSnapshot("s", "github-trending-weekly", "https://github.com/trending?since=weekly", "weekly", now, items), 2,
            new CandidateFilter(new HashSet<string>(["C#"]), 0, new HashSet<string>(), new HashSet<string>(), new HashSet<string>(), new HashSet<string>()), "continue-with-available");
        Assert.AreEqual(1, selection.Candidates.Count);
        Assert.IsFalse(selection.Failed);
        Assert.AreEqual(1, selection.Warnings.Count);
    }

    [TestMethod]
    public void Candidate_selector_excludes_recently_completed_repository()
    {
        var now = DateTimeOffset.UtcNow;
        var recent = new RankingItem(1, "recent", "https://github.com/a/recent", "a", 100, "C#", "", null, [], false, now);
        var older = new RankingItem(2, "older", "https://github.com/a/older", "a", 100, "C#", "", null, [], false, now);
        var selection = new CandidateSelector().Select(
            new RankingSnapshot("s", "github-trending-weekly", "https://github.com/trending?since=weekly", "weekly", now, [recent, older]),
            2,
            new CandidateFilter(new HashSet<string>(), 0, new HashSet<string>(), new HashSet<string>(), new HashSet<string>(), new HashSet<string>(), GeneratedRepositoryDates: new Dictionary<string, DateTimeOffset> { [recent.RepositoryUrl] = now.AddDays(-2), [older.RepositoryUrl] = now.AddDays(-31) }, ExcludeGeneratedWithinDays: 30),
            "continue-with-available");
        Assert.AreEqual(1, selection.Candidates.Count);
        Assert.AreEqual(older.RepositoryUrl, selection.Candidates[0].RepositoryUrl);
    }

    [TestMethod]
    public void Batch_state_machine_quarantines_one_project_without_blocking_other()
    {
        var now = DateTimeOffset.UtcNow;
        var items = new[]
        {
            new RankingItem(1, "one", "https://github.com/a/one", "a", 1, null, "", null, [], false, now),
            new RankingItem(2, "two", "https://github.com/a/two", "a", 1, null, "", null, [], false, now)
        };
        var machine = new BatchTaskStateMachine();
        machine.Start("batch-1", items);
        machine.MarkRunning("batch-1", items[0].RepositoryUrl);
        var result = machine.Quarantine("batch-1", items[0].RepositoryUrl, "evidence failed");
        machine.MarkRunning("batch-1", items[1].RepositoryUrl);
        result = machine.Complete("batch-1", items[1].RepositoryUrl);
        Assert.AreEqual("completed-with-quarantine", result.Status);
        Assert.AreEqual(ProjectRunStatus.Quarantined, result.Projects.Single(x => x.RepositoryUrl.EndsWith("/one")).Status);
        Assert.AreEqual(ProjectRunStatus.Completed, result.Projects.Single(x => x.RepositoryUrl.EndsWith("/two")).Status);
    }

    [TestMethod]
    public async Task M1_fixture_pipeline_writes_project_artifacts_without_model_or_network()
    {
        var workspaceInfo = new DirectoryInfo(AppContext.BaseDirectory);
        while (workspaceInfo is not null && !File.Exists(Path.Combine(workspaceInfo.FullName, "voice-catalog.json"))) workspaceInfo = workspaceInfo.Parent;
        Assert.IsNotNull(workspaceInfo, "无法定位新项目工作区");
        var workspace = workspaceInfo!.FullName;
        var root = Path.Combine(Path.GetTempPath(), "mvp-m1-" + Guid.NewGuid().ToString("N"));
        var project = new RankingItem(1, "fixture", "https://github.com/acme/fixture", "acme", 12345, "TypeScript", "fixture", 10, [], false, DateTimeOffset.UtcNow);
        try
        {
            var result = await new M1PipelineRunner().RunProjectAsync(project, "project-fixture", new M1RunOptions(
                workspace, root, Path.Combine(workspace, "voice-catalog.json"), Path.Combine(root, "voice-cache"), FixtureMode: true, SkipRender: true));
            Assert.AreEqual("completed", result.Status);
            var run = Path.Combine(root, "runs", "project-fixture");
            Assert.IsTrue(File.Exists(Path.Combine(run, "storyboard.json")));
            Assert.IsTrue(File.Exists(Path.Combine(run, "evidence-pack.json")));
            Assert.IsTrue(File.Exists(Path.Combine(run, "audio-manifest.json")));
            Assert.IsTrue(File.Exists(Path.Combine(run, "subtitles.srt")));
            Assert.IsTrue(File.Exists(Path.Combine(run, "audio", "opening-1.wav")));
        }
        finally { if (Directory.Exists(root)) Directory.Delete(root, true); }
    }

    [TestMethod]
    public async Task M1_batch_fixture_isolates_evidence_failure_and_keeps_success_artifacts()
    {
        var workspaceInfo = new DirectoryInfo(AppContext.BaseDirectory);
        while (workspaceInfo is not null && !File.Exists(Path.Combine(workspaceInfo.FullName, "voice-catalog.json"))) workspaceInfo = workspaceInfo.Parent;
        Assert.IsNotNull(workspaceInfo, "无法定位新项目工作区");
        var workspace = workspaceInfo!.FullName;
        var root = Path.Combine(Path.GetTempPath(), "mvp-m1-batch-" + Guid.NewGuid().ToString("N"));
        var now = DateTimeOffset.UtcNow;
        var items = new[]
        {
            new RankingItem(1, "success", "https://github.com/acme/success", "acme", 12345, "TypeScript", "fixture", 10, [], false, now),
            new RankingItem(2, "evidence-fails", "https://github.com/acme/evidence-fails", "acme", 23456, "TypeScript", "fixture", 9, [], false, now)
        };
        var adapter = new FixtureRankingAdapter(items);
        try
        {
            using var gates = new M1ConcurrencyGates(3, 2, 1);
            var orchestrator = new WeeklyBatchOrchestrator(primary: adapter, fallback: adapter);
            var runner = new M1PipelineRunner();
            var runOptions = new M1RunOptions(workspace, root, Path.Combine(workspace, "voice-catalog.json"), Path.Combine(root, "voice-cache"), FixtureMode: true, SkipRender: true, ConcurrencyGates: gates);
            var result = await orchestrator.RunAsync(
                new WeeklyBatchOptions("batch-fixture", 2, new CandidateFilter(new HashSet<string>(), 0, new HashSet<string>(), new HashSet<string>(), new HashSet<string>(), new HashSet<string>()), SnapshotDirectory: Path.Combine(root, "ranking")),
                async (project, projectId, token) =>
                {
                    if (project.ProjectName == "evidence-fails") throw new M1PipelineException("EVIDENCE_INSUFFICIENT", "fixture evidence failure");
                    await runner.RunProjectAsync(project, projectId, runOptions, token);
                });

            Assert.AreEqual("completed-with-quarantine", result.State.Status);
            Assert.AreEqual(ProjectRunStatus.Completed, result.State.Projects.Single(x => x.RepositoryUrl.EndsWith("/success")).Status);
            var quarantined = result.State.Projects.Single(x => x.RepositoryUrl.EndsWith("/evidence-fails"));
            Assert.AreEqual(ProjectRunStatus.Quarantined, quarantined.Status);
            StringAssert.Contains(quarantined.Error, "EVIDENCE_INSUFFICIENT");
            var successRun = Path.Combine(root, "runs", result.State.Projects.Single(x => x.RepositoryUrl.EndsWith("/success")).ProjectId);
            foreach (var file in new[] { "storyboard.json", "evidence-pack.json", "audio-manifest.json", "subtitles.srt", "run.log.jsonl" })
                Assert.IsTrue(File.Exists(Path.Combine(successRun, file)), file);
            StringAssert.Contains(await File.ReadAllTextAsync(Path.Combine(successRun, "run.log.jsonl")), "run-completed");
        }
        finally { if (Directory.Exists(root)) Directory.Delete(root, true); }
    }

    private sealed class FixtureRankingAdapter : IRankingSourceAdapter
    {
        private readonly IReadOnlyList<RankingItem> items;
        public FixtureRankingAdapter(IReadOnlyList<RankingItem> items) => this.items = items;
        public string SourceId => "fixture-weekly";
        public Task<RankingFetchResult> FetchAsync(CancellationToken cancellationToken = default) => Task.FromResult(new RankingFetchResult(System.Net.HttpStatusCode.OK, "fixture://weekly", "fixture-ranking", DateTimeOffset.UtcNow));
        public RankingSnapshot Parse(RankingFetchResult response) => new("fixture-snapshot", SourceId, response.Url, "weekly", response.FetchedAt, items);
    }
}
