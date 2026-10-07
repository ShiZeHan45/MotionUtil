using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace MotionVideoPipeline.Orchestrator.M1;

public sealed record RankingItem(
    int Rank,
    string ProjectName,
    string RepositoryUrl,
    string Owner,
    long StargazersCount,
    string? Language,
    string Description,
    int? StarsDelta,
    IReadOnlyList<string> Topics,
    bool IsArchived,
    DateTimeOffset CapturedAt,
    string? DefaultBranch = null);

public sealed record RankingSnapshot(
    string SnapshotId,
    string Source,
    string SourceUrl,
    string Period,
    DateTimeOffset FetchedAt,
    IReadOnlyList<RankingItem> Items,
    bool FallbackUsed = false,
    string? Warning = null,
    string? RawContentSha256 = null);

public sealed record RankingFetchResult(HttpStatusCode StatusCode, string Url, string Body, DateTimeOffset FetchedAt);

public interface IRankingSourceAdapter
{
    string SourceId { get; }
    Task<RankingFetchResult> FetchAsync(CancellationToken cancellationToken = default);
    RankingSnapshot Parse(RankingFetchResult response);
}

public sealed class GitHubTrendingSourceAdapter : IRankingSourceAdapter
{
    public const string Url = "https://github.com/trending?since=weekly";
    private readonly HttpClient client;
    public string SourceId => "github-trending-weekly";

    public GitHubTrendingSourceAdapter(HttpClient? client = null)
    {
        this.client = client ?? new HttpClient();
        this.client.DefaultRequestHeaders.UserAgent.ParseAdd("MotionVideoPipeline/1.0");
    }

    public async Task<RankingFetchResult> FetchAsync(CancellationToken cancellationToken = default)
    {
        using var response = await client.GetAsync(Url, cancellationToken);
        var body = await response.Content.ReadAsStringAsync(cancellationToken);
        return new RankingFetchResult(response.StatusCode, Url, body, DateTimeOffset.UtcNow);
    }

    public RankingSnapshot Parse(RankingFetchResult response)
    {
        if (!response.StatusCode.ToString().StartsWith("OK", StringComparison.Ordinal) &&
            response.StatusCode != HttpStatusCode.OK)
            throw new InvalidOperationException($"GitHub 周榜请求失败：HTTP {(int)response.StatusCode}");

        var items = TrendingHtmlParser.Parse(response.Body, response.FetchedAt);
        var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(response.Body))).ToLowerInvariant();
        return new RankingSnapshot(Guid.NewGuid().ToString("N"), SourceId, response.Url, "weekly", response.FetchedAt, items, false, null, hash);
    }
}

public sealed class GitHubSearchWeeklySourceAdapter : IRankingSourceAdapter
{
    private readonly HttpClient client;
    private readonly string searchUrl;
    public string SourceId => "github-search-weekly";

    public GitHubSearchWeeklySourceAdapter(HttpClient? client = null, string? searchUrl = null)
    {
        this.client = client ?? new HttpClient();
        this.client.DefaultRequestHeaders.UserAgent.ParseAdd("MotionVideoPipeline/1.0");
        this.searchUrl = searchUrl ?? "https://api.github.com/search/repositories?q=pushed:%3E%3D{weekStart}&sort=stars&order=desc&per_page=100";
    }

    public async Task<RankingFetchResult> FetchAsync(CancellationToken cancellationToken = default)
    {
        var weekStart = DateTimeOffset.UtcNow.AddDays(-7).ToString("yyyy-MM-dd");
        var url = searchUrl.Replace("{weekStart}", weekStart, StringComparison.Ordinal);
        using var request = new HttpRequestMessage(HttpMethod.Get, url);
        request.Headers.UserAgent.ParseAdd("MotionVideoPipeline/1.0");
        request.Headers.Accept.ParseAdd("application/vnd.github+json");
        using var response = await client.SendAsync(request, cancellationToken);
        return new RankingFetchResult(response.StatusCode, url, await response.Content.ReadAsStringAsync(cancellationToken), DateTimeOffset.UtcNow);
    }

