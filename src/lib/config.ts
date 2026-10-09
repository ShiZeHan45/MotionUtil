import "dotenv/config";
import path from "node:path";

const buzzBaseUrl = "https://api.buzzai.cc/v1";
const apiKey = process.env.OPENAI_API_KEY?.trim();
const configuredBaseUrl = process.env.OPENAI_BASE_URL?.trim().replace(/\/+$/, "") || buzzBaseUrl;
// A Buzz key must stay on the service the user selected, including after loading old settings.
const modelBaseUrl = apiKey?.startsWith("sk-buzz-") ? buzzBaseUrl : configuredBaseUrl;

export const config = {
  githubToken: process.env.GITHUB_TOKEN,
  githubTrendingUrl: process.env.GITHUB_TRENDING_URL ?? "https://github.com/trending?since=weekly",
  githubTopN: Math.max(1, Math.min(20, Number.parseInt(process.env.GITHUB_TOP_N ?? "5", 10) || 5)),
  openAiBaseUrl: modelBaseUrl,
  openAiApiKey: apiKey,
  openAiModel: process.env.OPENAI_MODEL?.trim(),
  kokoroPython: process.env.KOKORO_PYTHON ?? "python",
  kokoroModel: process.env.KOKORO_MODEL ?? "hexgrad/Kokoro-82M-v1.1-zh",
  kokoroVoice: process.env.KOKORO_VOICE ?? "zf_001",
  kokoroDevice: process.env.KOKORO_DEVICE ?? "cpu",
  kokoroSpeed: Number(process.env.KOKORO_SPEED ?? "1.0"),
  kokoroPauseMs: Number(process.env.KOKORO_PAUSE_MS ?? "200"),
  kokoroCacheDir: path.resolve(process.env.KOKORO_CACHE_DIR ?? ".cache/kokoro"),
  ffmpegPath: process.env.FFMPEG_PATH ?? "ffmpeg",
  ffprobePath: process.env.FFPROBE_PATH ?? "ffprobe",
  remotionBrowserExecutable: process.env.REMOTION_BROWSER_EXECUTABLE,
};
