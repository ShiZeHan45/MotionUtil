namespace GitHubTrendingVideo.Models;

public sealed class AppSettings
{
    public const string BuzzBaseUrl = "https://api.buzzai.cc/v1";

    public static string ResolveModelBaseUrl(string? value, string? apiKey) =>
        apiKey?.Trim().StartsWith("sk-buzz-", StringComparison.Ordinal) == true || string.IsNullOrWhiteSpace(value)
            ? BuzzBaseUrl
            : value.Trim().TrimEnd('/');

    public string ProjectDirectory { get; set; } = "";
    public string OutputDirectory { get; set; } = "";
    public string OpenAiBaseUrl { get; set; } = BuzzBaseUrl;
    public string OpenAiModel { get; set; } = "";
    public string OpenAiApiKey { get; set; } = "";
    public string GithubToken { get; set; } = "";
    public int TrendingTopN { get; set; } = 5;
    public string KokoroModel { get; set; } = "hexgrad/Kokoro-82M-v1.1-zh";
    public string KokoroVoice { get; set; } = "zf_001";
    public string KokoroDevice { get; set; } = "cpu";
    public decimal KokoroSpeed { get; set; } = 1.0m;
    public string RemotionBrowserExecutable { get; set; } = "";
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
}

public sealed record RunSummary(string RunId, string Status, int VideoCount, string Directory, DateTimeOffset? ModifiedAt);

public enum EnvironmentCheckState { Checking, Ready, Missing, Optional, ActionRequired, Installing, Failed }

public sealed record EnvironmentItem(string Id, string Title, string Description, EnvironmentCheckState State, string Detail, string ActionLabel);
