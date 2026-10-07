export const GITHUB_TRENDING_URL = 'https://github.com/trending?since=weekly' as const;

export type RankingItem = {
  rank: number;
  projectName: string;
  repositoryUrl: string;
  owner: string;
  stargazersCount: number;
  language: string | null;
  description: string;
  starsDelta: number | null;
  topics: string[];
  isArchived: boolean;
  capturedAt: string;
  defaultBranch?: string;
};

export type RankingSnapshot = {
  snapshotId: string;
  source: 'github-trending-weekly' | 'github-search-weekly';
  sourceUrl: string;
  period: 'weekly';
  fetchedAt: string;
  items: RankingItem[];
  fallbackUsed?: boolean;
  warning?: string;
  rawContentSha256?: string;
};

const decode = (value: string) => value.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const stripTags = (value: string) => decode(value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
const numberValue = (value: string | undefined) => {
  const parsed = Number((value ?? '').replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

export function parseTrendingHtml(html: string, capturedAt = new Date().toISOString()): RankingItem[] {
  if (!html.trim()) throw new Error('周榜 HTML 为空');
  const rows = [...html.matchAll(/<article\b[^>]*Box-row[^>]*>([\s\S]*?)<\/article>/gi)];
  const items: RankingItem[] = [];
  for (const row of rows) {
    const body = row[1];
    const repo = body.match(/href=["']\/(?<owner>[A-Za-z0-9_.-]+)\/(?<name>[A-Za-z0-9_.-]+)["']/i);
    if (!repo?.groups) continue;
    const owner = repo.groups.owner;
    const projectName = repo.groups.name;
    const stars = body.match(/href=["'][^"']*\/stargazers["'][^>]*>\s*(?<value>[0-9,]+)/i)?.groups?.value;
    const delta = stripTags(body).match(/([0-9,]+)\s+stars\s+this\s+week/i)?.[1];
    const language = body.match(/itemprop=["']programmingLanguage["'][^>]*>\s*([^<]+)/i)?.[1]?.trim() ?? null;
    const topics = [...body.matchAll(/(?:topic|Topic)[^>]*>\s*([^<]+)\s*</gi)]
      .map(match => decode(stripTags(match[1])))
      .filter(Boolean)
      .filter((topic, index, all) => all.findIndex(item => item.toLowerCase() === topic.toLowerCase()) === index);
    items.push({
      rank: items.length + 1,
      projectName: decode(projectName),
      repositoryUrl: `https://github.com/${owner}/${projectName}`,
      owner,
      stargazersCount: numberValue(stars),
      language: language ? decode(language) : null,
      description: stripTags(body),
      starsDelta: delta ? numberValue(delta) : null,
      topics,
      isArchived: false,
      capturedAt,
    });
  }
  if (!items.length) throw new Error('未在 GitHub 周榜 HTML 中解析到项目');
  return items;
}

export type CandidateFilter = {
  languages?: string[];
  minStars?: number;
  includeTopics?: string[];
  excludeTopics?: string[];
  excludedRepositories?: string[];
  generatedRepositories?: string[];
  generatedRepositoryDates?: Record<string, string>;
  excludeGeneratedWithinDays?: number;
  now?: string;
  excludeArchived?: boolean;
};

export function selectCandidates(snapshot: RankingSnapshot, batchCount: number, filter: CandidateFilter, shortagePolicy: 'continue-with-available' | 'fail-task') {
  if (!Number.isInteger(batchCount) || batchCount < 1 || batchCount > 100) throw new Error('batchCount 必须为 1-100 的整数');
  const seen = new Set<string>();
  const languages = new Set(filter.languages ?? []);
  const includes = new Set(filter.includeTopics ?? []);
  const excludes = new Set(filter.excludeTopics ?? []);
  const excludedRepos = new Set(filter.excludedRepositories ?? []);
  const generated = new Set(filter.generatedRepositories ?? []);
  const cooldownDays = filter.excludeGeneratedWithinDays ?? 0;
  if (!Number.isInteger(cooldownDays) || cooldownDays < 0) throw new Error('excludeGeneratedWithinDays 必须为非负整数');
  const now = Date.parse(filter.now ?? new Date().toISOString());
  if (!Number.isFinite(now)) throw new Error('now 必须为有效 ISO 日期');
  const generatedDates = new Map(Object.entries(filter.generatedRepositoryDates ?? {}).map(([url, value]) => [url.toLowerCase(), Date.parse(value)]));
  const candidates = snapshot.items.filter(item => {
    if (seen.has(item.repositoryUrl.toLowerCase())) return false;
    seen.add(item.repositoryUrl.toLowerCase());
    if (filter.excludeArchived !== false && item.isArchived) return false;
    if (languages.size && (!item.language || !languages.has(item.language))) return false;
    if ((item.stargazersCount ?? 0) < (filter.minStars ?? 0)) return false;
    if (excludedRepos.has(item.repositoryUrl) || generated.has(item.repositoryUrl)) return false;
    const generatedAt = generatedDates.get(item.repositoryUrl.toLowerCase());
    if (generatedAt !== undefined && !Number.isNaN(generatedAt) && cooldownDays > 0 && now - generatedAt >= 0 && now - generatedAt <= cooldownDays * 86_400_000) return false;
    if (includes.size && ![...includes].some(topic => item.topics.includes(topic))) return false;
    if ([...excludes].some(topic => item.topics.includes(topic))) return false;
    return true;
  }).sort((a, b) => a.rank - b.rank).slice(0, batchCount);
  const warnings = candidates.length < batchCount ? [`候选项目不足：需要 ${batchCount} 个，实际 ${candidates.length} 个。`] : [];
  return { candidates, warnings, failed: candidates.length < batchCount && shortagePolicy === 'fail-task' };
}
