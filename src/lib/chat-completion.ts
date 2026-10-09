import { config } from "./config";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };
type CompletionChunk = {
  error?: string | { message?: string; code?: string; type?: string };
  choices?: Array<{
    delta?: { content?: string | null };
    message?: { content?: string | null };
    finish_reason?: string | null;
  }>;
};

class ModelRequestError extends Error {
  constructor(message: string, readonly retryable: boolean, readonly retryAfterMs = 0) {
    super(message);
  }
}

function safeMessage(message: string): string {
  return (config.openAiApiKey ? message.replaceAll(config.openAiApiKey, "[API Key]") : message).slice(0, 500);
}

function getErrorMessage(error: CompletionChunk["error"]): string {
  if (typeof error === "string") return error;
  return error?.message ?? error?.code ?? "模型返回错误";
}

function isRetryableStreamError(message: string): boolean {
  return /unable to forward upstream stream/i.test(message)
    || /\b(?:temporarily unavailable|try again later|timeout|timed out|overloaded|too many requests|rate.?limit|internal server error|bad gateway|gateway timeout|service unavailable|connection reset|connection closed|econnreset|eai_again)\b/i.test(message)
    || /\bupstream\b.{0,80}\b(?:error|failed|failure|unavailable|timeout|timed out|closed|reset)\b/i.test(message);
}

async function readCompletion(response: Response, onContent: (length: number) => void): Promise<string> {
  if (!(response.headers.get("content-type") ?? "").includes("text/event-stream")) {
    // Compatible services may return a JSON body regardless of the stream setting.
    const body = await response.json() as CompletionChunk;
    if (body.error) {
      const message = getErrorMessage(body.error);
      throw new ModelRequestError(safeMessage(message), isRetryableStreamError(message));
    }
    if (body.choices?.[0]?.finish_reason === "length") throw new ModelRequestError("模型输出被长度限制截断，未生成完整讲稿", false);
    const content = body.choices?.[0]?.message?.content;
    if (!content) throw new ModelRequestError("讲稿模型返回为空", true);
    onContent(content.length);
    return content;
  }

  if (!response.body) throw new ModelRequestError("模型流式响应没有正文", true);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let complete = false;
  let finishReason: string | null = null;
  const acceptEvent = (event: string) => {
    const data = event.split(/\r\n|\n|\r/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart()).join("\n").trim();
    if (!data) return;
    if (data === "[DONE]") { complete = true; return; }
    const chunk = JSON.parse(data) as CompletionChunk;
    if (chunk.error) {
      const message = getErrorMessage(chunk.error);
      const retryable = isRetryableStreamError(message);
      throw new ModelRequestError(safeMessage(message), retryable);
    }
    const choice = chunk.choices?.[0];
    if (choice?.delta?.content) {
      content += choice.delta.content;
      onContent(content.length);
    }
    if (choice?.finish_reason) finishReason = choice.finish_reason;
  };
  try {
    while (!complete) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const events = buffer.split(/\r\n\r\n|\n\n|\r\r/);
      buffer = events.pop() ?? "";
      for (const event of events) acceptEvent(event);
      if (done) {
        if (buffer.trim()) acceptEvent(buffer);
        break;
      }
    }
    if (!complete && !finishReason) throw new ModelRequestError("讲稿接收中断，模型尚未返回完整结果", true);
    if (finishReason === "length") throw new ModelRequestError("模型输出被长度限制截断，未生成完整讲稿", false);
    if (!content.trim()) throw new ModelRequestError("讲稿模型返回为空", true);
    return content;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export async function requestChatCompletion(messages: ChatMessage[]): Promise<string> {
  const service = config.openAiBaseUrl;
  const serviceHost = new URL(service).hostname;
  // Retry is user-driven from the desktop app so VPN drops don't hold the pipeline in a retry loop.
  const attempts = 1;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const started = Date.now();
    let received = 0;
    const heartbeat = setInterval(() => {
      console.log(`[节点 3] ${serviceHost} 已等待 ${Math.floor((Date.now() - started) / 1_000)} 秒，${received ? `已接收 ${received} 字符` : "模型正在生成"}`);
    }, 15_000);
    heartbeat.unref();
    let failure: ModelRequestError;
    try {
      const response = await fetch(`${service}/chat/completions`, {
        method: "POST",
        redirect: "error",
        headers: { "content-type": "application/json", authorization: `Bearer ${config.openAiApiKey}` },
        // BuzzAI occasionally closes the upstream SSE bridge after generation has
        // started ("Unable to forward upstream stream"). A normal JSON response
        // keeps the full completion on one reliable connection; readCompletion
        // still accepts SSE for compatible gateways that ignore this flag.
        body: JSON.stringify({ model: config.openAiModel, temperature: 0.35, stream: false, messages }),
        signal: AbortSignal.timeout(300_000),
      });
      if (!response.ok) {
        const body = await response.text();
        let detail = "";
        if (!body.trimStart().startsWith("<")) {
          try { detail = getErrorMessage((JSON.parse(body) as CompletionChunk).error) || body; }
          catch { detail = body; }
        }
        const retryAfter = response.headers.get("retry-after");
        const retryAfterMs = retryAfter
          ? Math.max(0, Number.isFinite(Number(retryAfter)) ? Number(retryAfter) * 1_000 : Date.parse(retryAfter) - Date.now())
          : 0;
        const retryable = [408, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524].includes(response.status);
        throw new ModelRequestError(`${service} 返回 HTTP ${response.status}${detail ? `：${safeMessage(detail)}` : response.status === 524 ? "：服务网关等待模型超时" : ""}`, retryable, Math.min(20_000, retryAfterMs || 0));
      }
      return await readCompletion(response, (length) => { received = length; });
    } catch (error) {
      if (error instanceof ModelRequestError) failure = error;
      else {
        const cause = error instanceof Error && "cause" in error ? error.cause as { code?: string } | undefined : undefined;
        const detail = error instanceof Error ? error.message : String(error);
        failure = new ModelRequestError(`${service} 请求或接收失败：${safeMessage(detail)}${cause?.code ? `（${cause.code}）` : ""}`, true);
      }
    } finally {
      clearInterval(heartbeat);
    }
    if (!failure.retryable || attempt === attempts) throw new Error(`节点 3 讲稿请求失败（模型 ${config.openAiModel}）：${failure.message}。已生成项目的缓存已保留，可从节点 3 继续。`);
    const delayMs = Math.max(attempt * 2_000, failure.retryAfterMs);
    console.log(`[节点 3] ${failure.message}；${delayMs / 1_000} 秒后进行第 ${attempt + 1} 次请求（最多 ${attempts} 次），继续使用 ${service}`);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  throw new Error("讲稿模型请求未完成");
}
