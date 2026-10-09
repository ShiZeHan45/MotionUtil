import { spawn } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { NarrationSegment, ProjectScript, RenderProject } from "../types";
import { config } from "../lib/config";
import { writeJson } from "../lib/io";

type WavInfo = { durationMs: number; sampleRate: number; channels: number; byteRate: number };
type ScriptWithSpokenText = Omit<ProjectScript, "narrationSegments"> & {
  narrationSegments: Array<NarrationSegment & { spokenText: string }>;
};
type KokoroOutput = { projects: RenderProject[] };
const RESULT_PREFIX = "KOKORO_RESULT:";
// Keep three minutes as the target while allowing normal TTS timing variation.
// The prompt targets 2:40-3:20; this guard leaves a small extra buffer so a
// few seconds of pauses do not block an otherwise usable video.
const MAX_VIDEO_DURATION_MS = 210_000;

function expandBeatNarration(script: ProjectScript): Array<NarrationSegment & { spokenText: string }> {
  return script.narrationSegments.flatMap((segment) => {
    if (segment.scene !== "concept" || !script.conceptStoryboard?.beats.length) {
      return [{ ...segment, spokenText: segment.spokenText ?? segment.text }];
    }
    return script.conceptStoryboard.beats.map((beat) => ({
      scene: "concept" as const,
      beatId: beat.id,
      text: beat.text,
      spokenText: beat.spokenText ?? beat.text,
    }));
  });
}

function inspectPcmWav(buffer: Buffer, filename: string): WavInfo {
  if (buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error(`Kokoro 输出不是有效的 RIFF/WAVE 文件：${filename}`);
  }
  let sampleRate = 0;
  let channels = 0;
  let byteRate = 0;
  let dataBytes = 0;
  for (let offset = 12; offset + 8 <= buffer.length;) {
    const id = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (id === "fmt " && size >= 16 && start + 16 <= buffer.length) {
      channels = buffer.readUInt16LE(start + 2);
      sampleRate = buffer.readUInt32LE(start + 4);
      byteRate = buffer.readUInt32LE(start + 8);
    } else if (id === "data") {
      dataBytes = Math.min(size, buffer.length - start);
    }
    offset = start + size + (size % 2);
  }
  if (!sampleRate || !channels || !byteRate || !dataBytes) throw new Error(`无法读取 Kokoro WAV 信息：${filename}`);
  return { durationMs: Math.round((dataBytes / byteRate) * 1_000), sampleRate, channels, byteRate };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function runKokoro(scripts: ScriptWithSpokenText[], audioDirectory: string, speed: number): Promise<RenderProject[]> {
  return new Promise((resolve, reject) => {
    const helperPath = path.resolve("tools", "kokoro_tts.py");
    const child = spawn(config.kokoroPython, [helperPath], {
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        HF_HOME: config.kokoroCacheDir,
        HF_HUB_DISABLE_XET: process.env.HF_HUB_DISABLE_XET ?? "1",
        HF_HUB_DISABLE_SYMLINKS_WARNING: process.env.HF_HUB_DISABLE_SYMLINKS_WARNING ?? "1",
        PYTHONIOENCODING: "utf-8",
      },
    });
    if (!child.stdin || !child.stdout || !child.stderr) {
      child.kill();
      reject(new Error("无法打开 Kokoro Python 标准输入/输出管道"));
      return;
    }
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => { stdout += chunk; });
    child.stderr.on("data", (chunk: string) => { stderr += chunk; });
    child.stdin.on("error", () => undefined);
    child.once("error", (error) => reject(new Error(`无法启动 Kokoro Python：${error.message}`)));
    child.once("close", (code, signal) => {
      if (code !== 0) {
        reject(new Error(`Kokoro 合成进程失败 (${code ?? signal})：\n${stderr.slice(-4_000)}`));
        return;
      }
      const resultLine = stdout.split(/\r?\n/).reverse().find((line) => line.startsWith(RESULT_PREFIX));
      if (!resultLine) {
        reject(new Error(`Kokoro 没有返回合成结果：\n${stderr.slice(-2_000)}\n${stdout.slice(-2_000)}`));
        return;
      }
      try {
        const result = JSON.parse(resultLine.slice(RESULT_PREFIX.length)) as KokoroOutput;
        if (!Array.isArray(result.projects)) throw new Error("结果中缺少 projects 数组");
        resolve(result.projects);
      } catch (error) {
        reject(new Error(`解析 Kokoro 合成结果失败：${error instanceof Error ? error.message : String(error)}`));
      }
    });
    child.stdin.end(JSON.stringify({
      scripts,
      outputDirectory: path.resolve(audioDirectory),
      model: config.kokoroModel,
      voice: config.kokoroVoice,
      device: config.kokoroDevice,
      speed,
      pauseMs: config.kokoroPauseMs,
      sampleRate: 24_000,
    }));
  });
}

