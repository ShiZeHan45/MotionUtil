# GitHub Trending Video (Nodes 1–5)

Windows-first prototype for turning GitHub Trending weekly projects into short, narrated vertical explainer videos. It deliberately stops before captions, final packaging, scheduled runs, or social publishing.

## What is included

1. Scrape the weekly GitHub Trending page and save both structured JSON and the raw HTML snapshot. Parsing fails closed if the expected cards or required project count disappear.
2. Fetch repository metadata and a bounded README excerpt using the GitHub REST API.
3. Generate fixed narration sections for the configured number of projects in one OpenAI-compatible request. Set the count with `GITHUB_TOP_N` (the desktop app exposes the same setting). Valid scripts are cached by model and source-data hash.
4. Start one local Kokoro Python process per run and synthesize per-scene WAV files. English repository names go through Kokoro's English G2P. The exact audio durations become the scene durations.
5. Render a 1080×1920 Remotion animation with a leaderboard selection intro and flat-vector infographic scenes. The TTS track is embedded in the rendered MP4.

The project is a CLI and a Remotion Studio preview, not a WinForms application. A manual weekly run is in scope; system scheduling is deferred until the end-to-end output is accepted.

## Prerequisites

- Node.js 22 or newer and pnpm (or npm; the checked-in package manifest supports either).
- A GitHub personal access token is optional for public data, but recommended for API rate limits.
- An OpenAI-compatible chat completions API and model for node 3.
- Python 3.12 with Kokoro and `misaki[zh]` for node 4.

Install JavaScript dependencies from this directory:

```powershell
pnpm install
```

Copy `.env.example` to `.env`, then set `GITHUB_TOKEN`, `OPENAI_API_KEY`, and `OPENAI_MODEL`. Set `KOKORO_PYTHON` to the Python executable in the isolated environment where Kokoro is installed. The model is downloaded to `KOKORO_CACHE_DIR` on the first node 4 run. The default voice is `zf_001`, speed is `1.0`, and the short pause between scene WAVs is 200 ms.

Recommended isolated setup:

```powershell
python -m venv .venv-kokoro
& '.\.venv-kokoro\Scripts\python.exe' -m pip install torch --index-url https://download.pytorch.org/whl/cpu
& '.\.venv-kokoro\Scripts\python.exe' -m pip install 'kokoro>=0.9.4' 'misaki[zh]>=0.8.2' soundfile
```

After installing, set `KOKORO_PYTHON` to the full path to `.venv-kokoro\Scripts\python.exe` in `.env`.

Common project terms can be edited in `config/pronunciation.json`. The displayed subtitle remains the original text; only the TTS input uses pronunciation replacements.

## Run each node independently

```powershell
pnpm run trending
pnpm run repos
pnpm run scripts
pnpm run tts
pnpm run render
```

Each command after `trending` uses the latest run. To reproduce an existing run explicitly, pass `--run-id <run-folder-name>` after the command. Intermediate files live under `output/<run-id>/`.

Run nodes 1–5 consecutively:

```powershell
pnpm run run
```

Preview the sample composition in Remotion Studio:

```powershell
pnpm run dev
```

The sample preview uses fake repositories and no voice audio. It is only for layout review. A production run uses the actual snapshot, generated scripts, and Kokoro audio.

## Important boundaries

- GitHub Trending is a web page, not a stable official weekly JSON endpoint. The collector preserves the source HTML and stops on parse anomalies; this may need maintenance if GitHub changes its markup.
- This prototype has no uploader, scheduler, captions, FFmpeg post-processing, or WinForms management UI.
- The project uses Remotion. Check the current license for the organization and automation use case before scaling beyond the free-eligible personal/small-team scope.
- The LLM is only used in node 3. Data collection, voice generation, and video rendering are deterministic/local after configuration; unchanged script inputs are reused from cache.