    public RankingSnapshot Parse(RankingFetchResult response)
    {
        if (response.StatusCode != HttpStatusCode.OK) throw new InvalidOperationException($"GitHub 搜索备用源失败：HTTP {(int)response.StatusCode}");
        using var document = JsonDocument.Parse(response.Body);
        var items = document.RootElement.GetProperty("items").EnumerateArray().Select((item, index) => new RankingItem(
            index + 1,
            item.GetProperty("name").GetString() ?? "unknown",
            item.GetProperty("html_url").GetString() ?? "",
            item.GetProperty("owner").GetProperty("login").GetString() ?? "unknown",
            item.GetProperty("stargazers_count").GetInt64(),
            item.TryGetProperty("language", out var language) && language.ValueKind != JsonValueKind.Null ? language.GetString() : null,
            item.GetProperty("description").GetString() ?? "",
            null,
            item.TryGetProperty("topics", out var topics) ? topics.EnumerateArray().Select(x => x.GetString() ?? "").Where(x => x.Length > 0).ToArray() : Array.Empty<string>(),
            item.GetProperty("archived").GetBoolean(), response.FetchedAt,
            item.TryGetProperty("default_branch", out var branch) ? branch.GetString() : null)).ToArray();
        return new RankingSnapshot(Guid.NewGuid().ToString("N"), SourceId, response.Url, "weekly", response.FetchedAt, items, true,
            "fallback-source-is-not-equivalent-to-trending-ranking",
            Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(response.Body))).ToLowerInvariant());
    }
}

public static class TrendingHtmlParser
{
    private static readonly Regex Row = new("<article\\b[^>]*Box-row[^>]*>(?<body>.*?)</article>", RegexOptions.IgnoreCase | RegexOptions.Singleline | RegexOptions.Compiled);
    private static readonly Regex Repo = new("href=[\"']/(?<owner>[A-Za-z0-9_.-]+)/(?<name>[A-Za-z0-9_.-]+)[\"']", RegexOptions.IgnoreCase | RegexOptions.Compiled);
    private static readonly Regex Stars = new("href=[\"'][^\"']*/stargazers[\"'][^>]*>\\s*(?<value>[0-9,]+)", RegexOptions.IgnoreCase | RegexOptions.Singleline | RegexOptions.Compiled);
    private static readonly Regex Delta = new("(?<value>[0-9,]+)\\s+stars\\s+this\\s+week", RegexOptions.IgnoreCase | RegexOptions.Compiled);
    private static readonly Regex Language = new("itemprop=[\"']programmingLanguage[\"'][^>]*>\\s*(?<value>[^<]+)", RegexOptions.IgnoreCase | RegexOptions.Singleline | RegexOptions.Compiled);

    public static IReadOnlyList<RankingItem> Parse(string html, DateTimeOffset capturedAt)
    {
        if (string.IsNullOrWhiteSpace(html)) throw new ArgumentException("周榜 HTML 为空", nameof(html));
        var result = new List<RankingItem>();
        foreach (Match row in Row.Matches(html))
        {
            var repo = Repo.Match(row.Groups["body"].Value);
            if (!repo.Success) continue;
            var body = StripTags(row.Groups["body"].Value);
            var owner = repo.Groups["owner"].Value;
            var name = repo.Groups["name"].Value;
            var stars = ParseInt(Stars.Match(row.Groups["body"].Value).Groups["value"].Value);
            var delta = ParseInt(Delta.Match(body).Groups["value"].Value);
            var languageMatch = Language.Match(row.Groups["body"].Value);
            result.Add(new RankingItem(result.Count + 1, WebUtility.HtmlDecode(name), $"https://github.com/{owner}/{name}", owner,
                stars, languageMatch.Success ? WebUtility.HtmlDecode(languageMatch.Groups["value"].Value.Trim()) : null,
                body.Trim(), delta == 0 ? null : delta, ParseTopics(row.Groups["body"].Value), false, capturedAt));
        }
        if (result.Count == 0) throw new InvalidDataException("未在 GitHub 周榜 HTML 中解析到项目");
        return result;
    }

    private static int ParseInt(string value) => int.TryParse(value.Replace(",", "", StringComparison.Ordinal), out var parsed) ? parsed : 0;
    private static string StripTags(string input) => WebUtility.HtmlDecode(Regex.Replace(input, "<[^>]+>", " ")).Replace("\\n", " ", StringComparison.Ordinal);

    private static IReadOnlyList<string> ParseTopics(string html)
    {
        var topics = Regex.Matches(html, "(?:topic|Topic)[^>]*>(?<topic>[^<]+)<", RegexOptions.IgnoreCase)
            .Select(match => WebUtility.HtmlDecode(match.Groups["topic"].Value.Trim()))
            .Where(topic => topic.Length > 0 && topic.Length <= 80)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
        return topics;
    }
}

