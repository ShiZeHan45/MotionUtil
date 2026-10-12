import { z } from "zod";
import type { OpeningHookPlan, ProjectScript, RepoFacts } from "../types";

export const hookFactSchema = z.object({
  id: z.string().regex(/^fact-[1-9][0-9]?$/),
  point: z.string().min(5).max(600),
  sourceUrl: z.string().url(),
  sentenceNumber: z.number().int().positive(),
  sourceExcerpt: z.string().min(5).max(1_200),
  suitable: z.boolean(),
  reason: z.string().min(5).max(180),
});

export const hookFactsSchema = z.object({
  targetAudience: z.string().min(3).max(120),
  domain: z.string().min(2).max(100),
  missingInfo: z.array(z.string().regex(/^【待填：.+】$/)).max(8),
  facts: z.array(hookFactSchema).min(1).max(10),
});
export type HookPreparation = z.infer<typeof hookFactsSchema>;

// The model selects evidence; the program copies it from the collected source.
// Quoting Markdown twice invites omissions and paraphrases even during repair.
export const hookEvidenceSelectionSchema = hookFactsSchema.extend({
  facts: z.array(hookFactSchema.omit({ point: true, sourceExcerpt: true })).min(1).max(10),
});
export type HookEvidenceSelection = z.infer<typeof hookEvidenceSelectionSchema>;

export const hookSelectionSchema = z.object({
  candidates: z.array(z.object({
    id: z.string().regex(/^hook-[1-5]$/),
    type: z.enum(["A", "B", "C"]),
    text: z.string().min(1).max(100),
    spokenText: z.string().min(1).max(120).optional(),
    factIds: z.array(z.string()).max(4),
    payoffBeatIds: z.array(z.string()).max(4),
    payoffExplanation: z.string().min(5).max(200),
    suitable: z.boolean(),
    reason: z.string().min(5).max(180),
  })).length(5),
  selectedId: z.string().regex(/^hook-[1-5]$/),
  selectedReason: z.string().min(5).max(180),
  selectedPayoff: z.object({ beatId: z.string(), excerpt: z.string().min(8).max(120) }),
});
export type HookSelection = z.infer<typeof hookSelectionSchema>;

export type HookMaterial = { sourceUrl: string; text?: string; sentences: Array<{ number: number; text: string }> };

function compactEvidence(text: string): string {
  return text.replace(/\s+/gu, " ").trim();
}

function evidenceIncludes(text: string, excerpt: string): boolean {
  return text.includes(excerpt) || compactEvidence(text).includes(compactEvidence(excerpt));
}

function evidenceMatches(material: HookMaterial, fact: HookPreparation["facts"][number]): boolean {
  const sourceText = material.text ?? material.sentences.map((sentence) => sentence.text).join(" ");
  return evidenceIncludes(sourceText, fact.sourceExcerpt)
    && evidenceIncludes(fact.sourceExcerpt, fact.point);
}

function findEvidenceSentence(
  fact: HookPreparation["facts"][number],
  materials: HookMaterial[],
): { number: number; text: string } | undefined {
  const material = materials.find((item) => item.sourceUrl === fact.sourceUrl);
  if (!material || !evidenceMatches(material, fact)) return undefined;
  // Prefer the model's number, then recover from the cited text when Markdown
  // line breaks or punctuation caused a different sentence split locally.
  const exact = material.sentences.find((item) => item.number === fact.sentenceNumber
    && (evidenceIncludes(item.text, fact.sourceExcerpt) || evidenceIncludes(item.text, fact.point)));
  if (exact) return exact;
  const containing = material.sentences.find((item) => evidenceIncludes(item.text, fact.sourceExcerpt)
    || evidenceIncludes(item.text, fact.point));
  if (containing) return containing;

  // A quote can span Markdown lines or multiple locally split sentences.
  // Attribute it to the sentence where the quoted passage begins.
  const joined = compactEvidence(material.sentences.map((item) => item.text).join(" "));
  const excerptStart = joined.indexOf(compactEvidence(fact.sourceExcerpt));
  let offset = 0;
  for (const sentence of material.sentences) {
    const start = offset;
    const end = start + compactEvidence(sentence.text).length;
    if (excerptStart >= start && excerptStart <= end) return sentence;
    offset = end + 1;
  }
  return undefined;
}

