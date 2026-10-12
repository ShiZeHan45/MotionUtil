namespace GitHubTrendingVideo.Models;

public sealed class ModelProvider
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string Name { get; set; } = "";
    public string BaseUrl { get; set; } = "";
    public string DefaultModel { get; set; } = "";
    public string ApiKey { get; set; } = "";
    public string Protocol { get; set; } = "auto";
    public bool CompleteUrl { get; set; }
    public string ReasoningParamType { get; set; } = "auto";
    public string CustomReasoningParam { get; set; } = "";
}

public sealed class AppSettings
{
    public const string BuzzBaseUrl = "https://api.buzzai.cc/v1";

    public static string ResolveModelBaseUrl(string? value, string? apiKey) =>
        apiKey?.Trim().StartsWith("sk-buzz-", StringComparison.Ordinal) == true || string.IsNullOrWhiteSpace(value)
            ? BuzzBaseUrl
            : value.Trim().TrimEnd('/');

    public string ProjectDirectory { get; set; } = "";
    public string OutputDirectory { get; set; } = "";
    public List<ModelProvider> ModelProviders { get; set; } = [];
    public string SelectedProviderId { get; set; } = "";
    public string OpenAiReasoningEffort { get; set; } = "";
    public string GithubToken { get; set; } = "";
    public int TrendingTopN { get; set; } = 5;
    public string LeaderboardSource { get; set; } = "github-trending";
    public string KokoroModel { get; set; } = "hexgrad/Kokoro-82M-v1.1-zh";
    public string KokoroVoice { get; set; } = "zf_001";
    public string KokoroDevice { get; set; } = "cpu";
    public decimal KokoroSpeed { get; set; } = 1.0m;
    public string RemotionBrowserExecutable { get; set; } = "";
    public string VideoBackgroundPath { get; set; } = "";

    public ModelProvider? GetSelectedProvider() => ModelProviders.FirstOrDefault(p => p.Id == SelectedProviderId);

    public static string NormalizeReasoningEffort(string? value) => value?.Trim().ToLowerInvariant() switch
    {
        "low" => "low",
        "medium" => "medium",
        "high" => "high",
        "xhigh" => "xhigh",
        _ => "",
    };

    public static string NormalizeLeaderboardSource(string? value) => value == "star-history" ? "star-history" : "github-trending";

    public static string NormalizeProtocol(string? value) => value?.Trim().ToLowerInvariant() switch
    {
        "responses" => "responses",
        "chat" => "chat",
        _ => "auto",
    };

    public static string NormalizeReasoningParamType(string? value) => value?.Trim().ToLowerInvariant() switch
    {
        "reasoning.effort" => "reasoning.effort",
        "reasoning_effort" => "reasoning_effort",
        "none" => "none",
        "custom" => "custom",
        _ => "auto",
    };
}

public sealed class PipelineReport
{
    public string RunId { get; set; } = "";
    public DateTimeOffset StartedAt { get; set; }
    public DateTimeOffset? FinishedAt { get; set; }
    public string Status { get; set; } = "running";
    public List<string> CompletedNodes { get; set; } = [];
    public string? FailedAt { get; set; }
    public string? Error { get; set; }
    public Dictionary<string, double> NodeDurationsSeconds { get; set; } = [];
    public string LeaderboardSource { get; set; } = "github-trending";
    public int? TopN { get; set; }
}

public sealed record RunSummary(string RunId, string Status, int VideoCount, string Directory, DateTimeOffset? ModifiedAt);

public enum EnvironmentCheckState { Checking, Ready, Missing, Optional, ActionRequired, Installing, Failed }

public sealed record EnvironmentItem(string Id, string Title, string Description, EnvironmentCheckState State, string Detail, string ActionLabel);
