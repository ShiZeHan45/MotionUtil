// Registry check: every character, action and preset scene must stay inside the style tokens, and nothing already
// registered may change by accident. Run `pnpm check:metaphor`; after reviewing MetaphorGallery run it with --update.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { ACTIONS, ActionLayer } from "./actions";
import { ACTION_CATEGORIES, type ActionCategory } from "./categories";
import { CHARACTERS, Character, type CharacterId } from "./characters";
import { METAPHOR_SCENES } from "./scenes";
import { allowedColors, allowedStrokeWidths, CHARACTER_CANVAS, materials, PAYLOAD_COLORS, SHADOW, SIZES, STAGE } from "./style";

const baselinePath = path.resolve("src/video/metaphor/baseline.json");
const update = process.argv.includes("--update");
const problems: string[] = [];
const fail = (message: string) => problems.push(message);
const hash = (value: string) => createHash("sha256").update(value).digest("hex").slice(0, 16);

const knownStyleStrings = [...Object.values(SHADOW), materials.glass];
function auditMarkup(label: string, markup: string): void {
  let rest = markup;
  for (const known of knownStyleStrings) rest = rest.split(known).join("");
  for (const match of rest.matchAll(/\b(?:fill|stroke)="([^"]+)"/g)) {
    if (!allowedColors.has(match[1]!.toLowerCase())) fail(`${label}: 颜色 ${match[1]} 不在风格令牌里`);
  }
  for (const match of rest.matchAll(/#[0-9a-fA-F]{6}\b/g)) {
    if (!allowedColors.has(match[0].toLowerCase())) fail(`${label}: 颜色 ${match[0]} 不在风格令牌里`);
  }
  for (const match of rest.matchAll(/rgba?\([^)]*\)/g)) fail(`${label}: 出现未登记的 ${match[0]}，请先加入 style.ts`);
  for (const match of rest.matchAll(/stroke-width="([\d.]+)"/g)) {
    if (!allowedStrokeWidths.has(Number(match[1]))) fail(`${label}: 描边 ${match[1]} 不在令牌 STROKE 里`);
  }
}

const hashes: Record<string, string> = {};

for (const id of Object.keys(CHARACTERS) as CharacterId[]) {
  const markup = renderToStaticMarkup(<Character id={id} size={CHARACTER_CANVAS} />);
  if (!CHARACTERS[id].zh.trim()) fail(`角色 ${id} 缺少中文名`);
  if (!markup.includes(`viewBox="0 0 ${CHARACTER_CANVAS} ${CHARACTER_CANVAS}"`)) fail(`角色 ${id}: 画布必须是 ${CHARACTER_CANVAS}×${CHARACTER_CANVAS}（请使用 Frame）`);
  if (!markup.includes('stroke-linecap="round"')) fail(`角色 ${id}: 没有使用统一的描边样式（请使用 Frame）`);
  auditMarkup(`角色 ${id}`, markup);
  hashes[`character:${id}`] = hash(markup);
}

for (const category of Object.keys(ACTIONS) as ActionCategory[]) {
  if (!(category in ACTION_CATEGORIES)) fail(`动作 ${category} 不在封闭类别列表里`);
  if (category === "other") fail("“列表外”不能有画法，它只表示退回卡片图");
  for (const t of [0, 0.25, 0.5, 0.75, 1]) {
    const markup = renderToStaticMarkup(<ActionLayer category={category} from={{ x: 150, y: 250 }} to={{ x: 760, y: 250 }} t={t} />);
    auditMarkup(`动作 ${category} t=${t}`, markup);
    hashes[`action:${category}@${t}`] = hash(markup);
  }
}

