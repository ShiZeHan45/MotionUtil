import assert from "node:assert/strict";
import { test } from "node:test";
import { config } from "./config";
import { requestChatCompletion } from "./chat-completion";

const messages = [{ role: "user" as const, content: "Return a script." }];
const originalConfig = { ...config };
const completed = { status: "completed", output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "讲稿正文" }] }] };

function event(type: string, value: Record<string, unknown> = {}): string {
  return `data: ${JSON.stringify({ type, ...value })}\r\n\r\n`;
}

function stream(events: string): Response {
  const bytes = new TextEncoder().encode(events);
  return new Response(new ReadableStream({
    start(controller) {
      // Split both multibyte text and event separators across network chunks.
      for (let index = 0; index < bytes.length; index += 7) controller.enqueue(bytes.slice(index, index + 7));
      controller.close();
    },
  }), { headers: { "content-type": "text/event-stream" } });
}

test("xhigh uses Responses and returns only completed assistant text", async (context) => {
  Object.assign(config, { openAiBaseUrl: "https://example.invalid/v1", openAiModel: "gpt-6.1-sol", openAiReasoningEffort: "xhigh" });
  context.after(() => Object.assign(config, originalConfig));
  context.mock.method(console, "log", () => {});
  context.mock.method(globalThis, "fetch", async (url: string, options: RequestInit) => {
    assert.equal(url, "https://example.invalid/v1/responses");
    const body = JSON.parse(options.body as string);
    assert.deepEqual(body, { model: "gpt-6.1-sol", stream: true, store: false, input: messages, reasoning: { effort: "xhigh" } });
    return stream(event("response.reasoning_summary_text.delta", { delta: "内部思考" })
      + event("response.output_text.delta", { delta: "讲稿正文" })
      + event("response.completed", { response: completed }));
  });
  assert.equal(await requestChatCompletion(messages), "讲稿正文");
});

test("automatic GPT reasoning omits temperature and explicit effort", async (context) => {
  Object.assign(config, { openAiBaseUrl: "https://example.invalid/v1", openAiModel: "gpt-6.1-sol", openAiReasoningEffort: undefined });
  context.after(() => Object.assign(config, originalConfig));
  context.mock.method(console, "log", () => {});
  context.mock.method(globalThis, "fetch", async (_url: string, options: RequestInit) => {
    const body = JSON.parse(options.body as string);
    assert.equal(body.temperature, undefined);
    assert.equal(body.reasoning, undefined);
    return Response.json(completed);
  });
  assert.equal(await requestChatCompletion(messages), "讲稿正文");
});

test("other providers retain Chat Completions reasoning parameters", async (context) => {
  Object.assign(config, { openAiBaseUrl: "https://example.invalid/v1", openAiModel: "other-model", openAiReasoningEffort: "high" });
  context.after(() => Object.assign(config, originalConfig));
  context.mock.method(console, "log", () => {});
  context.mock.method(globalThis, "fetch", async (url: string, options: RequestInit) => {
    assert.equal(url, "https://example.invalid/v1/chat/completions");
    const body = JSON.parse(options.body as string);
    assert.equal(body.reasoning_effort, "high");
    assert.equal(body.temperature, undefined);
    assert.deepEqual(body.messages, messages);
    return Response.json({ choices: [{ message: { content: "讲稿正文" }, finish_reason: "stop" }] });
  });
  assert.equal(await requestChatCompletion(messages), "讲稿正文");
});

test("Responses truncation is rejected even after receiving text", async (context) => {
  Object.assign(config, { openAiModel: "gpt-6.1-sol", openAiReasoningEffort: "xhigh" });
  context.after(() => Object.assign(config, originalConfig));
  context.mock.method(console, "log", () => {});
  const fetchMock = context.mock.method(globalThis, "fetch", async () => stream(
    event("response.output_text.delta", { delta: "未完成" })
    + event("response.incomplete", { response: { status: "incomplete", incomplete_details: { reason: "max_output_tokens" } } }),
  ));
  await assert.rejects(requestChatCompletion(messages), /max_output_tokens/);
  assert.equal(fetchMock.mock.callCount(), 1);
});

test("Responses failure reports the actual parameter error", async (context) => {
  Object.assign(config, { openAiModel: "gpt-6.1-sol", openAiReasoningEffort: "xhigh" });
  context.after(() => Object.assign(config, originalConfig));
  context.mock.method(console, "log", () => {});
  const fetchMock = context.mock.method(globalThis, "fetch", async () => stream(event("response.failed", {
    response: { status: "failed", error: { message: "Unsupported reasoning effort", code: "invalid_parameter" } },
  })));
  await assert.rejects(requestChatCompletion(messages), /Unsupported reasoning effort/);
  assert.equal(fetchMock.mock.callCount(), 1);
});

test("partial Responses streams retry five times and never succeed", async (context) => {
  Object.assign(config, { openAiModel: "gpt-6.1-sol", openAiReasoningEffort: "xhigh" });
  context.after(() => Object.assign(config, originalConfig));
  context.mock.method(console, "log", () => {});
  context.mock.method(globalThis, "setTimeout", (callback: () => void) => {
    queueMicrotask(callback);
    return 0;
  });
  const fetchMock = context.mock.method(globalThis, "fetch", async () => stream(
    event("response.output_text.delta", { delta: "未完成" }) + "data: [DONE]\r\n\r\n",
  ));
  await assert.rejects(requestChatCompletion(messages), /讲稿接收中断.*网络重试 5 次后仍失败/);
  assert.equal(fetchMock.mock.callCount(), 6);
});
