export const VISIBLE_CHAPTERS = ['opening', 'principle', 'case', 'application', 'conclusion'] as const;
export type VisibleChapter = typeof VISIBLE_CHAPTERS[number];
export type PronunciationToken = { source: string; spoken: string; kind: 'plain' | 'english-proper-name' | 'acronym' | 'integer' | 'decimal' | 'percentage' | 'version' | 'date' | 'code' | 'url'; dictionaryRef?: string; phonemeHint?: string; status?: 'verified' | 'blocked' };
export type Beat = { id: string; kind: 'narration' | 'transition' | 'hook'; spokenText: string; displayText?: string; pronunciationText?: string; pronunciationTokens?: PronunciationToken[]; subtitleText: string; durationMs?: number; audioPath?: string; visualActions: Array<{ type: string; durationFrames: number; beatId?: string }>; evidenceRefs: string[]; textBudget: { maxChars: number } };
export type Storyboard = { schemaVersion: '1.0.0'; projectId: string; title: string; domainId: string; durationLimitMs: 300000; chapters: Array<{ id: VisibleChapter; title: string; beats: Beat[] }> };

export function fixedOpeningText(projectName: string, starCountSpoken: string) {
  return `图解万物 之 GitHub 篇，今天要介绍的是 ${projectName}，截止目前已斩获 ${starCountSpoken} 颗星。`;
}

export function subtitleWrap(text: string, maxChinese = 18): string {
  const lines: string[] = [];
  let line = '';
  let chinese = 0;
  for (const char of text) {
    const isChinese = /[\u3400-\u9fff]/u.test(char);
    if (isChinese && chinese >= maxChinese && line.length > 0) {
      lines.push(line.trim()); line = ''; chinese = 0;
    }
    line += char;
    if (isChinese) chinese += 1;
  }
  if (line.trim()) lines.push(line.trim());
  if (lines.length <= 2) return lines.join('\n');
  return `${lines[0]}\n${lines.slice(1).join('')}`;
}

export function validateStoryboard(storyboard: Storyboard): string[] {
  const errors: string[] = [];
  if (!storyboard || typeof storyboard !== 'object') return ['storyboard 必须为 JSON object'];
  if (storyboard.schemaVersion !== '1.0.0') errors.push('schemaVersion 必须为 1.0.0');
  if (!storyboard.projectId?.trim() || !storyboard.title?.trim() || !storyboard.domainId?.trim()) errors.push('projectId、title、domainId 不能为空');
  if (storyboard.durationLimitMs !== 300000) errors.push('durationLimitMs 必须为 300000');
  if (!Array.isArray(storyboard.chapters)) return [...errors, 'chapters 必须为数组'];
  if (storyboard.chapters.length !== VISIBLE_CHAPTERS.length) errors.push('必须包含恰好五个章节');
  if (JSON.stringify(storyboard.chapters.map(chapter => chapter?.id)) !== JSON.stringify(VISIBLE_CHAPTERS)) errors.push('chapters 必须按 opening, principle, case, application, conclusion 排序');
  const hooks = storyboard.chapters.flatMap(chapter => {
    if (!chapter || !Array.isArray(chapter.beats)) {
      errors.push(`${chapter?.id ?? '(unknown)'} beats 必须为数组`);
      return [];
    }
    return chapter.beats.map((beat, index) => ({ chapter: chapter.id, beat, index, count: chapter.beats.length }));
  });
  for (const item of hooks) {
    if (item.beat && item.beat.kind === 'hook' && (item.chapter !== 'conclusion' || item.index !== item.count - 1)) errors.push('hook 只能是 conclusion 最后一个 beat');
  }
  if (!hooks.some(item => item.chapter === 'conclusion' && item.beat?.kind === 'hook')) errors.push('conclusion 必须包含 hook beat');
  for (const item of hooks) {
    const beat = item.beat;
    if (!beat || typeof beat !== 'object') { errors.push('beat 必须为 object'); return; }
    if (typeof beat.spokenText !== 'string' || typeof beat.displayText !== 'string' || typeof beat.pronunciationText !== 'string' || !beat.spokenText.trim() || !beat.displayText.trim() || !beat.pronunciationText.trim()) errors.push(`${beat.id} 缺少 spokenText/displayText/pronunciationText`);
    if (!Array.isArray(beat.pronunciationTokens) || beat.pronunciationTokens.length === 0) errors.push(`${beat.id} 缺少 pronunciationTokens`);
    if (!beat.textBudget || !Number.isInteger(beat.textBudget.maxChars) || beat.textBudget.maxChars < 1) errors.push(`${beat.id} 缺少有效 textBudget`);
    if (!beat.id?.trim() || !/^[a-zA-Z0-9._-]+$/.test(beat.id)) errors.push(`${beat.id || '(unknown)'} beat id 非法`);
    if (!Array.isArray(item.beat.visualActions) || item.beat.visualActions.length === 0) errors.push(`${item.beat.id} 缺少 visualActions`);
    if (!Array.isArray(item.beat.evidenceRefs) || (item.beat.evidenceRefs.length === 0 && item.chapter !== 'opening')) errors.push(`${item.beat.id} 缺少 evidenceRefs`);
    if (typeof item.beat.spokenText === 'string' && item.beat.spokenText.length > item.beat.textBudget.maxChars) errors.push(`${item.beat.id} spokenText 超出 textBudget`);
    if (typeof item.beat.displayText === 'string' && item.beat.displayText.length > item.beat.textBudget.maxChars) errors.push(`${item.beat.id} displayText 超出 textBudget`);
    if (typeof item.beat.pronunciationText === 'string' && item.beat.pronunciationText.length > item.beat.textBudget.maxChars) errors.push(`${item.beat.id} pronunciationText 超出 textBudget`);
    if (Array.isArray(item.beat.pronunciationTokens)) {
      for (const token of item.beat.pronunciationTokens) {
        if (!token || !token.source?.trim() || !token.spoken?.trim()) { errors.push(`${item.beat.id} 存在无效 pronunciationToken`); continue; }
        if (token.status === 'blocked') errors.push(`${item.beat.id} pronunciationToken ${token.source} 被阻断`);
        if (['english-proper-name', 'acronym', 'url'].includes(token.kind) && !token.dictionaryRef && !token.phonemeHint) errors.push(`${item.beat.id} 英文 token ${token.source} 缺少 dictionaryRef/phonemeHint`);
        if (token.kind === 'integer' && /^[0-9,]+$/.test(token.source) && /^[0-9,]+$/.test(token.spoken)) errors.push(`${item.beat.id} 整数 token 必须使用中文单位读法`);
      }
    }
    if (typeof item.beat.subtitleText !== 'string' || item.beat.subtitleText.split('\n').length > 2 || item.beat.subtitleText.split('\n').some(line => [...line].filter(char => /[\u3400-\u9fff]/u.test(char)).length > 18)) errors.push(`${item.beat.id} 字幕超出两行或单行18字`);
  }
  const duration = storyboard.chapters.flatMap(chapter => chapter.beats).reduce((sum, beat) => sum + (beat.durationMs ?? 0), 0);
  if (duration > storyboard.durationLimitMs) errors.push('故事板时长超过 300 秒');
  return errors;
}
