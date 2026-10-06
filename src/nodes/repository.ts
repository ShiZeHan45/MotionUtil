import type { RepoFacts, TrendingRepo, TrendingSnapshot } from "../types";
import { config } from "../lib/config";
import { repoSlug } from "../lib/paths";
import { writeJson } from "../lib/io";

const API = "https://api.github.com";
const API_VERSION = "2022-11-28";
const README_LIMIT = 18_000;

async function githubGet<T>(url: string): Promise<T> {
  let lastError = "unknown GitHub API error";
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(url, {
      headers: {
        accept: "application/vnd.github+json",
        "x-github-api-version": API_VERSION,
        "user-agent": "GitHub-Trending-Video/0.1",
        ...(config.githubToken ? { authorization: `Bearer ${config.githubToken}` } : {}),
      },
      signal: AbortSignal.timeout(30_000),
    });
    if (response.ok) return (await response.json()) as T;
    const body = await response.text();
    lastError = `${response.status} ${response.statusText}: ${body.slice(0, 400)}`;
    const limited = response.status === 429 || (response.status === 403 && (response.headers.has("retry-after") || response.headers.get("x-ratelimit-remaining") === "0"));
    if (!limited || attempt === 2) break;
    const retryAfter = Number(response.headers.get("retry-after"));
    const resetAt = Number(response.headers.get("x-ratelimit-reset"));
    const delayMs = retryAfter > 0 ? retryAfter * 1_000 : resetAt > 0 ? Math.max(1_000, resetAt * 1_000 - Date.now()) : (attempt + 1) * 2_000;
    await new Promise((resolve) => setTimeout(resolve, Math.min(delayMs, 60_000)));
  }
  throw new Error(`GitHub API 请求失败 (${url}): ${lastError}`);
}

type GithubRepoResponse = {
  html_url: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  homepage: string | null;
  topics?: string[];
  license: { spdx_id: string | null; name: string } | null;
  default_branch: string;
  updated_at: string;
};

type GithubReadmeResponse = {
  download_url: string | null;
  content?: string;
  encoding?: string;
  html_url: string;
};

async function collectOne(trending: TrendingRepo): Promise<RepoFacts> {
  const endpoint = `${API}/repos/${trending.owner}/${trending.name}`;
  const repo = await githubGet<GithubRepoResponse>(endpoint);
  let readme: RepoFacts["readme"] = null;
  try {
    const result = await githubGet<GithubReadmeResponse>(`${endpoint}/readme`);
    let text = "";
    if (result.content && result.encoding === "base64") text = Buffer.from(result.content.replace(/\n/g, ""), "base64").toString("utf8");
    else if (result.download_url) {
      const raw = await fetch(result.download_url, { signal: AbortSignal.timeout(30_000) });
      if (raw.ok) text = await raw.text();
    }
    readme = { sourceUrl: result.html_url, text: text.slice(0, README_LIMIT) };
  } catch (error) {
    // README is useful but not guaranteed; preserve its absence instead of inventing content.
    if (!(error instanceof Error) || !error.message.includes("404")) throw error;
  }
  const facts: RepoFacts = {
    ...trending,
    url: repo.html_url,
    description: repo.description ?? trending.description,
    language: repo.language ?? trending.language,
    totalStars: repo.stargazers_count,
    fetchedAt: new Date().toISOString(),
    apiUrl: endpoint,
    homepage: repo.homepage || null,
    topics: repo.topics ?? [],
    license: repo.license ? { spdxId: repo.license.spdx_id, name: repo.license.name } : null,
    defaultBranch: repo.default_branch,
    updatedAt: repo.updated_at,
    readme,
    sources: [trending.url, endpoint, ...(readme ? [readme.sourceUrl] : [])],
  };
  return facts;
}

export async function collectRepositoryFacts(snapshot: TrendingSnapshot, outputDirectory: string, top = 5): Promise<RepoFacts[]> {
  const selected = snapshot.repos.slice(0, top);
  if (selected.length < top) throw new Error(`榜单只有 ${selected.length} 个项目，无法收集要求的前 ${top} 项。`);
  const results: RepoFacts[] = [];
  for (const [index, item] of selected.entries()) {
    console.log(`[节点 2] ${index + 1}/${selected.length} 获取 ${item.fullName}`);
    const facts = await collectOne(item);
    await writeJson(`${outputDirectory}/${repoSlug(item.fullName)}.json`, facts);
    results.push(facts);
  }
  await writeJson(`${outputDirectory}/index.json`, results.map(({ fullName, rank, url, fetchedAt }) => ({ fullName, rank, url, fetchedAt })));
  return results;
}
