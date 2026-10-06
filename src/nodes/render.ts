import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { RenderProject, TrendingRepo } from "../types";
import { config } from "../lib/config";
import { repoSlug } from "../lib/paths";
import { writeJson } from "../lib/io";
import { durationInFrames, FPS, type VideoProps } from "../video/ProjectVideo";

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
  await writeJson(path.join(outputDirectory, "render-input.json"), inputProjects);
  console.log("[节点 5] 打包 Remotion 动画模板");
  const serveUrl = await bundle({
    entryPoint: path.resolve("src/video/index.tsx"),
    publicDir: path.resolve("public"),
    onProgress: (progress) => process.stdout.write(`\r  视频模板构建 ${Math.round(progress * 100)}%`),
  });
  process.stdout.write("\n");
  const output: string[] = [];
  for (const [index, project] of inputProjects.entries()) {
    const inputProps: VideoProps = { project, leaderboard };
    const composition = await selectComposition({
      serveUrl,
      id: "ProjectVideo",
      inputProps,
      browserExecutable: config.remotionBrowserExecutable,
    });
    const outputPath = path.join(outputDirectory, outputName(project));
    console.log(`[节点 5] ${index + 1}/${inputProjects.length} 渲染 ${project.repo} (${(durationInFrames(project) / FPS).toFixed(1)} 秒)`);
    await renderMedia({
      composition,
      serveUrl,
      codec: "h264",
      audioCodec: "aac",
      outputLocation: outputPath,
      inputProps,
      browserExecutable: config.remotionBrowserExecutable,
      concurrency: 2,
      onProgress: ({ progress }) => process.stdout.write(`\r  帧渲染 ${Math.round(progress * 100)}%`),
    });
    process.stdout.write("\n");
    output.push(outputPath);
  }
  return output;
}
