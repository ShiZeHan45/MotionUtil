import { spawn } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { NarrationSegment, ProjectScript, RenderProject } from "../types";
import { config } from "../lib/config";
import { writeJson } from "../lib/io";
import { repoSlug } from "../lib/paths";
import { shortenScriptForDuration } from "./script";
import { loadNarrationTiming, MAX_VIDEO_DURATION_MS, recordNarrationTiming, spokenTimeline } from "../lib/narration";

type WavInfo = { durationMs: number; sampleRate: number; channels: number; byteRate: number };
type ScriptWithSpokenText = Omit<ProjectScript, "narrationSegments"> & {
  narrationSegments: Array<NarrationSegment & { spokenText: string }>;
};
type KokoroOutput = { projects: RenderProject[] };
const RESULT_PREFIX = "KOKORO_RESULT:";
const MAX_AUTO_REVISIONS = 3;

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

function prepareScripts(scripts: ProjectScript[], substitutions: Array<[string, string]>): ScriptWithSpokenText[] {
  return scripts.map((script) => ({
    ...script,
    narrationSegments: spokenTimeline(script, substitutions),
  }));
}

async function inspectProjects(projects: RenderProject[], scripts: ProjectScript[]): Promise<Map<string, number>> {
  const durations = new Map<string, number>();
  for (const [projectIndex, project] of projects.entries()) {
    const source = scripts.find((script) => script.repo.toLowerCase() === project.repo.toLowerCase());
    if (!source) throw new Error(`Kokoro 返回未请求的项目：${project.repo}`);
    const expectedSegments = source.narrationSegments.reduce((total, segment) => total + (segment.scene === "concept" && source.conceptStoryboard?.beats.length ? source.conceptStoryboard.beats.length : 1), 0);
    if (project.narrationSegments.length !== expectedSegments) {
      throw new Error(`Kokoro 返回 ${project.repo} 的节拍数错误：预期 ${expectedSegments}，实际 ${project.narrationSegments.length}`);
    }
    console.log(`[节点 4] ${projectIndex + 1}/${projects.length} 检查 ${project.repo}`);
    for (const segment of project.narrationSegments) {
      const info = inspectPcmWav(await readFile(segment.audio), segment.audio);
      if (info.sampleRate !== 24_000 || info.channels !== 1) {
        throw new Error(`Kokoro WAV 格式不符：${segment.audio}（${info.sampleRate} Hz，${info.channels} 声道）`);
      }
      segment.durationMs = info.durationMs;
      console.log(`  ${segment.scene}: ${(info.durationMs / 1_000).toFixed(1)} 秒`);
    }
    const totalDurationMs = project.narrationSegments.reduce((total, segment) => total + segment.durationMs, 0);
    durations.set(project.repo.toLowerCase(), totalDurationMs);
    console.log(`  合计：${(totalDurationMs / 1_000).toFixed(1)} 秒`);
  }
  return durations;
}

async function persistAdjustedScripts(scripts: ProjectScript[], audioDirectory: string): Promise<void> {
  const scriptsDirectory = path.join(path.dirname(audioDirectory), "scripts");
  await writeJson(path.join(scriptsDirectory, "index.json"), scripts);
  await Promise.all(scripts.map((script) => writeJson(path.join(scriptsDirectory, `${repoSlug(script.repo)}.json`), script)));
}

