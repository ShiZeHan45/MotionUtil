import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { openBrowser, renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import type { RenderProject, TrendingSnapshot } from "../src/types";
import type { VideoProps } from "../src/video/ProjectVideo";
import { parseStarHistoryHtml } from "../src/nodes/star-history";
import { leaderboardPresentation, snapshotContext } from "../src/lib/leaderboard";

// Render short silent previews without changing period data or calling the model.
const runDirectory = path.resolve(process.argv[2] ?? "output/2026-10-10T03-20-09-782Z");
const starHistoryHtml = path.resolve(process.argv[3] ?? ".cache/star-history-source.html");
const output = path.resolve(".cache/leaderboard-preview");
await mkdir(output, { recursive: true });
const github = JSON.parse(await readFile(path.join(runDirectory, "trending.json"), "utf8")) as TrendingSnapshot;
const starHistory = parseStarHistoryHtml(await readFile(starHistoryHtml, "utf8"));
const [original] = JSON.parse(await readFile(path.join(runDirectory, "audio/render-projects.json"), "utf8")) as RenderProject[];
if (!original) throw new Error("期次中没有可预览的项目");
const serveUrl = await bundle({ entryPoint: path.resolve("src/video/index.tsx"), publicDir: path.resolve("public") });
const browser = await openBrowser("chrome");
try {
  for (const snapshot of [github, starHistory]) {
    const context = snapshotContext(snapshot);
    const featured = snapshot.repos.slice(0, snapshot.topN ?? 5).find((repo) => repo.fullName.toLowerCase() === original.repo.toLowerCase()) ?? snapshot.repos[0]!;
    const text = `${leaderboardPresentation(context).name}第 ${featured.rank} 名，今天介绍 ${featured.fullName}。`;
    const project: RenderProject = { ...original, repo: featured.fullName, rank: featured.rank, leaderboard: context, narrationSegments: [{ scene: "intro", text, spokenText: text, audio: "", durationMs: 8_000 }] };
    const inputProps: VideoProps = { project, leaderboard: snapshot.repos.slice(0, snapshot.topN ?? 5), leaderboardContext: context };
    const composition = await selectComposition({ serveUrl, id: "ProjectVideo", inputProps, puppeteerInstance: browser });
    await renderStill({ serveUrl, composition, inputProps, puppeteerInstance: browser, frame: 100, output: path.join(output, `${context.source}.png`) });
    await renderMedia({ serveUrl, composition, inputProps, puppeteerInstance: browser, codec: "h264", outputLocation: path.join(output, `${context.source}.mp4`), concurrency: 2 });
    console.log(`Preview: ${context.source} -> ${output}`);
  }
} finally {
  await browser.close({ silent: true });
}
