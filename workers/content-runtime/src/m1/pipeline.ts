import { OpenAiCompatibleClient, type ModelProfile } from './llm.ts';
import type { RankingItem } from './ranking.ts';
import { verifyEvidence } from './evidence.ts';

export type SourceRecord = { sourceId: string; url: string; fetchedAt: string; status: number; contentType: string; text: string; sha256: string; error?: string };
export type EvidenceClaim = { claimId: string; subject: string; field: string; value: unknown; sourceRefs: string[]; evidenceQuote: string; capturedAt: string; confidence: number; status: 'verified' | 'conflict' | 'insufficient' | 'hypothesis' };
export type EvidencePack = { projectId: string; sources: SourceRecord[]; claims: EvidenceClaim[] };

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
}

export class SourceCollector {
  private readonly fetcher: typeof fetch;
  private readonly maxRetries: number;
  constructor(fetcher: typeof fetch = fetch, maxRetries = 2) { this.fetcher = fetcher; this.maxRetries = Math.max(0, maxRetries); }
  async collect(urls: string[], signal?: AbortSignal): Promise<SourceRecord[]> {
    const results: SourceRecord[] = [];
    for (const url of urls) {
      let lastError: unknown;
      for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
        try {
          const response = await this.fetcher(url, { signal });
          const text = await response.text();
          if (!response.ok && attempt < this.maxRetries) throw new Error(`HTTP ${response.status}`);
          results.push({ sourceId: `source-${results.length + 1}`, url, fetchedAt: new Date().toISOString(), status: response.status, contentType: response.headers.get('content-type') ?? '', text, sha256: await sha256(text), ...(!response.ok ? { error: `HTTP ${response.status}` } : {}) });
          lastError = undefined;
          break;
        } catch (error) {
          if (error instanceof Error && error.name === 'AbortError') throw error;
          lastError = error;
          if (attempt < this.maxRetries) await new Promise(resolve => setTimeout(resolve, 100 * 2 ** attempt));
        }
      }
      if (lastError) throw new Error(`来源采集失败 ${url}: ${String(lastError)}`);
    }
    return results;
  }
}

export type ResearchPlan = { urls: string[]; rationale?: string };

export class SourceCollectorNode {
  private readonly collector: SourceCollector;
  constructor(fetcher: typeof fetch = fetch, maxRetries = 2) { this.collector = new SourceCollector(fetcher, maxRetries); }
  async run(plan: ResearchPlan, signal?: AbortSignal) {
    return this.collector.collect([...new Set(plan.urls.filter(Boolean))], signal);
  }
}

export class AIResearchPlanner {
  private readonly client: OpenAiCompatibleClient;
  constructor(client: OpenAiCompatibleClient) { this.client = client; }
  plan(project: RankingItem, signal?: AbortSignal) {
    return this.client.completeJson<{ urls: string[] }>([
      { role: 'system', content: '你是资料规划器，只输出 JSON：{"urls":[string]}。只允许官方仓库、文档、发布记录、许可证和公开案例来源。' },
      { role: 'user', content: JSON.stringify({ projectName: project.projectName, repositoryUrl: project.repositoryUrl, description: project.description }) },
    ], undefined, signal);
  }
}

export class ScriptPlanner {
  private readonly client: OpenAiCompatibleClient;
  constructor(client: OpenAiCompatibleClient) { this.client = client; }
  plan(project: RankingItem, evidence: EvidencePack, signal?: AbortSignal) {
    return this.client.completeJson<{ chapters: unknown[] }>([
      { role: 'system', content: '你是视频脚本规划器。只输出符合 storyboard.schema.json 的五章节 JSON；hook 必须是 conclusion 最后一个 beat。' },
      { role: 'user', content: JSON.stringify({ project, evidence }) },
    ], undefined, signal);
  }
}

