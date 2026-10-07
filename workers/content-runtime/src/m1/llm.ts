export type ModelProfile = {
  profileId: string;
  baseUrl: string;
  apiKeyEnvVar: string;
  model: string;
  timeoutSeconds?: number;
  maxRetries?: number;
};

export class LlmConfigurationError extends Error {
  readonly code = 'LLM_CONFIGURATION_MISSING';
}

export class LlmResponseError extends Error {
  readonly code = 'LLM_INVALID_JSON';
}

export function validateModelProfile(profile: ModelProfile, env: Record<string, string | undefined> = process.env): string {
  if (!profile.baseUrl?.trim() || !profile.apiKeyEnvVar?.trim() || !profile.model?.trim() || !env[profile.apiKeyEnvVar]) {
    throw new LlmConfigurationError('真实任务缺少 OpenAI-compatible baseUrl、model 或 API Key 环境变量');
  }
  return env[profile.apiKeyEnvVar]!;
}

export class OpenAiCompatibleClient {
  private readonly profile: ModelProfile;
  private readonly fetcher: typeof fetch;
  private readonly env: Record<string, string | undefined>;
  constructor(profile: ModelProfile, fetcher: typeof fetch = fetch, env: Record<string, string | undefined> = process.env) {
    this.profile = profile;
    this.fetcher = fetcher;
    this.env = env;
  }

  async completeJson<T>(messages: Array<{ role: 'system' | 'user'; content: string }>, schema?: unknown, signal?: AbortSignal): Promise<T> {
    const apiKey = validateModelProfile(this.profile, this.env);
    const endpoint = `${this.profile.baseUrl.replace(/\/$/, '')}/chat/completions`;
    let lastError: unknown;
    let repairAttempted = false;
    let requestMessages = messages;
    for (let attempt = 0; attempt <= (this.profile.maxRetries ?? 3); attempt++) {
      try {
        const response = await this.fetcher(endpoint, {
          method: 'POST',
          signal: AbortSignal.any([signal ?? new AbortController().signal, AbortSignal.timeout((this.profile.timeoutSeconds ?? 90) * 1000)]),
          headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ model: this.profile.model, messages: requestMessages, response_format: schema ? { type: 'json_schema', json_schema: schema } : { type: 'json_object' } }),
        });
        if (!response.ok) throw new Error(`模型请求失败 HTTP ${response.status}`);
        const body = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
        const content = body.choices?.[0]?.message?.content;
        if (!content) throw new LlmResponseError('模型响应缺少 message.content');
        try { return JSON.parse(content) as T; } catch (error) {
          if (!repairAttempted) {
            repairAttempted = true;
            requestMessages = [...messages, { role: 'system', content: '上一条响应不是有效 JSON。请只输出可解析的 JSON，不要 Markdown、解释或代码围栏。' }];
            continue;
          }
          throw new LlmResponseError('模型连续两次响应不是有效 JSON');
        }
      } catch (error) {
        lastError = error;
        if (error instanceof LlmConfigurationError || error instanceof LlmResponseError || attempt >= (this.profile.maxRetries ?? 3)) throw error;
        await new Promise(resolve => setTimeout(resolve, 250 * 2 ** attempt));
      }
    }
    throw lastError;
  }
}
