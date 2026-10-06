import path from "node:path";
import { mkdir } from "node:fs/promises";
import type { RunPaths } from "../types";

export function getOutputRoot(): string {
  return path.resolve(process.env.GITHUB_TRENDING_OUTPUT_DIR ?? "output");
}

export function createRunId(now = new Date()): string {
  return now.toISOString().replaceAll(":", "-").replaceAll(".", "-");
}

export async function createRunPaths(runId = createRunId()): Promise<RunPaths> {
  const root = path.join(getOutputRoot(), runId);
  const paths: RunPaths = {
    root,
    trending: path.join(root, "trending.json"),
    repos: path.join(root, "repos"),
    scripts: path.join(root, "scripts"),
    audio: path.join(root, "audio"),
    renderInput: path.join(root, "render-input.json"),
  };
  await Promise.all([root, paths.repos, paths.scripts, paths.audio].map((p) => mkdir(p, { recursive: true })));
  return paths;
}

export function repoSlug(fullName: string): string {
  return fullName.toLowerCase().replaceAll("/", "__").replace(/[^a-z0-9_.-]/g, "_");
}
