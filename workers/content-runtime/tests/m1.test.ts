import assert from 'node:assert/strict';
import test from 'node:test';
import { GITHUB_TRENDING_URL, parseTrendingHtml, selectCandidates } from '../src/m1/ranking.ts';
import { LlmConfigurationError, OpenAiCompatibleClient } from '../src/m1/llm.ts';
import { validateStoryboard } from '../src/m1/storyboard.ts';

test('parses GitHub trending HTML into ranking snapshot items', () => {
  const html = '<article class="Box-row"><h2><a href="/acme/demo">acme / demo</a></h2><span itemprop="programmingLanguage">TypeScript</span><a href="/acme/demo/stargazers">12,345</a><span>1,234 stars this week</span></article>';
  const item = parseTrendingHtml(html, '2026-10-08T00:00:00Z')[0];
  assert.equal(GITHUB_TRENDING_URL, 'https://github.com/trending?since=weekly');
  assert.equal(item.projectName, 'demo');
  assert.equal(item.owner, 'acme');
  assert.equal(item.stargazersCount, 12345);
  assert.equal(item.starsDelta, 1234);
});

test('deduplicates and applies candidate filters with shortage warning', () => {
  const snapshot = { snapshotId: 's', source: 'github-trending-weekly' as const, sourceUrl: GITHUB_TRENDING_URL, period: 'weekly' as const, fetchedAt: '', items: [
    { rank: 1, projectName: 'one', repositoryUrl: 'https://github.com/a/one', owner: 'a', stargazersCount: 100, language: 'C#', description: '', starsDelta: null, topics: ['tool'], isArchived: false, capturedAt: '' },
    { rank: 2, projectName: 'duplicate', repositoryUrl: 'https://github.com/a/one', owner: 'a', stargazersCount: 100, language: 'C#', description: '', starsDelta: null, topics: ['tool'], isArchived: false, capturedAt: '' },
  ] };
  const result = selectCandidates(snapshot, 2, { languages: ['C#'] }, 'continue-with-available');
  assert.equal(result.candidates.length, 1);
  assert.equal(result.failed, false);
  assert.equal(result.warnings.length, 1);
});

test('excludes repositories generated inside the configured cooldown window', () => {
  const snapshot = { snapshotId: 's', source: 'github-trending-weekly' as const, sourceUrl: GITHUB_TRENDING_URL, period: 'weekly' as const, fetchedAt: '2026-10-08T00:00:00Z', items: [
    { rank: 1, projectName: 'recent', repositoryUrl: 'https://github.com/a/recent', owner: 'a', stargazersCount: 100, language: 'C#', description: '', starsDelta: null, topics: [], isArchived: false, capturedAt: '' },
    { rank: 2, projectName: 'older', repositoryUrl: 'https://github.com/a/older', owner: 'a', stargazersCount: 100, language: 'C#', description: '', starsDelta: null, topics: [], isArchived: false, capturedAt: '' },
  ] };
  const result = selectCandidates(snapshot, 2, {
    now: '2026-10-08T00:00:00Z',
    excludeGeneratedWithinDays: 30,
    generatedRepositoryDates: {
      'https://github.com/a/recent': '2026-10-06T00:00:00Z',
      'https://github.com/a/older': '2026-09-01T00:00:00Z',
    },
  }, 'continue-with-available');
  assert.deepEqual(result.candidates.map(item => item.projectName), ['older']);
});

test('missing model configuration blocks real client', async () => {
  const client = new OpenAiCompatibleClient({ profileId: 'test', baseUrl: '', apiKeyEnvVar: 'MVP_TEST_KEY', model: '' }, fetch, {});
  await assert.rejects(() => client.completeJson([]), (error: unknown) => error instanceof LlmConfigurationError && error.code === 'LLM_CONFIGURATION_MISSING');
});

test('client sends JSON response format and parses response', async () => {
  let requestBody: any;
  const fakeFetch = async (_url: string, init: RequestInit) => {
    requestBody = JSON.parse(String(init.body));
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }), { status: 200 });
  };
  const client = new OpenAiCompatibleClient({ profileId: 'test', baseUrl: 'https://example.test/v1', apiKeyEnvVar: 'MVP_TEST_KEY', model: 'test-model' }, fakeFetch as typeof fetch, { MVP_TEST_KEY: 'secret' });
  assert.deepEqual(await client.completeJson([{ role: 'user', content: 'test' }]), { ok: true });
  assert.equal(requestBody.model, 'test-model');
  assert.deepEqual(requestBody.response_format, { type: 'json_object' });
});

test('storyboard validator reports malformed model output instead of throwing', () => {
  const errors = validateStoryboard({
    schemaVersion: '1.0.0', projectId: 'p', title: 'p', domainId: 'github-open-source', durationLimitMs: 300000,
    chapters: [
      { id: 'opening', title: '开场', beats: [{ id: 'opening-1', kind: 'narration', spokenText: 'x', displayText: 'x', pronunciationText: 'x', subtitleText: 'x', visualActions: [], evidenceRefs: [], textBudget: { maxChars: 1 } } ] },
      { id: 'principle', title: '原理', beats: [] }, { id: 'case', title: '案例', beats: [] }, { id: 'application', title: '应用', beats: [] }, { id: 'conclusion', title: '结论', beats: [] },
    ],
  } as any);
  assert.ok(errors.some(error => error.includes('pronunciationTokens')));
  assert.ok(errors.some(error => error.includes('hook')));
});

test('storyboard validator rejects a hook outside the final conclusion beat', () => {
  const base = (id: string, kind: 'narration' | 'hook') => ({ id, kind, spokenText: 'x', displayText: 'x', pronunciationText: 'x', subtitleText: 'x', pronunciationTokens: [{ source: 'x', spoken: 'x', kind: 'plain' }], visualActions: [{ type: 'hold', durationFrames: 1 }], evidenceRefs: ['claim'], textBudget: { maxChars: 10 } });
  const errors = validateStoryboard({ schemaVersion: '1.0.0', projectId: 'p', title: 'p', domainId: 'd', durationLimitMs: 300000, chapters: [
    { id: 'opening', title: '开场', beats: [base('h', 'hook')] }, { id: 'principle', title: '原理', beats: [base('p', 'narration')] }, { id: 'case', title: '案例', beats: [base('c', 'narration')] }, { id: 'application', title: '应用', beats: [base('a', 'narration')] }, { id: 'conclusion', title: '结论', beats: [base('co', 'narration'), base('ch', 'hook')] },
  ] } as any);
  assert.ok(errors.some(error => error.includes('只能是 conclusion')));
});
