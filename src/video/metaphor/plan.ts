// Deterministic part of the metaphor pipeline, shared by node 3 (to design and record gaps) and the video (to decide
// whether a concept scene is drawn as a metaphor or as the card diagram). No model calls and no Node-only imports.
import type { MetaphorPlan } from "../../types";
import { ACTIONS } from "./actions";
import { ACTION_CATEGORIES, type ActionCategory } from "./categories";
import { CHARACTERS, type CharacterId } from "./characters";
import type { MetaphorScene } from "./scenes";

/** Six fixed positions keep every generated scene inside the layout the style check validates. */
export const SLOTS = {
  t1: { x: 0.17, y: 0.2 }, t2: { x: 0.5, y: 0.2 }, t3: { x: 0.83, y: 0.2 },
  b1: { x: 0.17, y: 0.72 }, b2: { x: 0.5, y: 0.72 }, b3: { x: 0.83, y: 0.72 },
} as const;
export type SlotId = keyof typeof SLOTS;

// Props appear by themselves when an action plays; they are not actors.
const PROP_CHARACTERS: readonly string[] = ["packet", "lens"];
export const MIN_FIT = 0.6;
const MIN_GROUNDED_SHARE = 0.7;

export function actorCharacters(): CharacterId[] {
  return (Object.keys(CHARACTERS) as CharacterId[]).filter((id) => !PROP_CHARACTERS.includes(id));
}
export function drawableCategories(): ActionCategory[] {
  return (Object.keys(ACTIONS) as ActionCategory[]);
}

/** Everything the planning model is allowed to pick from; its hash decides when stored plans are redone. */
export function vocabularyDescriptor() {
  return {
    characters: actorCharacters().map((id) => ({ id, name: CHARACTERS[id].zh, stands_for: CHARACTERS[id].use })),
    categories: (Object.keys(ACTION_CATEGORIES) as ActionCategory[]).map((id) => ({ id, name: ACTION_CATEGORIES[id].zh, meaning: ACTION_CATEGORIES[id].hint, drawable: id in ACTIONS })),
    slots: Object.keys(SLOTS),
  };
}

export type MetaphorContext = { beatIds: string[]; knownText: string };
export type MetaphorEvaluation = {
  use: boolean;
  /** Why the metaphor cannot be used; empty when `use` is true. */
  reasons: string[];
  /** Categories of beats that cannot be drawn yet. These feed the gap list. */
  gaps: string[];
  scene?: MetaphorScene;
  /** Step index shown while each concept beat is spoken; beats without a step hold the previous one. */
  stepByBeat: Map<string, number>;
};

const compact = (value: string) => value.replace(/\s+/gu, "").toLowerCase();

