import path from "node:path";
import { readdir } from "node:fs/promises";
import type { LeaderboardContext, ProjectScript, RepoFacts, RenderProject, TrendingSnapshot } from "./types";
import { collectTrending } from "./nodes/trending";
import { collectRepositoryFacts } from "./nodes/repository";
import { generateScripts } from "./nodes/script";
import { synthesizeScripts } from "./nodes/tts";
import { renderVideos } from "./nodes/render";
import { createRunId, createRunPaths, getOutputRoot } from "./lib/paths";
import { readJson, writeJson } from "./lib/io";
import { config } from "./lib/config";
import { leaderboardPresentation, snapshotContext } from "./lib/leaderboard";

type RunReport = {
  runId: string;
  startedAt: string;
  finishedAt?: string;
  status: "running" | "failed" | "nodes-1-to-5-complete";
  completedNodes: string[];
  failedAt?: string;
  error?: string;
  leaderboard?: LeaderboardContext;
  topN?: number;
};

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function getRunPaths(createIfMissing = false) {
  const runId = argValue("--run-id");
  if (runId) return createRunPaths(runId);
  if (createIfMissing) return createRunPaths(createRunId());
  const latest = await readJson<{ runId: string }>(path.join(getOutputRoot(), "latest-run.json")).catch(() => null);
  if (!latest) throw new Error("还没有运行期次，请先执行 pnpm run trending，或使用 --run-id 指定期次。");
  return createRunPaths(latest.runId);
}

async function markLatest(runId: string): Promise<void> {
  await writeJson(path.join(getOutputRoot(), "latest-run.json"), { runId });
}

async function readFacts(directory: string): Promise<RepoFacts[]> {
  const names = (await readdir(directory)).filter((name) => name.endsWith(".json") && name !== "index.json").sort();
  const facts = await Promise.all(names.map((name) => readJson<RepoFacts>(path.join(directory, name))));
  return facts.sort((a, b) => a.rank - b.rank);
}

async function readScripts(directory: string): Promise<ProjectScript[]> {
  return readJson<ProjectScript[]>(path.join(directory, "index.json"));
}

async function runNode1(runId: string) {
  const paths = await createRunPaths(runId);
  const snapshot = await collectTrending(paths.trending, path.join(paths.root, "trending-source.html"));
  console.log(`[节点 1] 已保存 ${snapshot.repos.length} 个${leaderboardPresentation(snapshot.leaderboard).name}项目：${paths.trending}`);
  return snapshot;
}

async function runNode2(snapshot: TrendingSnapshot, runId: string) {
  const paths = await createRunPaths(runId);
  const topN = snapshot.topN ?? config.githubTopN;
  console.log(`[节点 2] 按 Top ${topN} 获取项目资料`);
  const facts = await collectRepositoryFacts(snapshot, paths.repos, topN);
  console.log(`[节点 2] 已保存 ${facts.length} 份项目资料：${paths.repos}`);
  return facts;
}

async function runNode3(facts: RepoFacts[], runId: string) {
  const paths = await createRunPaths(runId);
  const snapshot = await readJson<TrendingSnapshot>(paths.trending);
  const context = snapshotContext(snapshot);
  const scripts = await generateScripts(facts.map((item) => ({ ...item, leaderboard: context })), paths.scripts);
  console.log(`[节点 3] 已生成 ${scripts.length} 份讲稿：${paths.scripts}`);
  return scripts;
}

async function runNode4(scripts: ProjectScript[], runId: string) {
  const paths = await createRunPaths(runId);
  const projects = await synthesizeScripts(scripts, paths.audio);
  console.log(`[节点 4] 已生成 ${projects.reduce((count, project) => count + project.narrationSegments.length, 0)} 段配音：${paths.audio}`);
  return projects;
}

