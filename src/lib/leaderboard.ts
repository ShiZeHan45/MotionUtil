import type { LeaderboardContext, LeaderboardSource, TrendingSnapshot } from "../types";

export function leaderboardContext(value?: LeaderboardContext): LeaderboardContext {
  return value ?? { source: "github-trending", period: "weekly", sourceUrl: "https://github.com/trending?since=weekly", periodStart: null, periodEnd: null };
}

export function leaderboardPresentation(value?: LeaderboardContext) {
  const context = leaderboardContext(value);
  const starHistory = context.source === "star-history";
  return {
    name: starHistory ? "Star History 涨星周榜" : "GitHub Trending 周榜",
    title: starHistory ? "开源涨星周榜" : "开源热门周榜",
    mark: starHistory ? "STAR HISTORY · WEEKLY" : "GITHUB · TRENDING",
    metricLabel: context.periodStart && context.periodEnd ? "当期新增" : starHistory ? "周新增" : "本周新增",
    dateLabel: context.periodStart && context.periodEnd ? `${context.periodStart} 至 ${context.periodEnd}` : "",
  };
}

export function snapshotContext(snapshot: TrendingSnapshot): LeaderboardContext {
  return leaderboardContext(snapshot.leaderboard);
}

export function parseLeaderboardSource(value?: string): LeaderboardSource {
  if (!value || value === "github-trending") return "github-trending";
  if (value === "star-history") return value;
  throw new Error(`不支持的榜单来源：${value}`);
}
