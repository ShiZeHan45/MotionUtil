import { createHash } from "node:crypto";
import path from "node:path";
import { z } from "zod";
import type { MetaphorPlan, ProjectScript } from "../types";
import { requestChatCompletion } from "../lib/chat-completion";
import { readJson, safeJson, writeJson } from "../lib/io";
import { evaluateMetaphor, groundingText, MIN_FIT, SLOTS, vocabularyDescriptor, type MetaphorEvaluation } from "../video/metaphor/plan";
import { METAPHOR_SCENES, type MetaphorScene } from "../video/metaphor/scenes";

const PLAN_PROMPT_VERSION = "metaphor-plan-v2-colors-direction-check";
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
    step: z.object({
      action: z.string().max(20), from: z.string().max(24), to: z.string().max(24), say: z.string().min(1).max(40),
      payload: z.string().max(8).nullable().optional(), payloadLabel: z.string().max(10).nullable().optional(),
      becomes: z.string().max(8).nullable().optional(), becomesLabel: z.string().max(10).nullable().optional(),
    }).nullable(),
  })).min(2).max(8),
});

export function metaphorVocabularyHash(): string {
  return createHash("sha256").update(JSON.stringify({ version: PLAN_PROMPT_VERSION, vocabulary: vocabularyDescriptor() })).digest("hex").slice(0, 16);
}

function evaluate(script: ProjectScript, plan: MetaphorPlan | null): MetaphorEvaluation {
  const beatIds = script.conceptStoryboard?.beats.map((beat) => beat.id) ?? [];
  return evaluateMetaphor(plan, { beatIds, knownText: groundingText(script) });
}

const slotOf = (at: { x: number; y: number }) => (Object.entries(SLOTS).find(([, slot]) => Math.abs(slot.x - at.x) < 0.01 && Math.abs(slot.y - at.y) < 0.01)?.[0]) ?? "t1";

/** Worked examples come from the preset scenes, which already pass the style check, so they never drift from the vocabulary. */
function exampleFor(scene: MetaphorScene) {
  return {
    name: scene.name,
    actors: scene.actors.map((actor) => ({ id: actor.id, character: actor.character, label: actor.label, real: actor.real, slot: slotOf(actor.at) })),
    beats: scene.steps.map((step, index) => ({ beatId: `beat-${index + 1}`, category: step.action, step })),
  };
}
const EXAMPLES = ["relay", "library"].map((id) => exampleFor(METAPHOR_SCENES[id]!));

// Categories whose from/to mean "where it comes from / who it goes to"; the others (check, compare, cache, connect, wait, loop, introduce) are not directional.
const DIRECTED = new Set(["send", "receive", "transform", "store", "retrieve", "route", "trigger", "ask", "split", "merge", "filter", "rollback", "stack", "isolate", "create"]);
const verdictSchema = z.object({
  verdicts: z.array(z.object({
    beatId: z.string().max(20),
    sourceId: z.string().max(24).nullable(),
    targetId: z.string().max(24).nullable(),
    reason: z.string().max(120),
  })).max(8),
});

/**
 * Independent direction check: a second call sees only the beat text and the cast list, never the plan's from/to, and says who the
 * thing comes from and who receives it. The code then compares that with the plan, so a swapped sender and receiver is caught.
 */
async function directionProblems(script: ProjectScript, plan: MetaphorPlan): Promise<string[]> {
  const beats = script.conceptStoryboard?.beats ?? [];
  const checked = plan.beats.filter((beat) => beat.step && DIRECTED.has(beat.step.action) && beats.some((item) => item.id === beat.beatId));
  if (!checked.length) return [];
  const content = await requestChatCompletion([
    { role: "system", content: [
      "你是校对员。下面每一拍是一段讲解原文，candidates 是画面里的角色（id、名字、对应的真实对象）。",
      "对每一拍，只根据原文判断：sourceId = 被传递的东西、信息或请求是从哪个角色那里来的（或谁发起的）；targetId = 它交给了哪个角色、到了谁那里、谁收到。",
      "原文没有明确指出就填 null，不要猜，也不要因为别的拍或常识而补全。reason 用一句话引用原文依据。",
      "注意方向：“A 把 X 交给 B”“A 向 B 提问”“B 读取 A”中，来源分别是 A、A、A，目标分别是 B、B、B。",
      "只输出符合 JSON Schema 的 JSON。",
      JSON.stringify(z.toJSONSchema(verdictSchema)),
    ].join("\n") },
    { role: "user", content: JSON.stringify({
      candidates: plan.actors.map((actor) => ({ id: actor.id, name: actor.label, real: actor.real })),
      beats: checked.map((beat) => ({ beatId: beat.beatId, text: beats.find((item) => item.id === beat.beatId)!.text })),
    }) },
  ]);
  const { verdicts } = verdictSchema.parse(safeJson(content));
  const byId = new Map(verdicts.map((verdict) => [verdict.beatId, verdict]));
  const problems: string[] = [];
  for (const beat of checked) {
    const verdict = byId.get(beat.beatId);
    const step = beat.step!;
    if (!verdict) continue;
    const name = (id: string) => plan.actors.find((actor) => actor.id === id)?.label ?? id;
    if (verdict.sourceId === step.to && verdict.targetId === step.from) problems.push(`${beat.beatId} 的方向画反了：原文是“${name(step.to)}”给“${name(step.from)}”（${verdict.reason}），请把 from 和 to 对调`);
    else if (verdict.sourceId && verdict.sourceId !== step.from) problems.push(`${beat.beatId} 的来源应是“${name(verdict.sourceId)}”而不是“${name(step.from)}”（${verdict.reason}）`);
    else if (verdict.targetId && verdict.targetId !== step.to) problems.push(`${beat.beatId} 的接收方应是“${name(verdict.targetId)}”而不是“${name(step.to)}”（${verdict.reason}）`);
  }
  return problems;
}

