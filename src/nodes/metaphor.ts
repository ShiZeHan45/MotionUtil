import { createHash } from "node:crypto";
import path from "node:path";
import { z } from "zod";
import type { MetaphorPlan, ProjectScript } from "../types";
import { requestChatCompletion } from "../lib/chat-completion";
import { readJson, safeJson, writeJson } from "../lib/io";
import { evaluateMetaphor, groundingText, MIN_FIT, vocabularyDescriptor, type MetaphorEvaluation } from "../video/metaphor/plan";

const PLAN_PROMPT_VERSION = "metaphor-plan-v1";
const GAPS_PATH = path.resolve(".cache", "metaphor-gaps.json");

const planSchema = z.object({
  name: z.string().min(1).max(20),
  fit: z.number().min(0).max(1),
  fitReason: z.string().min(2).max(160),
  actors: z.array(z.object({
    id: z.string().regex(/^[a-z][a-z0-9-]{1,20}$/),
    character: z.string().max(20),
    label: z.string().min(1).max(14),
    real: z.string().min(1).max(24),
    slot: z.string().max(4),
  })).min(2).max(6),
  beats: z.array(z.object({
    beatId: z.string().max(20),
    category: z.string().max(20),
    step: z.object({ action: z.string().max(20), from: z.string().max(24), to: z.string().max(24), say: z.string().min(1).max(40) }).nullable(),
  })).min(2).max(8),
});

export function metaphorVocabularyHash(): string {
  return createHash("sha256").update(JSON.stringify({ version: PLAN_PROMPT_VERSION, vocabulary: vocabularyDescriptor() })).digest("hex").slice(0, 16);
}

function evaluate(script: ProjectScript, plan: MetaphorPlan | null): MetaphorEvaluation {
  const beatIds = script.conceptStoryboard?.beats.map((beat) => beat.id) ?? [];
  return evaluateMetaphor(plan, { beatIds, knownText: groundingText(script) });
}

async function requestPlan(script: ProjectScript, feedback: string[]): Promise<MetaphorPlan> {
  const vocabulary = vocabularyDescriptor();
  const content = await requestChatCompletion([
    { role: "system", content: [
      "你是开源项目科普视频的画面设计师。把一个项目的“原理拆解”设计成一个卡通比喻动画：从下面的词汇表里挑角色和动作，不要发明词汇表以外的东西。",
      "先为整个原理选一个贴切的日常比喻 name（如“翻译官”“分拣邮局”），用 2–6 个角色，每个角色必须给 label（它在比喻里叫什么，≤10 字）和 real（它代表项目里的哪个真实对象，≤14 字，必须是输入资料里出现过的词，原样使用，不得编造组件）。slot 是舞台位置，每个角色一个，不可重复。",
      "beats 必须覆盖输入的每一拍、顺序一致。每一拍先判断它在做什么，从 categories 里选一个 category。drawable=false 的类别也可以选，要如实反映该拍在做什么，不要为了能画而改选；都不贴切就选 other。",
      "category 的 drawable=true 时必须给 step：action 与 category 相同，from 和 to 是 actors 里的 id，say 是用比喻口吻描述这一拍发生了什么的一句话（≤30 字）。不能新增该拍原文没有的步骤、功能或数字。drawable=false 或 other 时 step 为 null。",
      "character 只能取 characters 里的 id；packet 和 lens 不是角色，不要用。",
      "fit 是你对这个比喻的自评（0–1）：比喻是否会扭曲原理、每一拍能否对应。拿不准就写低，fit 低于 " + MIN_FIT + " 时视频会退回卡片图，这比硬套一个不准确的比喻好。fitReason 用一句话说明。",
      "只输出符合 JSON Schema 的 JSON，不要 Markdown。",
      JSON.stringify(z.toJSONSchema(planSchema)),
    ].join("\n") },
    { role: "user", content: JSON.stringify({
      vocabulary,
      project: { title: script.title, oneLineSummary: script.oneLineSummary, problem: script.problem, features: script.features, exampleScenario: script.exampleScenario },
      beats: script.conceptStoryboard?.beats.map((beat) => ({ id: beat.id, text: beat.text })) ?? [],
      ...(feedback.length ? { previousProblems: `上一版方案不能使用，请针对性修正：${feedback.join("；")}` } : {}),
    }) },
  ]);
  return { version: 1, ...planSchema.parse(safeJson(content)) };
}

type GapState = { repos: Record<string, { used: boolean; gaps: string[]; reasons: string[] }> };

/** One entry per repo, so retries and re-runs never inflate the counts. */
async function recordGaps(repo: string, evaluation: MetaphorEvaluation): Promise<void> {
  let state: GapState = { repos: {} };
  try { state = await readJson<GapState>(GAPS_PATH); } catch { /* first run */ }
  state.repos[repo] = { used: evaluation.use, gaps: [...new Set(evaluation.gaps)], reasons: evaluation.reasons };
  const entries = Object.values(state.repos);
  const categories: Record<string, number> = {};
  for (const entry of entries) for (const gap of entry.gaps) categories[gap] = (categories[gap] ?? 0) + 1;
  await writeJson(GAPS_PATH, {
    updatedAt: new Date().toISOString(),
    summary: { projects: entries.length, metaphorUsed: entries.filter((entry) => entry.used).length, missingActionCategories: categories },
    repos: state.repos,
  });
  console.log(`[节点 3] 比喻动画覆盖 ${entries.filter((entry) => entry.used).length}/${entries.length} 个项目；缺少画法的动作类别：${Object.entries(categories).map(([name, count]) => `${name}×${count}`).join("、") || "无"}（详见 .cache/metaphor-gaps.json）`);
}

/**
 * Design (or redo, when the vocabulary changed) the metaphor plan for one script. Never throws: if the service fails the
 * script is returned unchanged and the video keeps using the card diagram.
 */
export async function ensureMetaphor(script: ProjectScript): Promise<ProjectScript> {
  if (!script.conceptStoryboard?.beats.length) return script;
  const vocabularyHash = metaphorVocabularyHash();
  if (script.metaphor?.vocabularyHash === vocabularyHash) return script;
  try {
    let plan = await requestPlan(script, []);
    let evaluation = evaluate(script, plan);
    if (!evaluation.use) {
      console.log(`[节点 3] ${script.repo} 比喻方案未通过（${evaluation.reasons.join("；")}），按原因重试一次`);
      plan = await requestPlan(script, evaluation.reasons);
      evaluation = evaluate(script, plan);
    }
    console.log(evaluation.use
      ? `[节点 3] ${script.repo} 比喻方案通过：${plan.name}（适配度 ${plan.fit}）`
      : `[节点 3] ${script.repo} 比喻方案不适用，原理段沿用卡片图：${evaluation.reasons.join("；")}`);
    await recordGaps(script.repo, evaluation);
    return { ...script, metaphor: { vocabularyHash, plan } };
  } catch (error) {
    console.log(`[节点 3] ${script.repo} 比喻方案设计失败，原理段沿用卡片图：${error instanceof Error ? error.message : String(error)}`);
    return script;
  }
}
