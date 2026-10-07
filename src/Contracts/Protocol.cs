using System.Text.Json;

namespace MotionVideoPipeline.Contracts;

public static class WorkerMessageTypes
{
    public const string Request = "request";
    public const string Progress = "progress";
    public const string Heartbeat = "heartbeat";
    public const string Result = "result";
    public const string Error = "error";
    public const string Cancel = "cancel";
    public const string Cancelled = "cancelled";
}

public sealed record WorkerMessage(
    string RequestId,
    string NodeId,
    string NodeVersion,
    string Type,
    JsonElement Payload)
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true
    };

    public static WorkerMessage Create(string requestId, string nodeId, string nodeVersion, string type, object? payload)
    {
        using var document = JsonDocument.Parse(JsonSerializer.Serialize(payload ?? new { }));
        return new WorkerMessage(requestId, nodeId, nodeVersion, type, document.RootElement.Clone());
    }

    public string ToJsonLine() => JsonSerializer.Serialize(this, JsonOptions);

    public static bool TryParse(string line, out WorkerMessage? message, out string? error)
    {
        try
        {
            message = JsonSerializer.Deserialize<WorkerMessage>(line, JsonOptions);
            if (message is null || string.IsNullOrWhiteSpace(message.RequestId) ||
                string.IsNullOrWhiteSpace(message.NodeId) || string.IsNullOrWhiteSpace(message.NodeVersion) ||
                string.IsNullOrWhiteSpace(message.Type))
            {
                error = "消息缺少 requestId、nodeId、nodeVersion 或 type。";
                message = null;
                return false;
            }

            error = null;
            return true;
        }
        catch (JsonException exception)
        {
            message = null;
            error = exception.Message;
            return false;
        }
    }
}

public sealed record NodeProgress(double Value, string Message, string? CurrentItem = null, TimeSpan? Eta = null);
public sealed record Diagnostic(string Code, string Message, string Severity = "error", string? Detail = null);
public sealed record ProjectRun(string RunId, string ProjectId, string CreatedAtUtc, string Status, string InputPath, string? CheckpointPath = null);