async function requestPlan(script: ProjectScript, feedback: string[]): Promise<MetaphorPlan> {
  const vocabulary = vocabularyDescriptor();
  const content = await requestChatCompletion([
    { role: "system", content: [
      "你是开源项目科普视频的画面设计师。把一个项目的“原理拆解”设计成一个卡通比喻动画：从下面的词汇表里挑角色和动作，不要发明词汇表以外的东西。",
      "先为整个原理选一个贴切的日常比喻 name（如“翻译官”“分拣邮局”），用 2–6 个角色，每个角色必须给 label（它在比喻里叫什么，≤10 字）和 real（它代表项目里的哪个真实对象，≤14 字，必须是输入资料里出现过的词，原样使用，不得编造组件）。slot 是舞台位置，每个角色一个，不可重复。",
      "beats 必须覆盖输入的每一拍、顺序一致。每一拍先判断它在做什么，从 categories 里选一个 category。drawable=false 的类别也可以选，要如实反映该拍在做什么，不要为了能画而改选；都不贴切就选 other。",
      "category 的 drawable=true 时必须给 step：action 与 category 相同，say 是用比喻口吻描述这一拍发生了什么的一句话（≤30 字）。不能新增该拍原文没有的步骤、功能或数字。drawable=false 或 other 时 step 为 null。",
      "from 和 to 的含义以 categories 里每一类的 meaning 为准，必须逐拍对照原文确定：谁把东西交出去、谁收到；不要凭印象排顺序，也不要把发送方和接收方写反（例如“工具读取程序”是 from=程序、to=工具）。",
      "包裹颜色：step.payload 是这一拍传递的东西的颜色，只能取 yellow、teal、coral，payloadLabel 是它的名字（≤6 字，如“问题”“读取结果”）。同一份信息沿路传递时颜色和名字保持不变；只有 transform（转换）才换成另一种颜色，用 becomes 和 becomesLabel 写出转换后的颜色和名字，且必须和 payload 不同；create（生成）用 becomes 写出生成物。不传包裹的动作（check、trigger、connect、introduce）可以不写颜色。",
      "多用词汇表里的不同动作和角色来贴合原文，不要全部都用 send。",
      "character 只能取 characters 里的 id；packet 和 lens 不是角色，不要用。",
      "fit 是你对这个比喻的自评（0–1）：比喻是否会扭曲原理、每一拍能否对应。拿不准就写低，fit 低于 " + MIN_FIT + " 时视频会退回卡片图，这比硬套一个不准确的比喻好。fitReason 用一句话说明。",
      "只输出符合 JSON Schema 的 JSON，不要 Markdown。",
      JSON.stringify(z.toJSONSchema(planSchema)),
    ].join("\n") },
    { role: "user", content: JSON.stringify({
      vocabulary,
      project: { title: script.title, oneLineSummary: script.oneLineSummary, problem: script.problem, features: script.features, exampleScenario: script.exampleScenario },
      beats: script.conceptStoryboard?.beats.map((beat) => ({ id: beat.id, text: beat.text })) ?? [],
      examples: EXAMPLES,
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
    // Design, evaluate by rule, then check directions independently; any problem goes back to the designer once.
    const attempt = async (feedback: string[]) => {
      const candidate = await requestPlan(script, feedback);
      const evaluation = evaluate(script, candidate);
      const directions = evaluation.use ? await directionProblems(script, candidate) : [];
      return { candidate, evaluation, directions };
    };
    let result = await attempt([]);
    if (!result.evaluation.use || result.directions.length) {
      const problems = [...result.evaluation.reasons, ...result.directions];
      console.log(`[节点 3] ${script.repo} 比喻方案未通过（${problems.join("；")}），按原因重试一次`);
      result = await attempt(problems);
    }
    const { candidate, evaluation, directions } = result;
    const accepted = evaluation.use && !directions.length;
    const finalEvaluation: MetaphorEvaluation = accepted ? evaluation : { ...evaluation, use: false, reasons: [...evaluation.reasons, ...directions] };
    console.log(accepted
      ? `[节点 3] ${script.repo} 比喻方案通过：${candidate.name}（适配度 ${candidate.fit}）`
      : `[节点 3] ${script.repo} 比喻方案不适用，原理段沿用卡片图：${finalEvaluation.reasons.join("；")}`);
    await recordGaps(script.repo, finalEvaluation);
    return { ...script, metaphor: { vocabularyHash, plan: accepted ? candidate : null } };
  } catch (error) {
    console.log(`[节点 3] ${script.repo} 比喻方案设计失败，原理段沿用卡片图：${error instanceof Error ? error.message : String(error)}`);
    return script;
  }
}