export function evaluateMetaphor(plan: MetaphorPlan | null | undefined, context: MetaphorContext): MetaphorEvaluation {
  const result: MetaphorEvaluation = { use: false, reasons: [], gaps: [], stepByBeat: new Map() };
  const reasons = result.reasons;
  if (!plan) { reasons.push("没有可用的比喻方案"); return result; }
  if (!(plan.fit >= MIN_FIT)) reasons.push(`适配度 ${plan.fit} 低于 ${MIN_FIT}：${plan.fitReason}`);

  const actorIds = new Set<string>();
  const slots = new Set<string>();
  if (plan.actors.length < 2 || plan.actors.length > 6) reasons.push("角色数量必须为 2–6 个");
  for (const actor of plan.actors) {
    if (actorIds.has(actor.id)) reasons.push(`角色 id 重复：${actor.id}`);
    actorIds.add(actor.id);
    if (!actorCharacters().includes(actor.character as CharacterId)) reasons.push(`角色 ${actor.id} 使用了不可用的形象 ${actor.character}`);
    if (!(actor.slot in SLOTS)) reasons.push(`角色 ${actor.id} 的位置 ${actor.slot} 无效`);
    else if (slots.has(actor.slot)) reasons.push(`位置 ${actor.slot} 被重复使用`);
    slots.add(actor.slot);
    if (!actor.label.trim() || Array.from(actor.label).length > 10) reasons.push(`角色 ${actor.id} 的比喻名需为 1–10 个字`);
    if (!actor.real.trim() || Array.from(actor.real).length > 14) reasons.push(`角色 ${actor.id} 的对应对象需为 1–14 个字`);
  }

  const planned = new Map(plan.beats.map((beat) => [beat.beatId, beat]));
  for (const beatId of context.beatIds) if (!planned.has(beatId)) reasons.push(`原理拍 ${beatId} 没有被分类`);
  const steps: MetaphorScene["steps"] = [];
  const stepIndexByBeat = new Map<string, number>();
  for (const beatId of context.beatIds) {
    const beat = planned.get(beatId);
    if (!beat) continue;
    if (!(beat.category in ACTION_CATEGORIES)) { reasons.push(`拍 ${beatId} 的类别 ${beat.category} 不在封闭列表里`); result.gaps.push("other"); continue; }
    if (!(beat.category in ACTIONS)) { result.gaps.push(beat.category); continue; }
    const step = beat.step;
    if (!step) { reasons.push(`拍 ${beatId} 属于可画类别 ${beat.category}，却没有给出画面步骤`); continue; }
    if (step.action !== beat.category) reasons.push(`拍 ${beatId} 的动作 ${step.action} 与类别 ${beat.category} 不一致`);
    if (!actorIds.has(step.from) || !actorIds.has(step.to)) reasons.push(`拍 ${beatId} 引用了不存在的角色`);
    if (!step.say.trim() || Array.from(step.say).length > 30) reasons.push(`拍 ${beatId} 的画面说明需为 1–30 个字`);
    stepIndexByBeat.set(beatId, steps.length);
    steps.push({ action: step.action as ActionCategory, from: step.from, to: step.to, say: step.say });
  }
  if (result.gaps.length) reasons.push(`有 ${result.gaps.length} 拍的动作类别还没有画法：${[...new Set(result.gaps)].join("、")}`);
  if (steps.length < 2) reasons.push("可画的步骤少于 2 步");

  const text = compact(context.knownText);
  const unmatched = plan.actors.filter((actor) => !text.includes(compact(actor.real)));
  if (plan.actors.length && 1 - unmatched.length / plan.actors.length < MIN_GROUNDED_SHARE) {
    reasons.push(`对应对象在讲稿里找不到依据：${unmatched.map((actor) => actor.real).join("、")}`);
  }

  if (reasons.length) return result;
  let previous = 0;
  for (const beatId of context.beatIds) {
    previous = stepIndexByBeat.get(beatId) ?? previous;
    result.stepByBeat.set(beatId, previous);
  }
  result.scene = {
    id: "planned",
    name: plan.name,
    actors: plan.actors.map((actor) => ({ id: actor.id, character: actor.character as CharacterId, label: actor.label, real: actor.real, at: SLOTS[actor.slot as SlotId] })),
    steps,
  };
  result.use = true;
  return result;
}

/** Text a plan's `real` names may be grounded in. */
export function groundingText(project: { title?: string; oneLineSummary?: string; problem?: string; features?: string[]; usage?: string; exampleScenario?: string; exampleFlow?: string[]; exampleResult?: string; conceptStoryboard?: { beats: Array<{ text: string; spokenText?: string; objects?: Array<{ label: string; detail?: string }> }> } }): string {
  return [
    project.title, project.oneLineSummary, project.problem, project.usage, project.exampleScenario, project.exampleResult,
    ...(project.features ?? []), ...(project.exampleFlow ?? []),
    ...(project.conceptStoryboard?.beats.flatMap((beat) => [beat.text, beat.spokenText, ...(beat.objects ?? []).flatMap((object) => [object.label, object.detail])]) ?? []),
  ].filter(Boolean).join(" ");
}