export async function synthesizeScripts(scripts: ProjectScript[], audioDirectory: string): Promise<RenderProject[]> {
  if (!Number.isFinite(config.kokoroSpeed) || config.kokoroSpeed <= 0) throw new Error("KOKORO_SPEED 必须是大于 0 的数字");
  if (!Number.isFinite(config.kokoroPauseMs) || config.kokoroPauseMs < 0) throw new Error("KOKORO_PAUSE_MS 必须是非负数字");
  await mkdir(audioDirectory, { recursive: true });
  const timing = await loadNarrationTiming();

  const substitutions = timing.substitutions;
  console.log(`[节点 4] 使用 Kokoro ${config.kokoroModel}，音色 ${config.kokoroVoice}，设备 ${config.kokoroDevice}，语速 ${config.kokoroSpeed}`);
  let workingScripts = scripts.map((script) => ({ ...script }));
  const durationAdjustments: Array<{ repo: string; revision: number; beforeMs: number }> = [];
  let projects = await runKokoro(prepareScripts(workingScripts, substitutions), audioDirectory, config.kokoroSpeed);
  if (projects.length !== scripts.length) throw new Error(`Kokoro 返回项目数量错误：请求 ${scripts.length} 个，返回 ${projects.length} 个`);

  for (let revision = 0; revision <= MAX_AUTO_REVISIONS; revision++) {
    const durations = await inspectProjects(projects, workingScripts);
    await recordNarrationTiming(projects, timing);
    const overlong = workingScripts.filter((script) => (durations.get(script.repo.toLowerCase()) ?? 0) > MAX_VIDEO_DURATION_MS);
    if (!overlong.length) {
      for (const script of workingScripts) {
        const total = durations.get(script.repo.toLowerCase()) ?? 0;
        console.log(`  ${script.repo} 合计：${(total / 1_000).toFixed(1)} 秒（目标约 3 分钟，通常 2 分 40 秒至 3 分 20 秒）`);
      }
      scripts = workingScripts;
      break;
    }
    if (revision === MAX_AUTO_REVISIONS) {
      const details = overlong.map((script) => `${script.repo} ${(durations.get(script.repo.toLowerCase())! / 1_000).toFixed(1)} 秒`).join("、");
      await writeJson(path.join(audioDirectory, "duration-adjustments.json"), { maxRevisions: MAX_AUTO_REVISIONS, maxDurationMs: MAX_VIDEO_DURATION_MS, adjustments: durationAdjustments, status: "failed", remaining: details });
      throw new Error(`自动压缩讲稿 ${MAX_AUTO_REVISIONS} 轮后仍超过 3 分 20 秒：${details}。请从节点 3 重试。`);
    }
    console.log(`[节点 4] 等待讲稿压缩：${overlong.length} 个项目超过 3 分 20 秒，自动压缩（第 ${revision + 1}/${MAX_AUTO_REVISIONS} 轮）`);
    const revisedByRepo = new Map<string, ProjectScript>();
    for (const [scriptIndex, script] of overlong.entries()) {
      const duration = durations.get(script.repo.toLowerCase())!;
      console.log(`[节点 3] ${scriptIndex}/${overlong.length} 正在压缩 ${script.repo}，实测 ${(duration / 1_000).toFixed(1)} 秒`);
      durationAdjustments.push({ repo: script.repo, revision: revision + 1, beforeMs: duration });
      revisedByRepo.set(script.repo.toLowerCase(), await shortenScriptForDuration(script, duration, MAX_VIDEO_DURATION_MS, timing));
      console.log(`[节点 3] ${scriptIndex + 1}/${overlong.length} ${script.repo} 讲稿压缩完成`);
    }
    workingScripts = workingScripts.map((script) => revisedByRepo.get(script.repo.toLowerCase()) ?? script);
    await persistAdjustedScripts(workingScripts, audioDirectory);
    const retryScripts = workingScripts.filter((script) => revisedByRepo.has(script.repo.toLowerCase()));
    console.log(`[节点 4] 节点 3 修订完成，重新合成配音（第 ${revision + 1}/${MAX_AUTO_REVISIONS} 轮）`);
    const retryProjects = await runKokoro(prepareScripts(retryScripts, substitutions), audioDirectory, config.kokoroSpeed);
    const byRepo = new Map(projects.map((project) => [project.repo.toLowerCase(), project]));
    for (const project of retryProjects) byRepo.set(project.repo.toLowerCase(), project);
    projects = workingScripts.map((script) => byRepo.get(script.repo.toLowerCase())).filter((project): project is RenderProject => Boolean(project));
  }

  await writeJson(path.join(audioDirectory, "index.json"), projects.map((project) => ({
    repo: project.repo,
    rank: project.rank,
    segments: project.narrationSegments.map(({ scene, audio, durationMs }) => ({ scene, audio, durationMs })),
  })));
  await writeJson(path.join(audioDirectory, "render-projects.json"), projects);
  await writeJson(path.join(audioDirectory, "duration-adjustments.json"), { maxRevisions: MAX_AUTO_REVISIONS, maxDurationMs: MAX_VIDEO_DURATION_MS, adjustments: durationAdjustments, status: "passed" });
  return projects;
}