// Number only text actually collected by node 2. A link is not evidence that its page was read.
export function hookMaterials(facts: RepoFacts): HookMaterial[] {
  const documents: Array<{ sourceUrl: string; text: string }> = [];
  if (facts.description.trim()) documents.push({ sourceUrl: facts.url, text: facts.description });
  if (facts.readme?.text.trim()) documents.push(facts.readme);
  return documents.map(({ sourceUrl, text }) => ({
    sourceUrl,
    text,
    sentences: text.split(/\r?\n|(?<=[。！？!?])\s*|(?<=\.)\s+(?=[A-Z])/u)
      .map((sentence) => sentence.trim()).filter(Boolean)
      .map((sentence, index) => ({ number: index + 1, text: sentence })),
  }));
}

export function selectableHookMaterials(materials: HookMaterial[]): HookMaterial[] {
  return materials.map((material) => ({
    sourceUrl: material.sourceUrl,
    sentences: material.sentences.filter((sentence) => hookFactSchema.shape.point.safeParse(sentence.text).success),
  })).filter((material) => material.sentences.length > 0);
}

export function materializeHookFacts(selection: HookEvidenceSelection, materials: HookMaterial[]): HookPreparation {
  const selectable = selectableHookMaterials(materials);
  const preparation = hookFactsSchema.parse({
    ...selection,
    facts: selection.facts.map((fact) => {
      const material = selectable.find((item) => item.sourceUrl === fact.sourceUrl);
      const sentence = material?.sentences.find((item) => item.number === fact.sentenceNumber);
      if (!sentence) {
        throw new Error(`${fact.id} 选择了不存在或不在可选材料中的原文：${fact.sourceUrl} 第 ${fact.sentenceNumber} 句；只能选择输入 materials 中的 sourceUrl 和 number`);
      }
      return { ...fact, point: sentence.text, sourceExcerpt: sentence.text };
    }),
  });
  validateHookFacts(preparation, materials);
  return preparation;
}

export function validateHookFacts(preparation: HookPreparation, materials: HookMaterial[]): void {
  const ids = new Set<string>();
  for (const fact of preparation.facts) {
    if (ids.has(fact.id)) throw new Error(`技术事实编号重复：${fact.id}`);
    ids.add(fact.id);
    const sentence = findEvidenceSentence(fact, materials);
    if (!sentence) {
      throw new Error(`${fact.id} 原文核对失败：技术要点和引用必须逐字摘自 ${fact.sourceUrl} 第 ${fact.sentenceNumber} 句`);
    }
    if (/【待填[：:]/u.test(fact.point)) throw new Error(`${fact.id} 将缺失信息作为技术事实`);
  }
  if (!preparation.facts.some((fact) => fact.suitable)) {
    throw new Error("现有资料没有可核验的知识钩子依据，请补充项目 README 或官方介绍后重试");
  }
}

/**
 * Correct sentence numbers after accepting the cited text. The model sees
 * source sentences in the prompt, but its own punctuation interpretation can
 * differ from the local Markdown splitter used by the validator.
 */
export function normalizeHookFacts(preparation: HookPreparation, materials: HookMaterial[]): HookPreparation {
  return {
    ...preparation,
    facts: preparation.facts.map((fact) => {
      const sentence = findEvidenceSentence(fact, materials);
      return sentence ? { ...fact, sentenceNumber: sentence.number } : fact;
    }),
  };
}

export function selectedOpeningHook(plan?: OpeningHookPlan) {
  return plan?.candidates.find((candidate) => candidate.id === plan.selectedId && candidate.suitable);
}

const marketing = /(?:神器|吊打|秒杀|闭眼入|赶紧(?:下载|试用)|必买|全网最|颠覆一切|点赞|关注我|收藏起来|评论区|一键暴富)/u;
const unresolved = /【待填[：:][^】]*】/u;
const numericTokens = (text: string): string[] => text.match(/\d+(?:[.,]\d+)*(?:%|倍|秒|毫秒|GB|MB|TB)?/giu) ?? [];