export class EvidencePackBuilder {
  build(project: RankingItem, sources: SourceRecord[], projectId = project.repositoryUrl): EvidencePack {
    const githubSource = sources.find(source => source.url.replace(/\/$/, '') === project.repositoryUrl.replace(/\/$/, ''));
    const sourceRefs = githubSource ? [githubSource.sourceId] : [];
    const githubQuote = githubSource ? sourceQuote(githubSource.text, [project.projectName, `${project.stargazersCount.toLocaleString('en-US')} stars`, `${project.stargazersCount} stars`, String(project.stargazersCount)]) : '';
    const githubHasStarFact = githubQuote.length > 0 && new RegExp(`(?:${project.stargazersCount.toLocaleString('en-US').replace(',', '[, ]?')}|${project.stargazersCount})`).test(githubQuote);
    const claims: EvidenceClaim[] = [
      { claimId: 'claim-project-name', subject: 'project', field: 'projectName', value: project.projectName, sourceRefs, evidenceQuote: sourceQuote(githubSource?.text ?? '', [project.projectName]), capturedAt: githubSource?.fetchedAt ?? project.capturedAt, confidence: githubSource && githubQuote.includes(project.projectName) ? 0.95 : 0, status: githubSource && githubQuote.includes(project.projectName) ? 'verified' : 'insufficient' },
      { claimId: 'claim-stargazers', subject: 'project', field: 'stargazersCount', value: project.stargazersCount, sourceRefs: githubHasStarFact ? sourceRefs : [], evidenceQuote: githubHasStarFact ? githubQuote : '', capturedAt: githubSource?.fetchedAt ?? project.capturedAt, confidence: githubHasStarFact ? 0.98 : 0, status: githubHasStarFact ? 'verified' : 'insufficient' },
    ];
    const licenseSource = sources.find(source => /license/i.test(source.url) && source.status >= 200 && source.status < 300);
    claims.push({ claimId: 'claim-license', subject: 'project', field: 'license', value: extractLicense(licenseSource?.text), sourceRefs: licenseSource ? [licenseSource.sourceId] : [], evidenceQuote: licenseSource ? licenseSource.text.slice(0, 240) : '', capturedAt: licenseSource?.fetchedAt ?? project.capturedAt, confidence: licenseSource ? 0.85 : 0, status: licenseSource ? 'verified' : 'insufficient' });
    const readme = sources.find(source => /readme/i.test(source.url));
    claims.push({ claimId: 'claim-case', subject: 'project', field: 'case', value: readme ? 'official README example' : null, sourceRefs: readme ? [readme.sourceId] : [], evidenceQuote: readme ? readme.text.slice(0, 240) : '', capturedAt: readme?.fetchedAt ?? project.capturedAt, confidence: readme ? 0.72 : 0, status: readme ? 'verified' : 'insufficient' });
    return { projectId, sources, claims };
  }
}

function sourceQuote(text: string, needles: string[]): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  const index = needles.map(needle => normalized.toLowerCase().indexOf(needle.toLowerCase())).find(index => index >= 0) ?? -1;
  if (index < 0) return '';
  return normalized.slice(Math.max(0, index - 100), Math.min(normalized.length, index + 220));
}

function extractLicense(text: string | undefined): string | null {
  if (!text) return null;
  const match = text.match(/(?:license|许可协议)\s*[:：-]?\s*([A-Za-z0-9 .+-]{2,40})/i);
  return match?.[1]?.trim() ?? (text.trim().length > 0 ? '见官方许可证文本' : null);
}

export class EvidenceVerifier {
  verify(pack: EvidencePack) { return verifyEvidence(pack); }
}

export class FactNormalizer {
  normalize(pack: EvidencePack): EvidencePack {
    return { ...pack, claims: pack.claims.map(claim => ({ ...claim, evidenceQuote: claim.evidenceQuote.trim() })) };
  }
}

export class HookGenerator {
  generate(projectName: string) {
    return `如果是你，你会把 ${projectName} 用在哪个场景？欢迎在评论区告诉我。`;
  }
}

export class DomainPackageResolver {
  resolve(domainId = 'github-open-source') {
    return { domainId, sourcePolicy: 'official-first', requiredEvidence: ['project', 'license', 'case', 'limitation'] };
  }
}

export function planOfficialSources(project: RankingItem): ResearchPlan {
  const base = project.repositoryUrl.replace(/\/$/, '');
  const branch = String((project as RankingItem & { defaultBranch?: string }).defaultBranch || 'main');
  return { urls: [base, `${base}/README.md`, `${base}/releases`, `${base}/blob/${branch}/LICENSE`] };
}

export function createContentClient(profile: ModelProfile) { return new OpenAiCompatibleClient(profile); }
