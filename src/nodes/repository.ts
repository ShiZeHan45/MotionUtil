import type { RepoFacts, TrendingRepo, TrendingSnapshot } from "../types";
import { config } from "../lib/config";
import { repoSlug } from "../lib/paths";
import { writeJson } from "../lib/io";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { isBadgeAsset } from "../lib/visual-assets";

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

type ReadmeImage = { sourceUrl: string; label: string };

function readmeImages(markdown: string, readmeUrl: string): ReadmeImage[] {
  const results: ReadmeImage[] = [];
  const seen = new Set<string>();
  const add = (rawUrl: string, label: string) => {
    const trimmed = rawUrl.trim().replace(/^<|>$/g, "");
    if (!trimmed || trimmed.startsWith("data:") || trimmed.startsWith("#")) return;
    try {
      const sourceUrl = new URL(trimmed, readmeUrl).toString();
      if (!/^https?:\/\//iu.test(sourceUrl) || seen.has(sourceUrl)) return;
      seen.add(sourceUrl);
      const image = { sourceUrl, label: label.trim() || `README 图片 ${results.length + 1}` };
      if (!isBadgeAsset(image)) results.push(image);
    } catch {
      // Ignore malformed README links and preserve the rest of the repository facts.
    }
  };
  for (const match of markdown.matchAll(/!\[([^\]]*)\]\(\s*<?([^\s)>]+)>?(?:\s+["'][^)]*["'])?\s*\)/giu)) add(match[2]!, match[1]!);
  for (const match of markdown.matchAll(/<img\b[^>]*?src=["']([^"']+)["'][^>]*>/giu)) {
    const alt = match[0].match(/\balt=["']([^"']*)["']/iu)?.[1] ?? "";
    add(match[1]!, alt);
  }
  return results.slice(0, 4);
}

function assetExtension(sourceUrl: string, contentType: string): string {
  const fromUrl = path.extname(new URL(sourceUrl).pathname).toLowerCase();
  if (/^\.(?:png|jpe?g|webp|gif|svg)$/iu.test(fromUrl)) return fromUrl;
  const fromType = contentType.split(";", 1)[0]?.toLowerCase();
  return fromType === "image/jpeg" ? ".jpg" : fromType === "image/webp" ? ".webp" : fromType === "image/gif" ? ".gif" : fromType === "image/svg+xml" ? ".svg" : ".png";
}

async function downloadReadmeImages(images: ReadmeImage[], outputDirectory: string, slug: string) {
  const assets: NonNullable<RepoFacts["visualAssets"]> = [];
  const assetDirectory = path.resolve(outputDirectory, "assets", slug);
  await mkdir(assetDirectory, { recursive: true });
  for (const [index, image] of images.entries()) {
    try {
      const response = await fetch(image.sourceUrl, {
        headers: { "user-agent": "GitHub-Trending-Video/0.1", accept: "image/avif,image/webp,image/png,image/jpeg,image/svg+xml,*/*" },
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) continue;
      const contentType = response.headers.get("content-type") ?? "";
      if (contentType && !contentType.toLowerCase().startsWith("image/")) continue;
      const buffer = Buffer.from(await response.arrayBuffer());
      if (!buffer.length || buffer.length > 12 * 1024 * 1024) continue;
      const filename = `readme-${String(index + 1).padStart(2, "0")}${assetExtension(image.sourceUrl, contentType)}`;
      const localPath = path.join(assetDirectory, filename);
      await writeFile(localPath, buffer);
      assets.push({ id: `readme-image-${index + 1}`, path: localPath, label: image.label, sourceUrl: image.sourceUrl });
    } catch {
      // A broken image must not make node 2 fail; the animation will use its abstract fallback.
    }
  }
  return assets;
}

async function collectOne(trending: TrendingRepo, outputDirectory: string): Promise<RepoFacts> {
  const endpoint = `${API}/repos/${trending.owner}/${trending.name}`;
  const repo = await githubGet<GithubRepoResponse>(endpoint);
  let readme: RepoFacts["readme"] = null;
  let visualAssets: RepoFacts["visualAssets"] = [];
  try {
    const result = await githubGet<GithubReadmeResponse>(`${endpoint}/readme`);
    let text = "";
    if (result.content && result.encoding === "base64") text = Buffer.from(result.content.replace(/\n/g, ""), "base64").toString("utf8");
    else if (result.download_url) {
      const raw = await fetch(result.download_url, { signal: AbortSignal.timeout(30_000) });
      if (raw.ok) text = await raw.text();
    }
    readme = { sourceUrl: result.html_url, text: text.slice(0, README_LIMIT) };
    const images = readmeImages(text, result.download_url ?? result.html_url);
    visualAssets = await downloadReadmeImages(images, outputDirectory, repoSlug(trending.fullName));
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
    visualAssets,
    sources: [trending.url, endpoint, ...(readme ? [readme.sourceUrl] : []), ...visualAssets.map((asset) => asset.sourceUrl)],
  };
  return facts;
}

export async function collectRepositoryFacts(snapshot: TrendingSnapshot, outputDirectory: string, top = 5): Promise<RepoFacts[]> {
  const selected = snapshot.repos.slice(0, top);
  if (selected.length < top) throw new Error(`榜单只有 ${selected.length} 个项目，无法收集要求的前 ${top} 项。`);
  const results: RepoFacts[] = [];
  for (const [index, item] of selected.entries()) {
    console.log(`[节点 2] ${index + 1}/${selected.length} 获取 ${item.fullName}`);
    const facts = await collectOne(item, outputDirectory);
    await writeJson(`${outputDirectory}/${repoSlug(item.fullName)}.json`, facts);
    results.push(facts);
  }
  await writeJson(`${outputDirectory}/index.json`, results.map(({ fullName, rank, url, fetchedAt }) => ({ fullName, rank, url, fetchedAt })));
  return results;
}