export function validateOpeningHook(script: ProjectScript): void {
  if (!script.openingHook) throw new Error(`${script.repo} 缺少事实清单和开场钩子`);
  const plan = script.openingHook;
  if (plan.version !== 1) throw new Error(`${script.repo} 开场审核协议版本不支持`);
  hookFactsSchema.parse(plan);
  hookSelectionSchema.parse(plan);
  const facts = new Map(plan.facts.map((fact) => [fact.id, fact]));
  const beats = new Set(script.conceptStoryboard?.beats.map((beat) => beat.id));
  const ids = new Set<string>();
  for (const candidate of plan.candidates) {
    if (ids.has(candidate.id)) throw new Error(`${script.repo} 钩子编号重复：${candidate.id}`);
    ids.add(candidate.id);
    for (const id of candidate.factIds) if (!facts.has(id)) throw new Error(`${candidate.id} 引用了不存在的事实 ${id}`);
    if (!candidate.suitable) continue;
    const count = Array.from(candidate.text.replace(/\s/gu, "")).length;
    if (count < 25 || count > 35) throw new Error(`${candidate.id} 口播为 ${count} 字符，应为 25–35 字符`);
    if (!candidate.factIds.length || candidate.factIds.some((id) => !facts.get(id)?.suitable)) {
      throw new Error(`${candidate.id} 必须引用第一步中适合做钩子的已核验事实`);
    }
    if (!candidate.payoffBeatIds.length || candidate.payoffBeatIds.some((id) => !beats.has(id))) {
      throw new Error(`${candidate.id} 必须指定实际存在的原理 beat 来兑现钩子`);
    }
    const text = `${candidate.text} ${candidate.spokenText ?? ""}`;
    if (unresolved.test(text) || marketing.test(text)) throw new Error(`${candidate.id} 含有待填信息或营销话术`);
    const evidence = candidate.factIds.map((id) => facts.get(id)!.sourceExcerpt).join(" ");
    for (const number of numericTokens(text)) {
      if (!numericTokens(evidence).includes(number)) throw new Error(`${candidate.id} 数字 ${number} 没有引用原文依据`);
    }
  }
  if (["A", "B", "C"].some((type) => !plan.candidates.some((candidate) => candidate.type === type))) {
    throw new Error(`${script.repo} 五个候选必须覆盖 A/B/C；缺乏依据的类型可明确标为不适用`);
  }
  const selected = selectedOpeningHook(plan);
  if (!selected) throw new Error(`${script.repo} 选中的开场钩子不存在或不适用`);
  const answer = script.conceptStoryboard?.beats.find((beat) => beat.id === plan.selectedPayoff.beatId);
  if (!selected.payoffBeatIds.includes(plan.selectedPayoff.beatId) || !answer
    || !answer.text.includes(plan.selectedPayoff.excerpt) || !(answer.spokenText ?? answer.text).includes(plan.selectedPayoff.excerpt)) {
    throw new Error(`${script.repo} 所选钩子的兑现句必须逐字存在于指定原理 beat 的字幕和口播中`);
  }
  const intro = script.narrationSegments[0]!;
  if (!intro.text.startsWith(selected.text) || !(intro.spokenText ?? intro.text).startsWith(selected.spokenText ?? selected.text)) {
    throw new Error(`${script.repo} 开场必须先完整讲出所选钩子，再介绍项目和榜单`);
  }
  validatePublicScript(script);
}

// Review metadata stays out of the TTS timeline. Placeholders must never reach the MP4.
export function validatePublicScript(script: ProjectScript): void {
  const text = JSON.stringify({
    title: script.title, oneLineSummary: script.oneLineSummary, problem: script.problem,
    features: script.features, audience: script.audience, usage: script.usage,
    exampleScenario: script.exampleScenario, exampleFlow: script.exampleFlow, exampleResult: script.exampleResult,
    usageSteps: script.usageSteps, requirements: script.requirements, limitations: script.limitations,
    narrationSegments: script.narrationSegments, conceptStoryboard: script.conceptStoryboard,
  });
  if (unresolved.test(text)) throw new Error(`${script.repo} 正式讲稿或画面含【待填】信息，只能保存在审核资料中`);
  if (marketing.test(text)) throw new Error(`${script.repo} 正式讲稿含营销或关注引导话术`);
}