for (const scene of Object.values(METAPHOR_SCENES)) {
  const where = `场景 ${scene.id}`;
  const ids = new Set(scene.actors.map((actor) => actor.id));
  if (ids.size !== scene.actors.length) fail(`${where}: 角色 id 重复`);
  if (scene.steps.length < 2 || scene.steps.length > 5) fail(`${where}: 步骤数应为 2–5`);
  for (const actor of scene.actors) {
    if (!(actor.character in CHARACTERS)) fail(`${where}: 角色 ${actor.character} 未登记`);
    if (actor.at.x < 0.08 || actor.at.x > 0.92 || actor.at.y < 0.15 || actor.at.y > 0.85) fail(`${where}: ${actor.id} 的位置超出安全范围`);
    if (Array.from(actor.label).length > 10) fail(`${where}: ${actor.id} 的比喻名超过 10 个字`);
    if (Array.from(actor.real).length > 14) fail(`${where}: ${actor.id} 的对应对象超过 14 个字`);
    if (!actor.real.trim()) fail(`${where}: ${actor.id} 缺少“对应真实对象”`);
  }
  for (const [index, step] of scene.steps.entries()) {
    if (!(step.action in ACTIONS)) fail(`${where}: 第 ${index + 1} 步的动作 ${step.action} 还没有画法，应退回卡片图`);
    if (!ids.has(step.from) || !ids.has(step.to)) fail(`${where}: 第 ${index + 1} 步引用了不存在的角色`);
    if (Array.from(step.say).length > 30) fail(`${where}: 第 ${index + 1} 步说明超过 30 个字`);
    for (const color of [step.payload, step.becomes]) if (color && !(color in PAYLOAD_COLORS)) fail(`${where}: 第 ${index + 1} 步的包裹颜色 ${color} 不在令牌里`);
    if (step.action === "transform" && (!step.payload || !step.becomes || step.payload === step.becomes)) fail(`${where}: 第 ${index + 1} 步是转换，必须给出前后两种不同的颜色`);
    if (step.action !== "introduce" && step.from === step.to) fail(`${where}: 第 ${index + 1} 步的发送方和接收方相同`);
    for (const label of [step.payloadLabel, step.becomesLabel]) if (label && Array.from(label).length > 8) fail(`${where}: 第 ${index + 1} 步的包裹标签超过 8 个字`);
  }
  const used = new Set(scene.steps.flatMap((step) => [step.from, step.to]));
  for (const actor of scene.actors) if (!used.has(actor.id)) fail(`${where}: ${actor.id} 从未参与任何步骤`);
  const minimumGap = SIZES.actor + 92;
  for (const [i, a] of scene.actors.entries()) for (const b of scene.actors.slice(i + 1)) {
    const dx = Math.abs(a.at.x - b.at.x) * STAGE.width;
    const dy = Math.abs(a.at.y - b.at.y) * STAGE.actorArea;
    if (dy < minimumGap && dx < 262) fail(`${where}: ${a.id} 与 ${b.id} 靠得太近，标签会重叠`);
  }
}

let baseline: Record<string, string> = {};
try { baseline = JSON.parse(readFileSync(baselinePath, "utf8")) as Record<string, string>; } catch { /* first run */ }
if (update) {
  if (problems.length) { console.log(problems.map((item) => `FAIL ${item}`).join("\n")); console.log("存在问题，不更新基线"); process.exit(1); }
  writeFileSync(baselinePath, `${JSON.stringify(hashes, null, 2)}\n`);
  console.log(`基线已更新：${Object.keys(hashes).length} 项`);
  process.exit(0);
}
for (const [key, value] of Object.entries(hashes)) {
  if (!(key in baseline)) fail(`${key}: 新增项尚未登记基线，请在图鉴里确认后运行 pnpm check:metaphor -- --update`);
  else if (baseline[key] !== value) fail(`${key}: 与基线不一致，已登记的画法被改动；确认是有意修改后运行 --update`);
}
for (const key of Object.keys(baseline)) if (!(key in hashes)) fail(`${key}: 基线中存在但注册表里已不见`);

console.log(problems.length ? problems.map((item) => `FAIL ${item}`).join("\n") : `OK：${Object.keys(CHARACTERS).length} 个角色、${Object.keys(ACTIONS).length} 个动作、${Object.keys(METAPHOR_SCENES).length} 个场景，风格检查通过`);
process.exit(problems.length ? 1 : 0);
