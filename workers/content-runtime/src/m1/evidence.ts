import { createHash } from 'node:crypto';
import type { RankingItem } from './ranking.ts';
import type { EvidenceClaim, EvidencePack, SourceRecord } from './pipeline.ts';

export class RetryingSourceCollector {
  private readonly fetcher: typeof fetch;
  private readonly retries: number;
  constructor(fetcher: typeof fetch = fetch, retries = 2) { this.fetcher = fetcher; this.retries = retries; }
  async collect(urls: string[], signal?: AbortSignal): Promise<SourceRecord[]> {
    const records: SourceRecord[] = [];
    for (const url of urls) {
      let lastError: unknown;
      for (let attempt = 0; attempt <= this.retries; attempt++) {
        try {
          const response = await this.fetcher(url, { signal });
          const text = await response.text();
          records.push({ sourceId: `source-${records.length + 1}`, url, fetchedAt: new Date().toISOString(), status: response.status, contentType: response.headers.get('content-type') ?? '', text, sha256: createHash('sha256').update(text).digest('hex') });
          lastError = undefined;
          break;
        } catch (error) {
          lastError = error;
          if (attempt < this.retries) await new Promise(resolve => setTimeout(resolve, 100 * (attempt + 1)));
        }
      }
      if (lastError) throw lastError;
    }
    return records;
  }
}

export function buildEvidencePack(project: RankingItem, sources: SourceRecord[]): EvidencePack {
  const githubSource = sources.find(source => source.url === project.repositoryUrl);
  const claims: EvidenceClaim[] = [{ claimId: 'claim-stargazers', subject: 'project', field: 'stargazersCount', value: project.stargazersCount, sourceRefs: githubSource ? [githubSource.sourceId] : [], evidenceQuote: `GitHub stargazers_count=${project.stargazersCount}`, capturedAt: project.capturedAt, confidence: githubSource ? 0.98 : 0, status: githubSource ? 'verified' : 'insufficient' }];
  return { projectId: project.repositoryUrl, sources, claims };
}

export function verifyEvidence(pack: EvidencePack): string[] {
  return pack.claims.flatMap(claim => claim.status === 'verified' && claim.sourceRefs.length > 0 ? [] : [`${claim.claimId} 缺少可验证证据`]);
}
