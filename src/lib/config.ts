import "dotenv/config";
import path from "node:path";

export const config = {
  githubToken: process.env.GITHUB_TOKEN,
  githubTrendingUrl: process.env.GITHUB_TRENDING_URL ?? "https://github.com/trending?since=weekly",
  openAiBaseUrl: (process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, ""),
  openAiApiKey: process.env.OPENAI_API_KEY,
  openAiModel: process.env.OPENAI_MODEL,
  kokoroPython: process.env.KOKORO_PYTHON ?? "python",
  kokoroModel: process.env.KOKORO_MODEL ?? "hexgrad/Kokoro-82M-v1.1-zh",
  kokoroVoice: process.env.KOKORO_VOICE ?? "zf_001",
  kokoroDevice: process.env.KOKORO_DEVICE ?? "cpu",
  kokoroSpeed: Number(process.env.KOKORO_SPEED ?? "1.3"),
  kokoroPauseMs: Number(process.env.KOKORO_PAUSE_MS ?? "200"),
  kokoroCacheDir: path.resolve(process.env.KOKORO_CACHE_DIR ?? ".cache/kokoro"),
  ffmpegPath: process.env.FFMPEG_PATH ?? "ffmpeg",
  ffprobePath: process.env.FFPROBE_PATH ?? "ffprobe",
  remotionBrowserExecutable: process.env.REMOTION_BROWSER_EXECUTABLE,
};