async function runNode5(projects: RenderProject[], snapshot: TrendingSnapshot, runId: string) {
  const paths = await createRunPaths(runId);
  const outputDirectory = path.join(paths.root, "renders");
  const videos = await renderVideos(projects, snapshot.repos, outputDirectory, runId, snapshotContext(snapshot), snapshot.topN);
  await writeJson(path.join(outputDirectory, "index.json"), videos.map((file) => ({ file, repo: projects.find((project) => file.includes(project.repo.toLowerCase().replaceAll("/", "__")))?.repo ?? path.basename(file) })));
  console.log(`[节点 5] 渲染完成：${outputDirectory}`);
  return videos;
}

async function pipeline(runId: string): Promise<void> {
  const reportPath = path.join(getOutputRoot(), runId, "run-report.json");
  const report: RunReport = { runId, startedAt: new Date().toISOString(), status: "running", completedNodes: [] };
  await writeJson(reportPath, report);
  let node = "节点 1";
  try {
    const snapshot = await runNode1(runId);
    report.leaderboard = snapshotContext(snapshot);
    report.topN = snapshot.topN;
    report.completedNodes.push("节点 1");
    await writeJson(reportPath, report);
    node = "节点 2";
    const facts = await runNode2(snapshot, runId);
    report.completedNodes.push("节点 2");
    await writeJson(reportPath, report);
    node = "节点 3";
    const scripts = await runNode3(facts, runId);
    report.completedNodes.push("节点 3");
    await writeJson(reportPath, report);
    node = "节点 4";
    const projects = await runNode4(scripts, runId);
    report.completedNodes.push("节点 4");
    await writeJson(reportPath, report);
    node = "节点 5";
    await runNode5(projects, snapshot, runId);
    report.completedNodes.push("节点 5");
    report.status = "nodes-1-to-5-complete";
    report.finishedAt = new Date().toISOString();
    await writeJson(reportPath, report);
  } catch (error) {
    report.status = "failed";
    report.failedAt = node;
    report.error = error instanceof Error ? error.message : String(error);
    report.finishedAt = new Date().toISOString();
    await writeJson(reportPath, report);
    throw error;
  }
}

async function main(): Promise<void> {
  const command = process.argv[2] ?? "help";
  const initialRun = command === "run" || command === "trending";
  const paths = await getRunPaths(initialRun);
  const runId = path.basename(paths.root);
  await markLatest(runId);

  if (command === "trending") {
    await runNode1(runId);
    return;
  }
  if (command === "repos") {
    const snapshot = await readJson<TrendingSnapshot>(paths.trending);
    await runNode2(snapshot, runId);
    return;
  }
  if (command === "scripts") {
    await runNode3(await readFacts(paths.repos), runId);
    return;
  }
  if (command === "tts") {
    await runNode4(await readScripts(paths.scripts), runId);
    return;
  }
  if (command === "render") {
    const snapshot = await readJson<TrendingSnapshot>(paths.trending);
    const projects = await readJson<RenderProject[]>(path.join(paths.audio, "render-projects.json"));
    await runNode5(projects, snapshot, runId);
    return;
  }
  if (command === "run") {
    await pipeline(runId);
    return;
  }
  console.log([
    "开源项目视频 — 节点 1–5",
    "  pnpm run trending             # 节点 1：采集并保存周榜快照",
    "  pnpm run repos                # 节点 2：读取最近期次并收集配置数量的项目资料",
    "  pnpm run scripts              # 节点 3：批量生成/读取缓存讲稿",
    "  pnpm run tts                  # 节点 4：本地 Kokoro 中文分段配音",
    "  pnpm run render               # 节点 5：按配音时长渲染动画视频",
    "  pnpm run run                  # 节点 1–5：完整串行执行一次",
    "  pnpm run dev                  # Remotion Studio 预览模板样例",
    "  可选参数：--run-id <期次目录名>",
    "  配置：复制 .env.example 为 .env，填入 LEADERBOARD_SOURCE、模型、GitHub token、GITHUB_TOP_N 和 Kokoro 设置。",
  ].join("\n"));
}

main().catch((error: unknown) => {
  console.error(`\n流程失败：${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