public sealed record CandidateFilter(
    IReadOnlySet<string> Languages,
    long MinStars,
    IReadOnlySet<string> IncludeTopics,
    IReadOnlySet<string> ExcludeTopics,
    IReadOnlySet<string> ExcludedRepositories,
    IReadOnlySet<string> GeneratedRepositories,
    bool ExcludeArchived = true,
    IReadOnlyDictionary<string, DateTimeOffset>? GeneratedRepositoryDates = null,
    int ExcludeGeneratedWithinDays = 0);

public sealed record CandidateSelection(IReadOnlyList<RankingItem> Candidates, IReadOnlyList<string> Warnings, bool Failed);

public sealed class CandidateSelector
{
    public CandidateSelection Select(RankingSnapshot snapshot, int batchCount, CandidateFilter filter, string shortagePolicy)
    {
        if (batchCount is < 1 or > 100) throw new ArgumentOutOfRangeException(nameof(batchCount));
        if (filter.ExcludeGeneratedWithinDays < 0) throw new ArgumentOutOfRangeException(nameof(filter.ExcludeGeneratedWithinDays));
        var now = DateTimeOffset.UtcNow;
        var generatedDates = filter.GeneratedRepositoryDates is null
            ? new Dictionary<string, DateTimeOffset>(StringComparer.OrdinalIgnoreCase)
            : filter.GeneratedRepositoryDates.ToDictionary(pair => pair.Key, pair => pair.Value, StringComparer.OrdinalIgnoreCase);
        var filtered = snapshot.Items
            .GroupBy(x => x.RepositoryUrl, StringComparer.OrdinalIgnoreCase).Select(x => x.OrderBy(y => y.Rank).First())
            .Where(x => !filter.ExcludeArchived || !x.IsArchived)
            .Where(x => filter.Languages.Count == 0 || (x.Language is not null && filter.Languages.Contains(x.Language)))
            .Where(x => x.StargazersCount >= filter.MinStars)
            .Where(x => filter.ExcludedRepositories.Count == 0 || !filter.ExcludedRepositories.Contains(x.RepositoryUrl))
            .Where(x => filter.GeneratedRepositories.Count == 0 || !filter.GeneratedRepositories.Contains(x.RepositoryUrl))
            .Where(x => !generatedDates.TryGetValue(x.RepositoryUrl, out var generatedAt) ||
                        filter.ExcludeGeneratedWithinDays == 0 ||
                        generatedAt > now || now - generatedAt > TimeSpan.FromDays(filter.ExcludeGeneratedWithinDays))
            .Where(x => filter.IncludeTopics.Count == 0 || filter.IncludeTopics.Any(x.Topics.Contains))
            .Where(x => !filter.ExcludeTopics.Any(x.Topics.Contains))
            .OrderBy(x => x.Rank).ToArray();
        var selected = filtered.Take(batchCount).ToArray();
        var warnings = new List<string>();
        if (selected.Length < batchCount)
        {
            warnings.Add($"候选项目不足：需要 {batchCount} 个，实际 {selected.Length} 个。");
            if (shortagePolicy == "fail-task") return new CandidateSelection(selected, warnings, true);
        }
        return new CandidateSelection(selected, warnings, false);
    }

    public static IReadOnlyDictionary<string, DateTimeOffset> LoadCompletedRunDates(string artifactsRoot)
    {
        var result = new Dictionary<string, DateTimeOffset>(StringComparer.OrdinalIgnoreCase);
        var runsRoot = Path.Combine(Path.GetFullPath(artifactsRoot), "runs");
        if (!Directory.Exists(runsRoot)) return result;
        foreach (var path in Directory.EnumerateFiles(runsRoot, "run.json", SearchOption.AllDirectories))
        {
            try
            {
                using var document = JsonDocument.Parse(File.ReadAllText(path));
                var root = document.RootElement;
                if (!string.Equals(root.GetProperty("status").GetString(), "completed", StringComparison.OrdinalIgnoreCase)) continue;
                var repositoryUrl = root.GetProperty("repositoryUrl").GetString();
                if (string.IsNullOrWhiteSpace(repositoryUrl)) continue;
                if (!root.TryGetProperty("completedAt", out var completedAt) || !DateTimeOffset.TryParse(completedAt.GetString(), out var timestamp)) continue;
                if (!result.TryGetValue(repositoryUrl, out var previous) || timestamp > previous) result[repositoryUrl] = timestamp;
            }
            catch (JsonException) { }
            catch (IOException) { }
        }
        return result;
    }
}

