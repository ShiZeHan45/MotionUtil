import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { openBrowser, renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import { config } from "../src/lib/config";
import type { RenderProject } from "../src/types";
import { defaultOpenRigStoryProps } from "../src/video/OpenRigStory";
import { FPS, framesForMs } from "../src/video/ProjectVideo";
import { openrigStory, openrigStorySources, type OpenRigStoryProps } from "../src/video/openrig-story";

const output = path.resolve(process.argv.slice(2).find(value => !value.startsWith("--")) ?? "output/openrig-story-demo-20261010");
const audioDirectory = path.join(output, "audio");
const publicDirectory = path.resolve("public/generated/openrig-story-demo-20261010");
await mkdir(audioDirectory, { recursive: true });
await mkdir(publicDirectory, { recursive: true });

async function narrate(): Promise<RenderProject> {
  const cached = path.join(audioDirectory, "narration.json");
  if (existsSync(cached)) {
    const project = JSON.parse(await readFile(cached, "utf8")) as RenderProject;
    if (project.narrationSegments.length === openrigStory.length && project.narrationSegments.every((segment, index) => segment.text === openrigStory[index]!.text && existsSync(segment.audio))) return project;
  }
  const python = existsSync(path.resolve(".venv-kokoro/Scripts/python.exe")) ? path.resolve(".venv-kokoro/Scripts/python.exe") : config.kokoroPython;
  const payload = {
    scripts: [defaultOpenRigStoryProps.project], outputDirectory: audioDirectory,
    model: config.kokoroModel, voice: "zf_001", device: config.kokoroDevice,
    speed: 1, pauseMs: 180, sampleRate: 24_000,
  };
  const project = await new Promise<RenderProject>((resolve, reject) => {
    const child = spawn(python, [path.resolve("tools/kokoro_tts.py")], {
      windowsHide: true, stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, HF_HOME: config.kokoroCacheDir, HF_HUB_DISABLE_XET: "1", PYTHONIOENCODING: "utf-8" },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => { stdout += chunk; });
    child.stderr.on("data", (chunk: string) => { stderr += chunk; process.stderr.write(chunk); });
    child.once("error", reject);
    child.stdin.on("error", reject);
    child.once("close", code => {
      if (code !== 0) return reject(new Error(stderr.slice(-2000)));
      const line = stdout.split(/\r?\n/u).find(value => value.startsWith("KOKORO_RESULT:"));
      if (!line) return reject(new Error("Kokoro did not return narration"));
      try { resolve((JSON.parse(line.slice("KOKORO_RESULT:".length)) as { projects: RenderProject[] }).projects[0]!); }
      catch (error) { reject(error); }
    });
    child.stdin.end(JSON.stringify(payload));
  });
  await writeFile(cached, JSON.stringify(project, null, 2));
  return project;
}

const narrated = await narrate();
const project: RenderProject = { ...narrated, narrationSegments: [] };
for (const segment of narrated.narrationSegments) {
  const filename = path.basename(segment.audio);
  await copyFile(segment.audio, path.join(publicDirectory, filename));
  project.narrationSegments.push({ ...segment, audio: `generated/openrig-story-demo-20261010/${filename}` });
}
const frameDirectory = path.resolve("public/generated/2026-10-10T03-20-09-782Z/background/frames");
const backgroundFrames = existsSync(frameDirectory)
  ? (await readdir(frameDirectory)).filter(file => /^frame-\d+\.jpg$/u.test(file)).sort().map(file => path.relative("public", path.join(frameDirectory, file)).replaceAll("\\", "/"))
  : undefined;
const inputProps: OpenRigStoryProps = { project, backgroundFrames, backgroundDurationInFrames: backgroundFrames?.length };
await writeFile(path.join(output, "render-input.json"), JSON.stringify(inputProps, null, 2));
const timing = project.narrationSegments.map((segment, index) => {
  const from = project.narrationSegments.slice(0, index).reduce((sum, value) => sum + framesForMs(value.durationMs), 0);
  return { id: segment.beatId, text: segment.text, action: openrigStory[index]!.action, fromFrame: from, frames: framesForMs(segment.durationMs), durationMs: segment.durationMs };
});
await writeFile(path.join(output, "storyboard.json"), JSON.stringify({ repo: project.repo, sources: openrigStorySources, voice: "zf_001", speed: 1, timing }, null, 2));
console.log(`Narration: ${timing.reduce((sum, beat) => sum + beat.durationMs, 0) / 1000}s; ${timing.length} sentence cues`);

const serveUrl = await bundle({ entryPoint: path.resolve("src/video/index.tsx"), publicDir: path.resolve("public") });
const browser = await openBrowser("chrome", { browserExecutable: config.remotionBrowserExecutable });
try {
  const composition = await selectComposition({ serveUrl, id: "OpenRigStoryDemo", inputProps, puppeteerInstance: browser });
  for (const id of ["scattered", "team", "whiteboard", "context", "search", "build", "review", "decision", "return", "outcome"]) {
    const cue = timing.find(beat => beat.id === id)!;
    const frame = cue.fromFrame + Math.min(cue.frames - 1, Math.round(FPS * (id === "review" ? 1 : 2.4)));
    await renderStill({ serveUrl, composition, inputProps, puppeteerInstance: browser, frame, output: path.join(output, `${id}.png`) });
    console.log(`Checked ${id}: frame ${frame}`);
  }
  if (!process.argv.includes("--stills-only")) {
    let lastPercent = -1;
    await renderMedia({ serveUrl, composition, inputProps, puppeteerInstance: browser, codec: "h264", audioCodec: "aac", outputLocation: path.join(output, "openrig-story-demo.mp4"), concurrency: 2,
      onProgress: ({ progress }) => { const percent = Math.floor(progress * 100); if (percent >= lastPercent + 5) { lastPercent = percent; console.log(`Render ${percent}%`); } },
    });
    console.log(`Video: ${path.join(output, "openrig-story-demo.mp4")}`);
  }
} finally {
  await browser.close({ silent: true });
}
