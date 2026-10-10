using System.Text.Json;

namespace GitHubTrendingVideo.Models;

public sealed record LeaderboardRunInfo(string Source, int TopN, string? PeriodStart = null, string? PeriodEnd = null)
{
    public string Name => Source == "star-history" ? "Star History · 涨星周榜" : "GitHub Trending · 热门周榜";
    public string PeriodLabel => PeriodStart is not null && PeriodEnd is not null ? $"{PeriodStart} 至 {PeriodEnd}" : "来源未提供固定起止日期";

    public static async Task<LeaderboardRunInfo?> ReadAsync(string runDirectory, int fallbackTopN, CancellationToken cancellationToken = default)
    {
        var snapshotFile = Path.Combine(runDirectory, "trending.json");
        if (!File.Exists(snapshotFile)) return null;
        using var snapshot = JsonDocument.Parse(await File.ReadAllTextAsync(snapshotFile, cancellationToken));
        var root = snapshot.RootElement;
        var source = "github-trending";
        string? start = null, end = null;
        if (root.TryGetProperty("leaderboard", out var context))
        {
            if (context.TryGetProperty("source", out var sourceValue)) source = AppSettings.NormalizeLeaderboardSource(sourceValue.GetString());
            if (context.TryGetProperty("periodStart", out var startValue)) start = startValue.GetString();
            if (context.TryGetProperty("periodEnd", out var endValue)) end = endValue.GetString();
        }
        var topN = fallbackTopN;
        if (root.TryGetProperty("topN", out var count)) topN = count.GetInt32();
        else
        {
            // Old periods recorded their selected projects in the repository index.
            var indexFile = Path.Combine(runDirectory, "repos", "index.json");
            if (File.Exists(indexFile))
            {
                using var index = JsonDocument.Parse(await File.ReadAllTextAsync(indexFile, cancellationToken));
                topN = index.RootElement.GetArrayLength();
            }
        }
        return new LeaderboardRunInfo(source, Math.Clamp(topN, 1, 20), start, end);
    }
}
