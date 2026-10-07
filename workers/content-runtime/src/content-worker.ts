import { emit, parseMessage, type WorkerMessage } from './protocol.ts';
import { parseTrendingHtml, selectCandidates, GITHUB_TRENDING_URL } from './m1/ranking.ts';
import { createContentClient, AIResearchPlanner, SourceCollectorNode, EvidencePackBuilder, EvidenceVerifier, FactNormalizer, ScriptPlanner, HookGenerator, DomainPackageResolver, planOfficialSources, type EvidencePack } from './m1/pipeline.ts';
import { fixedOpeningText, subtitleWrap, validateStoryboard, type Storyboard } from './m1/storyboard.ts';

const nodeId = 'content-runtime';
const nodeVersion = '0.1.0';
process.stdin.setEncoding('utf8');
let buffer = '';
process.stdin.on('data', (chunk: string) => {
  buffer += chunk;
  const lines = buffer.split(/\r?\n/);
  buffer = lines.pop() ?? '';
  for (const line of lines.filter(Boolean)) void handle(line);
});

async function handle(line: string): Promise<void> {
  let request: WorkerMessage;
  try { request = parseMessage(line.replace(/^\uFEFF/, '')); } catch (error) {
    console.error(`[content-runtime] invalid input: ${String(error)}`);
    return;
  }
  if (request.type === 'cancel') {
    emit({ requestId: request.requestId, nodeId, nodeVersion, type: 'cancelled', payload: { checkpoint: 'received' } });
    return;
  }
  const payload = request.payload && typeof request.payload === 'object' ? request.payload as Record<string, unknown> : {};
  if ('html' in payload) {
    try {
      const input = payload as { html: string; batchCount?: number; filter?: Record<string, unknown>; shortagePolicy?: 'continue-with-available' | 'fail-task' };
      const snapshot = { snapshotId: request.requestId, source: 'github-trending-weekly' as const, sourceUrl: GITHUB_TRENDING_URL, period: 'weekly' as const, fetchedAt: new Date().toISOString(), items: parseTrendingHtml(input.html) };
      const selection = selectCandidates(snapshot, input.batchCount ?? 10, input.filter ?? {}, input.shortagePolicy ?? 'continue-with-available');
      emit({ requestId: request.requestId, nodeId, nodeVersion, type: 'result', payload: { snapshot, ...selection } });
    } catch (error) {
      emit({ requestId: request.requestId, nodeId, nodeVersion, type: 'error', payload: { code: 'RANKING_PARSE_FAILED', message: String(error) } });
    }
    return;
  }
  try {
    const operation = String(payload.operation ?? 'echo');
    if (operation === 'resolve_domain') {
      emit({ requestId: request.requestId, nodeId, nodeVersion, type: 'result', payload: new DomainPackageResolver().resolve(String(payload.domainId ?? 'github-open-source')) });
      return;
    }
    if (operation === 'plan_sources') {
      emit({ requestId: request.requestId, nodeId, nodeVersion, type: 'result', payload: planOfficialSources(payload.project as never) });
      return;
    }
    if (operation === 'collect_sources') {
      if (payload.fixtureMode === true && Array.isArray(payload.sources)) {
        emit({ requestId: request.requestId, nodeId, nodeVersion, type: 'result', payload: { sources: payload.sources } });
        return;
      }
      const records = await new SourceCollectorNode().run({ urls: Array.isArray(payload.urls) ? payload.urls.map(String) : [] });
      emit({ requestId: request.requestId, nodeId, nodeVersion, type: 'result', payload: { sources: records } });
      return;
    }
    if (operation === 'build_evidence') {
      const pack = new EvidencePackBuilder().build(payload.project as never, payload.sources as never, String(payload.projectId ?? (payload.project as { repositoryUrl: string }).repositoryUrl));
      const normalized = new FactNormalizer().normalize(pack);
      const errors = new EvidenceVerifier().verify(normalized);
      emit({ requestId: request.requestId, nodeId, nodeVersion, type: 'result', payload: { evidencePack: normalized, errors } });
      return;
    }
    if (operation === 'script') {
      const project = payload.project as never;
      const evidence = payload.evidence as EvidencePack;
      if (payload.fixtureMode === true) {
        const p = payload.project as { projectName: string; stargazersCount: number };
        const token = (source: string, spoken = source, kind: 'plain' | 'english-proper-name' | 'integer' = 'plain', dictionaryRef?: string) => ({ source, spoken, kind, ...(dictionaryRef ? { dictionaryRef, status: 'verified' as const } : {}) });
        const beatFields = (text: string, tokens = [token(text)]) => ({ spokenText: text, displayText: text, pronunciationText: text, pronunciationTokens: tokens, subtitleText: subtitleWrap(text) });
        const openingText = fixedOpeningText(p.projectName, String(payload.starCountSpoken ?? p.stargazersCount));
        const storyboard: Storyboard = { schemaVersion: '1.0.0', projectId: String(payload.projectId ?? p.projectName), title: p.projectName, domainId: 'github-open-source', durationLimitMs: 300000, chapters: [
          { id: 'opening', title: '开场', beats: [{ id: 'opening-1', kind: 'narration', ...beatFields(openingText, [token(p.projectName, p.projectName, 'english-proper-name', `project:${p.projectName}`), token(String(p.stargazersCount), String(payload.starCountSpoken ?? p.stargazersCount), 'integer')]), visualActions: [{ type: 'camera-zoom', durationFrames: 90, beatId: 'opening-1' }], evidenceRefs: ['claim-stargazers'], textBudget: { maxChars: 120 } }] },
          { id: 'principle', title: '原理', beats: [{ id: 'principle-1', kind: 'narration', ...beatFields('它解决了一个真实问题。'), visualActions: [{ type: 'draw-node', durationFrames: 60, beatId: 'principle-1' }], evidenceRefs: ['claim-stargazers'], textBudget: { maxChars: 80 } }] },
          { id: 'case', title: '案例', beats: [{ id: 'case-1', kind: 'narration', ...beatFields('官方案例展示了它的使用方式。'), visualActions: [{ type: 'evidence-window', durationFrames: 60, beatId: 'case-1' }], evidenceRefs: ['claim-stargazers'], textBudget: { maxChars: 80 } }] },
          { id: 'application', title: '应用', beats: [{ id: 'application-1', kind: 'narration', ...beatFields('你可以按这个步骤开始实践。'), visualActions: [{ type: 'transform', durationFrames: 60, beatId: 'application-1' }], evidenceRefs: ['claim-stargazers'], textBudget: { maxChars: 80 } }] },
          { id: 'conclusion', title: '结论', beats: [{ id: 'conclusion-1', kind: 'narration', ...beatFields('这就是今天的核心结论。'), visualActions: [{ type: 'emphasize', durationFrames: 60, beatId: 'conclusion-1' }], evidenceRefs: ['claim-stargazers'], textBudget: { maxChars: 80 } }, { id: 'conclusion-hook', kind: 'hook', ...beatFields(new HookGenerator().generate(p.projectName)), visualActions: [{ type: 'hold', durationFrames: 60, beatId: 'conclusion-hook' }], evidenceRefs: ['claim-stargazers'], textBudget: { maxChars: 100 } }] },
        ] };
        const errors = validateStoryboard(storyboard);
        emit({ requestId: request.requestId, nodeId, nodeVersion, type: 'result', payload: { storyboard, errors } });
        return;
      }
      const profile = payload.modelProfile as never;
      const modelOutput = await new ScriptPlanner(createContentClient(profile)).plan(project, evidence) as Record<string, unknown>;
      const candidate = (modelOutput.storyboard && typeof modelOutput.storyboard === 'object' ? modelOutput.storyboard : modelOutput) as Storyboard;
      const validationErrors = validateStoryboard(candidate);
      const expectedOpening = fixedOpeningText((project as { projectName: string }).projectName, String(payload.starCountSpoken ?? ''));
      const opening = candidate?.chapters?.[0]?.beats?.[0];
      if (opening?.spokenText !== expectedOpening || opening?.displayText !== expectedOpening) validationErrors.push('opening 必须使用固定开场话术');
      if (!opening?.evidenceRefs?.includes('claim-stargazers')) validationErrors.push('opening 必须引用 claim-stargazers');
      if (validationErrors.length > 0) {
        emit({ requestId: request.requestId, nodeId, nodeVersion, type: 'error', payload: { code: 'STORYBOARD_INVALID', message: validationErrors.join('; '), errors: validationErrors } });
        return;
      }
      emit({ requestId: request.requestId, nodeId, nodeVersion, type: 'result', payload: { storyboard: candidate, errors: [] } });
      return;
    }
    if (operation === 'research_plan') {
      if (payload.fixtureMode === true) {
        emit({ requestId: request.requestId, nodeId, nodeVersion, type: 'result', payload: planOfficialSources(payload.project as never) });
        return;
      }
      const profile = payload.modelProfile as never;
      const plan = await new AIResearchPlanner(createContentClient(profile)).plan(payload.project as never);
      emit({ requestId: request.requestId, nodeId, nodeVersion, type: 'result', payload: plan });
      return;
    }
    emit({ requestId: request.requestId, nodeId, nodeVersion, type: 'progress', payload: { value: 0.5, message: 'content runtime ready' } });
    emit({ requestId: request.requestId, nodeId, nodeVersion, type: 'result', payload: { accepted: true, input: request.payload } });
  } catch (error) {
    const code = error instanceof Error && 'code' in error ? String((error as Error & { code?: unknown }).code) : 'CONTENT_NODE_FAILED';
    emit({ requestId: request.requestId, nodeId, nodeVersion, type: 'error', payload: { code, message: error instanceof Error ? error.message : String(error) } });
  }
}