export async function synthesizeScripts(scripts: ProjectScript[], audioDirectory: string): Promise<RenderProject[]> {
  if (!Number.isFinite(config.kokoroSpeed) || config.kokoroSpeed <= 0) throw new Error("KOKORO_SPEED 必须是大于 0 的数字");
  if (!Number.isFinite(config.kokoroPauseMs) || config.kokoroPauseMs < 0) throw new Error("KOKORO_PAUSE_MS 必须是非负数字");
  await mkdir(audioDirectory, { recursive: true });

  let pronunciation: Record<string, string> = {};
  try {
    pronunciation = JSON.parse(await readFile(path.resolve("config", "pronunciation.json"), "utf8")) as Record<string, string>;
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
  }
  const substitutions = Object.entries(pronunciation).sort(([a], [b]) => b.length - a.length);
  const prepared: ScriptWithSpokenText[] = scripts.map((script) => ({
    ...script,
    narrationSegments: expandBeatNarration(script).map((segment) => {
      let spokenText = segment.spokenText ?? segment.text;
      for (const [source, replacement] of substitutions) spokenText = spokenText.replace(new RegExp(escapeRegExp(source), "gi"), replacement);
      return { ...segment, spokenText };
    }),
  }));

  console.log(`[节点 4] 使用 Kokoro ${config.kokoroModel}，音色 ${config.kokoroVoice}，设备 ${config.kokoroDevice}，语速 ${config.kokoroSpeed}`);
  let projects = await runKokoro(prepared, audioDirectory, config.kokoroSpeed);
  if (projects.length !== scripts.length) throw new Error(`Kokoro 返回项目数量错误：请求 ${scripts.length} 个，返回 ${projects.length} 个`);

  const durationMs = (project: RenderProject) => project.narrationSegments.reduce((total, segment) => total + segment.durationMs, 0);

  for (const [projectIndex, project] of projects.entries()) {
    const source = scripts[projectIndex];
    if (!source || project.repo.toLowerCase() !== source.repo.toLowerCase()) {
      throw new Error(`Kokoro 返回顺序或仓库不匹配：${project.repo}`);
    }
    const expectedSegments = source.narrationSegments.reduce((total, segment) => total + (segment.scene === "concept" && source.conceptStoryboard?.beats.length ? source.conceptStoryboard.beats.length : 1), 0);
    if (project.narrationSegments.length !== expectedSegments) {
      throw new Error(`Kokoro 返回 ${project.repo} 的节拍数错误：预期 ${expectedSegments}，实际 ${project.narrationSegments.length}`);
    }
    console.log(`[节点 4] ${projectIndex + 1}/${projects.length} ${project.repo}`);
    for (const segment of project.narrationSegments) {
      const info = inspectPcmWav(await readFile(segment.audio), segment.audio);
      if (info.sampleRate !== 24_000 || info.channels !== 1) {
        throw new Error(`Kokoro WAV 格式不符：${segment.audio}（${info.sampleRate} Hz，${info.channels} 声道）`);
      }
      segment.durationMs = info.durationMs;
      console.log(`  ${segment.scene}: ${(info.durationMs / 1_000).toFixed(1)} 秒`);
    }
    const totalDurationMs = durationMs(project);
    if (totalDurationMs > MAX_VIDEO_DURATION_MS) {
      throw new Error(`${project.repo} 配音总时长为 ${(totalDurationMs / 1_000).toFixed(1)} 秒，超过 3 分 30 秒上限；请缩短节点 3 的讲稿后重试。`);
    }
    console.log(`  合计：${(totalDurationMs / 1_000).toFixed(1)} 秒（目标约 3 分钟，通常 2 分 40 秒至 3 分 20 秒）`);
  }

  await writeJson(path.join(audioDirectory, "index.json"), projects.map((project) => ({
    repo: project.repo,
    rank: project.rank,
    segments: project.narrationSegments.map(({ scene, audio, durationMs }) => ({ scene, audio, durationMs })),
  })));
  await writeJson(path.join(audioDirectory, "render-projects.json"), projects);
  return projects;
}
