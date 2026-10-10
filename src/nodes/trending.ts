import * as cheerio from "cheerio";
import { writeFile } from "node:fs/promises";
import type { TrendingRepo, TrendingSnapshot } from "../types";
import { config } from "../lib/config";
import { writeJson } from "../lib/io";
import { leaderboardPresentation } from "../lib/leaderboard";
import { parseStarHistoryHtml } from "./star-history";

function countFromText(text: string): number | null {
  const clean = text.trim().replaceAll(",", "").replace(/\s+/g, " ");
  const match = clean.match(/([\d.]+)\s*([kmb])?/i);
  if (!match?.[1]) return null;
  const amount = Number(match[1]);
  const scale = ({ k: 1_000, m: 1_000_000, b: 1_000_000_000 } as Record<string, number>)[(match[2] ?? "").toLowerCase()] ?? 1;
  return Number.isFinite(amount) ? Math.round(amount * scale) : null;
}

export function parseTrendingHtml(html: string, sourceUrl: string, capturedAt = new Date().toISOString()): TrendingSnapshot {
  const $ = cheerio.load(html);
  const rows = $("article.Box-row").toArray();
  if (rows.length === 0) throw new Error("GitHub Trending 页面结构已变化：找不到项目卡片，停止采集以避免使用错误榜单。");

  const repos: TrendingRepo[] = [];
  for (const row of rows) {
    const card = $(row);
    const repositoryLink = card.find("h2 a").first();
    const href = repositoryLink.attr("href")?.replace(/\/$/, "");
    if (!href || !/^\/[\w.-]+\/[\w.-]+$/.test(href)) continue;

    const [, owner, name] = href.split("/");
    const description = card.find("p").first().text().replace(/\s+/g, " ").trim();
    const language = card.find('[itemprop="programmingLanguage"]').first().text().trim() || null;
    const links = card.find("a").toArray().map((anchor) => ({
      href: $(anchor).attr("href") ?? "",
      text: $(anchor).text().replace(/\s+/g, " ").trim(),
    }));
    const starsLink = links.find((link) => link.href.endsWith("/stargazers"));
    const starsThisWeekText = card.text().match(/([\d,.]+\s*[kmb]?)\s+stars?\s+this\s+week/i)?.[1] ?? "";

    if (!owner || !name) continue;
    repos.push({
      rank: repos.length + 1,
      owner,
      name,
      fullName: `${owner}/${name}`,
      url: `https://github.com${href}`,
      description,
      language,
      totalStars: starsLink ? countFromText(starsLink.text) : null,
      starsThisWeek: countFromText(starsThisWeekText),
    });
  }
  if (repos.length < config.githubTopN) throw new Error(`GitHub Trending 解析结果只有 ${repos.length} 个仓库（配置需要前 ${config.githubTopN} 个），停止处理。`);
  const leaderboard = { source: "github-trending" as const, period: "weekly" as const, sourceUrl, periodStart: null, periodEnd: null };
  return { capturedAt, period: "weekly", sourceUrl, repos: repos.map((repo) => ({ ...repo, leaderboard })), leaderboard, topN: config.githubTopN };
}

export async function collectTrending(outputJson: string, rawHtmlPath: string): Promise<TrendingSnapshot> {
  const sourceUrl = config.leaderboardSource === "star-history" ? "https://www.star-history.com/" : config.githubTrendingUrl;
  const response = await fetch(sourceUrl, {
    headers: {
      "user-agent": "GitHub-Trending-Video/0.1 (+local content tool)",
      "accept": "text/html,application/xhtml+xml",
      "accept-language": "en-US,en;q=0.9",
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`榜单请求失败：HTTP ${response.status} ${response.statusText}`);
  const html = await response.text();
  const snapshot = config.leaderboardSource === "star-history"
    ? parseStarHistoryHtml(html, sourceUrl)
    : parseTrendingHtml(html, sourceUrl);
  console.log(`[节点 1] ${leaderboardPresentation(snapshot.leaderboard).name}；统计区间：${leaderboardPresentation(snapshot.leaderboard).dateLabel || "来源未提供固定起止日期"}`);
  await Promise.all([writeJson(outputJson, snapshot), writeFile(rawHtmlPath, html, "utf8")]);
  return snapshot;
}
