import * as cheerio from "cheerio";
import type { LeaderboardContext, TrendingRepo, TrendingSnapshot } from "../types";
import { config } from "../lib/config";

function isoDate(value: string): string {
  const timestamp = Date.parse(`${value} 00:00:00 GMT`);
  if (!Number.isFinite(timestamp)) throw new Error(`Star History 统计日期无效：${value}`);
  return new Date(timestamp).toISOString().slice(0, 10);
}

export function parseStarHistoryHtml(html: string, sourceUrl = "https://www.star-history.com/", capturedAt = new Date().toISOString()): TrendingSnapshot {
  const $ = cheerio.load(html);
  $("script,style").remove();
  // Scope to the weekly list so all-time and promotional repositories cannot enter it.
  const first = $("li").filter((_, item) => {
    const spans = $(item).find("a").first().children("span");
    return spans.first().text().trim() === "1" && /^\+[\d,.]+[kmb]?$/iu.test(spans.last().text().trim());
  }).first();
  if (!first.length) throw new Error("Star History 周榜结构已变化：找不到涨星榜，停止采集。");
  const list = first.parent();
  if (!list.parent().find("button").toArray().some((button) => $(button).text().trim() === "Weekly")) throw new Error("Star History 页面未确认是 Weekly 榜单，停止采集。");
  const sectionText = list.parent().text().replace(/\s+/gu, " ");
  const dates = sectionText.match(/Updated\s+([A-Z][a-z]{2}\s+\d{1,2},\s+\d{4})\s*[–—-]\s*([A-Z][a-z]{2}\s+\d{1,2},\s+\d{4})/u);
  if (!dates) throw new Error("Star History 未提供可识别的周榜统计区间，停止采集以免误标周期。");
  const leaderboard: LeaderboardContext = { source: "star-history", period: "weekly", sourceUrl, periodStart: isoDate(dates[1]!), periodEnd: isoDate(dates[2]!) };
  if (leaderboard.periodStart! > leaderboard.periodEnd!) throw new Error("Star History 统计区间顺序无效。");
  const repos: TrendingRepo[] = [];
  const seen = new Set<string>();
  for (const item of list.children("li").toArray()) {
    const row = $(item);
    const link = row.children("a").first();
    const rankText = link.children("span").first().text().trim();
    const href = link.attr("href") ?? "";
    const match = href.match(/^\/([\w.-]+)\/([\w.-]+)\/?$/u);
    const rank = Number(rankText);
    // The hover metadata contains the exact count; the visible count is rounded.
    const tooltip = row.children("span").text().trim();
    const count = tooltip.match(/\+([\d,]+)\s*$/u)?.[1];
    if (!match || !count || !Number.isInteger(rank) || rank !== repos.length + 1) throw new Error("Star History 周榜条目缺少原始名次、仓库名或精确涨星数，停止采集。");
    const fullName = tooltip.match(/^([\w.-]+\/[\w.-]+)\s+\+/u)?.[1];
    if (!fullName || fullName.toLowerCase() !== `${match[1]}/${match[2]}`.toLowerCase()) throw new Error("Star History 仓库链接与榜单元数据不一致。");
    const [owner, name] = fullName.split("/");
    if (seen.has(fullName.toLowerCase())) throw new Error(`Star History 周榜存在重复仓库：${fullName}`);
    seen.add(fullName.toLowerCase());
    repos.push({ rank, owner: owner!, name: name!, fullName, url: `https://github.com/${fullName}`, description: "", language: null, totalStars: null, starsThisWeek: Number(count.replaceAll(",", "")), leaderboard });
  }
  if (repos.length < config.githubTopN) throw new Error(`Star History 周榜只有 ${repos.length} 个项目（需要前 ${config.githubTopN} 个）。`);
  return { capturedAt, period: "weekly", sourceUrl, leaderboard, topN: config.githubTopN, repos };
}
