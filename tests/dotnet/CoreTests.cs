using System.Text.Json;
using Microsoft.VisualStudio.TestTools.UnitTesting;
using MotionVideoPipeline.Contracts;
using MotionVideoPipeline.Orchestrator;

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
        Assert.IsTrue(WorkerMessage.TryParse(original.ToJsonLine(), out var parsed, out _));
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
}
