import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { copyFile, mkdir, readdir, rm, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import type { RenderProject, TrendingRepo } from "../types";
import { config } from "../lib/config";
import { repoSlug } from "../lib/paths";
import { writeJson } from "../lib/io";
import { durationInFrames, FPS, type VideoProps } from "../video/ProjectVideo";
import { isBadgeAsset } from "../lib/visual-assets";

const execFileAsync = promisify(execFile);

function mediaExtension(filePath: string): string {
  return path.extname(filePath).toLowerCase();
}

async function findBundledFfmpeg(): Promise<string | undefined> {
  const packageRoot = path.join(process.cwd(), "node_modules", ".pnpm");
  if (!existsSync(packageRoot)) return undefined;
  const entries = await readdir(packageRoot);
  const packageDirectory = entries
    .filter((entry) => entry.startsWith("@remotion+compositor-") && entry.includes("win32-x64-msvc"))
    .sort()
    .at(-1);
  if (!packageDirectory) return undefined;
  const executable = path.join(packageRoot, packageDirectory, "node_modules", "@remotion", "compositor-win32-x64-msvc", process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg");
  return existsSync(executable) ? executable : undefined;
}

async function resolveFfmpeg(): Promise<string> {
  const configured = config.ffmpegPath.trim();
  if (configured && configured !== "ffmpeg" && existsSync(configured)) return configured;
  return (await findBundledFfmpeg()) ?? (configured || "ffmpeg");
}

type StagedBackground = { asset?: string; backgroundFrames?: string[]; durationInFrames?: number };

async function stageBackgroundAsset(runId: string): Promise<StagedBackground | undefined> {
  const configured = config.videoBackgroundPath.trim();
  if (!configured) return undefined;
  const source = path.resolve(configured);
  if (!existsSync(source) || !(await stat(source)).isFile()) throw new Error(`节点 5 找不到背景素材：${source}`);
  const extension = mediaExtension(source);
  const supported = [".mp4", ".mov", ".webm", ".m4v", ".png", ".jpg", ".jpeg", ".webp", ".avif", ".gif"];
  if (!supported.includes(extension)) throw new Error(`节点 5 不支持背景素材格式：${extension || "无扩展名"}。请选择 MP4、GIF 或 PNG/JPG。`);

  const backgroundRoot = path.join("public", "generated", runId, "background");
  await mkdir(backgroundRoot, { recursive: true });
  const sourceName = path.basename(source, extension).replace(/[^a-z0-9._-]+/giu, "-").replace(/-+/g, "-") || "background";
  const isVideo = [".mp4", ".mov", ".webm", ".m4v", ".gif"].includes(extension);
  const outputExtension = isVideo ? ".mp4" : extension;
  const destination = path.join(backgroundRoot, `${sourceName}${outputExtension}`);
  let durationInFrames: number | undefined;
  if (isVideo) {
    const ffmpeg = await resolveFfmpeg();
    const frameRoot = path.join(backgroundRoot, "frames");
    await rm(frameRoot, { recursive: true, force: true });
    await mkdir(frameRoot, { recursive: true });
    const framePattern = path.join(frameRoot, "frame-%04d.jpg");
    console.log(`[节点 5] 预解码动态背景素材（1080×1920，30fps，JPEG 帧缓存）：${path.basename(source)}`);
    await execFileAsync(ffmpeg, ["-y", "-i", source, "-an", "-vf", "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920", "-r", "30", "-q:v", "5", framePattern], { windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
    const frameFiles = (await readdir(frameRoot)).filter((file) => /^frame-\d+\.jpg$/iu.test(file)).sort();
    durationInFrames = frameFiles.length;
    if (!durationInFrames) throw new Error(`无法生成动态背景帧：${path.basename(source)}`);
    console.log(`[节点 5] 背景已准备：${durationInFrames} 帧，约 ${(durationInFrames / FPS).toFixed(1)} 秒循环`);
    return {
      backgroundFrames: frameFiles.map((file) => path.relative("public", path.join(frameRoot, file)).replaceAll("\\", "/")),
      durationInFrames,
    };
  } else {
    await copyFile(source, destination);
  }
  return { asset: path.relative("public", destination).replaceAll("\\", "/"), durationInFrames };
}

function outputName(project: RenderProject): string {
  return `rank-${String(project.rank).padStart(2, "0")}-${repoSlug(project.repo)}.mp4`;
}

async function stageAssets(project: RenderProject, runId: string): Promise<RenderProject> {
  const slug = repoSlug(project.repo);
  const assetRoot = path.join("public", "generated", runId, slug);
  await mkdir(assetRoot, { recursive: true });
  const segments: RenderProject["narrationSegments"] = [];
  for (const segment of project.narrationSegments) {
    const filename = path.basename(segment.audio);
    const destination = path.join(assetRoot, filename);
    await copyFile(segment.audio, destination);
    segments.push({ ...segment, audio: `generated/${runId}/${slug}/${filename}`.replaceAll("\\", "/") });
  }
  const visualAssets: NonNullable<RenderProject["visualAssets"]> = [];
  for (const asset of project.visualAssets ?? []) {
    if (isBadgeAsset(asset)) {
      console.log(`[节点 5] 跳过徽标：${project.repo} / ${asset.label}`);
      continue;
    }
    const filename = path.basename(asset.path);
    const destination = path.join(assetRoot, filename);
    await copyFile(path.resolve(asset.path), destination);
    visualAssets.push({ ...asset, path: `generated/${runId}/${slug}/${filename}`.replaceAll("\\", "/") });
  }
  return { ...project, narrationSegments: segments, visualAssets };
}

export async function renderVideos(projects: RenderProject[], leaderboard: TrendingRepo[], outputDirectory: string, runId: string): Promise<string[]> {
  const selected = projects.slice().sort((a, b) => a.rank - b.rank);
  if (!selected.length) throw new Error("节点 5 没有收到待渲染的项目");
  await mkdir(outputDirectory, { recursive: true });
  await mkdir("public", { recursive: true });
  const inputProjects = await Promise.all(selected.map((project) => stageAssets(project, runId)));
  const background = await stageBackgroundAsset(runId);
  await writeJson(path.join(outputDirectory, "render-input.json"), inputProjects);
  console.log("[节点 5] 打包 Remotion 动画模板");
  const serveUrl = await bundle({
    entryPoint: path.resolve("src/video/index.tsx"),
    publicDir: path.resolve("public"),
    onProgress: (progress) => process.stdout.write(`\r  视频模板构建 ${Math.round(progress)}%`),
  });
  process.stdout.write("\n");
  const output: string[] = [];
  for (const [index, project] of inputProjects.entries()) {
    const inputProps: VideoProps = { project, leaderboard, background: background?.asset, backgroundFrames: background?.backgroundFrames, backgroundDurationInFrames: background?.durationInFrames };
    const composition = await selectComposition({
      serveUrl,
      id: "ProjectVideo",
      inputProps,
      browserExecutable: config.remotionBrowserExecutable,
    });
    const outputPath = path.join(outputDirectory, outputName(project));
    console.log(`[节点 5] ${index + 1}/${inputProjects.length} 渲染 ${project.repo} (${(durationInFrames(project) / FPS).toFixed(1)} 秒)`);
    let lastRenderPercent = -1;
    await renderMedia({
      composition,
      serveUrl,
      codec: "h264",
      audioCodec: "aac",
      outputLocation: outputPath,
      inputProps,
      browserExecutable: config.remotionBrowserExecutable,
      concurrency: 2,
      onProgress: ({ progress }) => {
        const percent = Math.round(progress * 100);
        if (percent !== lastRenderPercent) { lastRenderPercent = percent; console.log(`[节点 5] 帧渲染 ${percent}%`); }
      },
    });
    process.stdout.write("\n");
    output.push(outputPath);
  }
  return output;
}