public enum ProjectRunStatus { Pending, Running, Completed, Failed, Quarantined, Cancelled }
public sealed record BatchProjectRun(string ProjectId, string RepositoryUrl, ProjectRunStatus Status, string? Error = null);
public sealed record BatchTaskState(string TaskId, IReadOnlyList<BatchProjectRun> Projects, string Status, IReadOnlyList<string> Warnings);

public sealed class BatchTaskStateMachine
{
    private readonly Dictionary<string, BatchProjectRun> projects = new(StringComparer.Ordinal);
    private readonly object gate = new();
    public BatchTaskState Start(string taskId, IReadOnlyList<RankingItem> candidates)
    {
        lock (gate)
        {
            projects.Clear();
            foreach (var item in candidates) projects[item.RepositoryUrl] = new($"project-{StableId(item.RepositoryUrl)}", item.RepositoryUrl, ProjectRunStatus.Pending);
            return Snapshot(taskId, "running", []);
        }
    }
    public BatchTaskState MarkRunning(string taskId, string repositoryUrl) { lock (gate) { Update(repositoryUrl, ProjectRunStatus.Running); return Snapshot(taskId, "running", []); } }
    public BatchTaskState Complete(string taskId, string repositoryUrl) { lock (gate) { Update(repositoryUrl, ProjectRunStatus.Completed); return Snapshot(taskId, FinalStatus(), []); } }
    public BatchTaskState Quarantine(string taskId, string repositoryUrl, string error) { lock (gate) { projects[repositoryUrl] = projects[repositoryUrl] with { Status = ProjectRunStatus.Quarantined, Error = error }; return Snapshot(taskId, FinalStatus(), [error]); } }
    public BatchTaskState Cancel(string taskId, string repositoryUrl) { lock (gate) { Update(repositoryUrl, ProjectRunStatus.Cancelled); return Snapshot(taskId, "cancelled", []); } }
    public BatchTaskState GetSnapshot(string taskId) { lock (gate) { return Snapshot(taskId, FinalStatus(), []); } }
    private void Update(string url, ProjectRunStatus status) => projects[url] = projects[url] with { Status = status };
    public BatchTaskState Snapshot(string id) => Snapshot(id, FinalStatus(), []);
    private BatchTaskState Snapshot(string id, string status, IReadOnlyList<string> warnings) => new(id, projects.Values.ToArray(), status, warnings);
    private string FinalStatus()
    {
        if (projects.Count == 0 || projects.Values.Any(x => x.Status is ProjectRunStatus.Pending or ProjectRunStatus.Running)) return "running";
        if (projects.Values.Any(x => x.Status == ProjectRunStatus.Cancelled)) return "cancelled";
        return projects.Values.Any(x => x.Status == ProjectRunStatus.Quarantined) ? "completed-with-quarantine" : "completed";
    }
    private static string StableId(string value) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value))).ToLowerInvariant()[..12];
}

public sealed record WeeklyBatchOptions(
    string TaskId,
    int BatchCount,
    CandidateFilter Filter,
    string ShortagePolicy = "continue-with-available",
    string? SnapshotDirectory = null,
    int ProjectConcurrency = 3);

public sealed record WeeklyBatchResult(
    BatchTaskState State,
    RankingSnapshot Snapshot,
    string SnapshotPath,
    IReadOnlyList<string> Diagnostics);

public sealed class WeeklyBatchOrchestrator
{
    private readonly IRankingSourceAdapter primary;
    private readonly IRankingSourceAdapter fallback;
    private readonly CandidateSelector selector;
    private readonly BatchTaskStateMachine stateMachine;

    public WeeklyBatchOrchestrator(
        IRankingSourceAdapter? primary = null,
        IRankingSourceAdapter? fallback = null,
        CandidateSelector? selector = null,
        BatchTaskStateMachine? stateMachine = null)
    {
        this.primary = primary ?? new GitHubTrendingSourceAdapter();
        this.fallback = fallback ?? new GitHubSearchWeeklySourceAdapter();
        this.selector = selector ?? new CandidateSelector();
        this.stateMachine = stateMachine ?? new BatchTaskStateMachine();
    }

    public async Task<WeeklyBatchResult> RunAsync(
        WeeklyBatchOptions options,
        Func<RankingItem, string, CancellationToken, Task>? executeProject = null,
        CancellationToken cancellationToken = default)
    {
        if (options.BatchCount is < 1 or > 100) throw new ArgumentOutOfRangeException(nameof(options.BatchCount));
        if (options.ProjectConcurrency is < 1 or > 100) throw new ArgumentOutOfRangeException(nameof(options.ProjectConcurrency));
        var diagnostics = new List<string>();
        RankingSnapshot snapshot;
        RankingFetchResult response;
        try
        {
            response = await primary.FetchAsync(cancellationToken);
            snapshot = primary.Parse(response);
        }
        catch (Exception primaryError) when (primaryError is not OperationCanceledException)
        {
            diagnostics.Add($"主榜失败，切换备用源：{primaryError.Message}");
            try
            {
                response = await fallback.FetchAsync(cancellationToken);
                snapshot = fallback.Parse(response);
            }
            catch (Exception fallbackError) when (fallbackError is not OperationCanceledException)
            {
                throw new InvalidOperationException($"周榜主源和备用源均失败。主源：{primaryError.Message}；备用源：{fallbackError.Message}", fallbackError);
            }
        }

        var selection = selector.Select(snapshot, options.BatchCount, options.Filter, options.ShortagePolicy);
        diagnostics.AddRange(selection.Warnings);
        if (selection.Failed) return new WeeklyBatchResult(new BatchTaskState(options.TaskId, [], "failed", diagnostics.Append("候选不足，任务失败").ToArray()), snapshot, await SaveSnapshotAsync(options, snapshot, response), diagnostics.Append("候选不足，任务失败").ToArray());
        var state = stateMachine.Start(options.TaskId, selection.Candidates);
        if (executeProject is not null)
        {
            using var projectGate = new SemaphoreSlim(options.ProjectConcurrency, options.ProjectConcurrency);
            async Task RunCandidateAsync(RankingItem candidate)
            {
                try { await projectGate.WaitAsync(cancellationToken); }
                catch (OperationCanceledException) { stateMachine.Cancel(options.TaskId, candidate.RepositoryUrl); return; }
                try
                {
                    if (cancellationToken.IsCancellationRequested)
                    {
                        stateMachine.Cancel(options.TaskId, candidate.RepositoryUrl);
                        return;
                    }
                    stateMachine.MarkRunning(options.TaskId, candidate.RepositoryUrl);
                    var projectId = stateMachine.GetSnapshot(options.TaskId).Projects.Single(x => x.RepositoryUrl == candidate.RepositoryUrl).ProjectId;
                    await executeProject(candidate, projectId, cancellationToken);
                    stateMachine.Complete(options.TaskId, candidate.RepositoryUrl);
                }
                catch (OperationCanceledException) { stateMachine.Cancel(options.TaskId, candidate.RepositoryUrl); }
                catch (Exception error)
                {
                    var detail = error is M1PipelineException pipelineError
                        ? $"{pipelineError.Code}: {pipelineError.Message}"
                        : error.Message;
                    stateMachine.Quarantine(options.TaskId, candidate.RepositoryUrl, detail);
                }
                finally { projectGate.Release(); }
            }

            var tasks = selection.Candidates.Select(RunCandidateAsync);
            await Task.WhenAll(tasks);
            state = stateMachine.GetSnapshot(options.TaskId);
        }
        return new WeeklyBatchResult(state, snapshot, await SaveSnapshotAsync(options, snapshot, response), diagnostics);
    }

    private static async Task<string> SaveSnapshotAsync(WeeklyBatchOptions options, RankingSnapshot snapshot, RankingFetchResult response)
    {
        var directory = options.SnapshotDirectory ?? Path.Combine(AppContext.BaseDirectory, "project-data", "ranking");
        Directory.CreateDirectory(directory);
        var digest = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(response.Body))).ToLowerInvariant();
        var id = digest[..16];
        var rawPath = Path.Combine(directory, $"weekly-{id}.html");
        var path = Path.Combine(directory, $"weekly-{id}.json");
        await File.WriteAllTextAsync(rawPath, response.Body);
        var snapshotFile = new
        {
            snapshot,
            response = new { sourceUrl = response.Url, statusCode = (int)response.StatusCode, fetchedAt = response.FetchedAt, rawContentSha256 = digest, rawPath }
        };
        await File.WriteAllTextAsync(path, JsonSerializer.Serialize(snapshotFile, new JsonSerializerOptions { WriteIndented = true }));
        return path;
    }
}
