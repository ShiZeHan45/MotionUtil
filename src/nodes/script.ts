import { createHash } from "node:crypto";
import path from "node:path";
import { z } from "zod";
import type { ConceptObject, ConceptStoryboard, ProjectScript, RepoFacts, StoryboardValidationIssue } from "../types";
import { config } from "../lib/config";
import { readJson, safeJson, writeJson } from "../lib/io";
import { repoSlug } from "../lib/paths";
import { requestChatCompletion, type ChatMessage } from "../lib/chat-completion";
import { estimateNarration, loadNarrationTiming, MAX_VIDEO_DURATION_MS, narrationCharacterBudget, TARGET_VIDEO_DURATION_MS, type NarrationTiming } from "../lib/narration";

const PROMPT_VERSION = "gh-weekly-script-v9-spoken-duration-budget";
const MAX_BUDGET_REVISIONS = 3;
const conceptObjectSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]{1,30}$/),
  kind: z.enum(["problem", "input", "agent", "context", "system", "file", "terminal", "transform", "result", "note"]),
  label: z.string().min(1).max(28),
  detail: z.string().max(80).optional(),
  x: z.number().min(8).max(92),
  y: z.number().min(12).max(88),
});
const conceptStoryboardSchema = z.object({
  version: z.literal(1),
  title: z.string().min(2).max(40),
  summary: z.string().min(8).max(160),
  beats: z.array(z.object({
    id: z.string().regex(/^beat-[1-8]$/),
    cue: z.string().min(4).max(100),
    text: z.string().min(8).max(320),
    spokenText: z.string().min(8).max(320).optional(),
    action: z.enum(["draw", "connect", "group", "transform", "highlight", "result", "hold"]),
    voiceShare: z.number().min(0.04).max(0.5),
    objectIds: z.array(z.string().regex(/^[a-z][a-z0-9-]{1,30}$/)).min(1).max(8),
    objects: z.array(conceptObjectSchema).max(8).optional(),
    connectors: z.array(z.object({ from: z.string(), to: z.string(), label: z.string().max(24).optional() })).max(8).optional(),
    focusIds: z.array(z.string()).max(4).optional(),
  })).min(3).max(8),
});
const responseSchema = z.object({
  scripts: z.array(z.object({
    repo: z.string().min(3).max(150),
    rank: z.number().int().positive(),
    title: z.string().min(2).max(80),
    oneLineSummary: z.string().min(8).max(160),
    problem: z.string().min(8).max(260),
    features: z.array(z.string().min(3).max(120)).min(1).max(3),
    audience: z.string().min(3).max(120),
    usage: z.string().min(3).max(180),
    exampleScenario: z.string().min(8).max(240),
    exampleFlow: z.array(z.string().min(3).max(160)).min(2).max(4),
    exampleResult: z.string().min(3).max(180),
    usageSteps: z.array(z.string().min(3).max(180)).min(2).max(5),
    requirements: z.array(z.string().min(3).max(120)).min(1).max(4),
    limitations: z.array(z.string().min(3).max(140)).min(1).max(3),
    conceptStoryboard: conceptStoryboardSchema,
    narrationSegments: z.array(z.object({
      scene: z.enum(["intro", "problem", "concept", "case", "dashboard", "setup", "workflow", "requirements", "summary"]),
      text: z.string().min(2).max(500),
      spokenText: z.string().min(2).max(500).optional(),
    })).length(9),
    sources: z.array(z.string().url()).min(1),
  })),
});
const durationRevisionSchema = z.object({
  narrationSegments: z.array(z.object({
    scene: z.enum(["intro", "problem", "concept", "case", "dashboard", "setup", "workflow", "requirements", "summary"]),
    text: z.string().min(2).max(500),
    spokenText: z.string().min(2).max(500).optional(),
  })).length(9),
  conceptStoryboard: conceptStoryboardSchema,
});

function cacheKey(facts: RepoFacts, timing: NarrationTiming): string {
  const compact = {
    fullName: facts.fullName,
    rank: facts.rank,
    description: facts.description,
    language: facts.language,
    topics: facts.topics,
    homepage: facts.homepage,
    license: facts.license,
    starsThisWeek: facts.starsThisWeek,
    readme: facts.readme?.text ?? null,
    sources: facts.sources,
    visualAssets: facts.visualAssets?.map(({ id, label, sourceUrl }) => ({ id, label, sourceUrl })) ?? [],
  };
  return createHash("sha256").update(JSON.stringify({
    prompt: PROMPT_VERSION, service: config.openAiBaseUrl, model: config.openAiModel,
    reasoningEffort: config.openAiReasoningEffort ?? "auto",
    narration: { model: timing.model, voice: timing.voice, speed: timing.speed, pauseMs: timing.pauseMs, substitutions: timing.substitutions },
    facts: compact,
  })).digest("hex");
}

function factsForPrompt(facts: RepoFacts) {
  return {
    repo: facts.fullName,
    rank: facts.rank,
    url: facts.url,
    description: facts.description,
    language: facts.language,
    totalStars: facts.totalStars,
    starsThisWeek: facts.starsThisWeek,
    topics: facts.topics,
    homepage: facts.homepage,
    license: facts.license,
    readme: facts.readme?.text ?? null,
    visualAssets: facts.visualAssets?.map(({ id, label, sourceUrl }) => ({ id, label, sourceUrl })) ?? [],
    allowedSources: facts.sources,
  };
}

function validateScriptCoverage(script: ProjectScript, source: RepoFacts, timing: NarrationTiming): void {
  if (script.repo.toLowerCase() !== source.fullName.toLowerCase()) throw new Error(`讲稿仓库不匹配：预期 ${source.fullName}，实际 ${script.repo}`);
  if (script.rank !== source.rank) throw new Error(`讲稿名次不匹配：${source.fullName} 应为 ${source.rank}，实际 ${script.rank}`);
  const requiredScenes = ["intro", "problem", "concept", "case", "dashboard", "setup", "workflow", "requirements", "summary"];
  const scenes = script.narrationSegments.map((segment) => segment.scene);
  if (requiredScenes.some((scene, index) => scenes[index] !== scene)) throw new Error(`${source.fullName} 讲稿场景必须按固定顺序包含 ${requiredScenes.join(" → ")}`);
  const allowed = new Set(source.sources);
  if (script.sources.some((url) => !allowed.has(url))) throw new Error(`${source.fullName} 讲稿引用了未提供给 AI 的来源`);
  const estimate = estimateNarration(script, timing);
  const minimumCharacters = Math.min(450, Math.floor(narrationCharacterBudget(timing, estimate.segmentCount) * 0.4));
  if (estimate.spokenCharacters < minimumCharacters) throw new Error(`${source.fullName} 实际口播只有 ${estimate.spokenCharacters} 字符，未完整覆盖讲解内容`);
  const storyboard = script.conceptStoryboard;
  if (!storyboard) throw new Error(`${source.fullName} 缺少原理故事板`);
  const objectIds = new Set<string>();
  for (const beat of storyboard.beats) {
    if (!beat.text || beat.text.trim().length < 8) throw new Error(`${source.fullName} 原理故事板 ${beat.id} 缺少可配音的 text`);
    for (const object of beat.objects ?? []) objectIds.add(object.id);
  }
  for (const beat of storyboard.beats) {
    for (const id of beat.objectIds) if (!objectIds.has(id)) throw new Error(`${source.fullName} 原理故事板 ${beat.id} 引用了未定义对象 ${id}`);
    for (const connector of beat.connectors ?? []) {
      if (!objectIds.has(connector.from) || !objectIds.has(connector.to)) throw new Error(`${source.fullName} 原理故事板 ${beat.id} 的连线引用了未定义对象`);
    }
  }
  const totalShare = storyboard.beats.reduce((sum, beat) => sum + beat.voiceShare, 0);
  if (totalShare < 0.9 || totalShare > 1.1) throw new Error(`${source.fullName} 原理故事板 voiceShare 合计为 ${totalShare.toFixed(2)}，应接近 1`);
  const issues = validateStoryboardLayout(storyboard);
  if (issues.length) throw new Error(`${source.fullName} 原理故事板验收失败：${issues.map((issue) => issue.message).join("；")}`);
}

/** Validate the graph before TTS/rendering so disconnected cards never reach a video. */
export function validateStoryboardLayout(storyboard: ConceptStoryboard): StoryboardValidationIssue[] {
  const issues: StoryboardValidationIssue[] = [];
  const objects = new Map<string, ConceptObject>();
  const firstBeat = new Map<string, number>();
  for (const [beatIndex, beat] of storyboard.beats.entries()) {
    for (const object of beat.objects ?? []) {
      if (!objects.has(object.id)) firstBeat.set(object.id, beatIndex);
      objects.set(object.id, object);
    }
  }
  const edges = new Set<string>();
  const visibleObjects = new Set<string>();
  for (const beat of storyboard.beats) {
    for (const id of beat.objectIds) visibleObjects.add(id);
    for (const id of beat.objectIds) if (!objects.has(id)) issues.push({ code: "missing-object", beatId: beat.id, objectId: id, message: `${beat.id} 引用了未定义对象 ${id}` });
    for (const connector of beat.connectors ?? []) {
      if (!objects.has(connector.from) || !objects.has(connector.to) || connector.from === connector.to) {
        issues.push({ code: "invalid-connector", beatId: beat.id, message: `${beat.id} 有无效连线 ${connector.from} → ${connector.to}` });
        continue;
      }
      if (!visibleObjects.has(connector.from) || !visibleObjects.has(connector.to)) {
        issues.push({ code: "missing-connector", beatId: beat.id, message: `${beat.id} 的连线端点必须已在前拍或本拍出现` });
      }
      const edge = `${connector.from}→${connector.to}`;
      if (edges.has(edge)) issues.push({ code: "invalid-connector", beatId: beat.id, message: `${beat.id} 重复绘制连线 ${edge}` });
      edges.add(edge);
    }
  }
  const degrees = new Map<string, number>();
  for (const edge of edges) {
    const [from, to] = edge.split("→");
    degrees.set(from!, (degrees.get(from!) ?? 0) + 1);
    degrees.set(to!, (degrees.get(to!) ?? 0) + 1);
  }
  for (const [id, beatIndex] of firstBeat) {
    if (storyboard.beats.length > 1 && !degrees.has(id) && firstBeat.size > 1) {
      issues.push({ code: "orphan-object", beatId: storyboard.beats[beatIndex]?.id, objectId: id, message: `对象 ${id} 没有任何解释关系或连线` });
    }
  }
  // Model coordinates are ordering hints. Node 5 validates the actual auto-layout.
  if (storyboard.beats.some((beat) => beat.action === "connect" || (beat.connectors?.length ?? 0) > 0) && edges.size === 0) {
    issues.push({ code: "weak-sequence", message: "故事板声称在建立关系，但没有有效连线" });
  }
  return issues;
}

function parseScripts(content: string, facts: RepoFacts[], timing: NarrationTiming): ProjectScript[] {
  const parsed = responseSchema.parse(safeJson(content));
  if (parsed.scripts.length !== facts.length) throw new Error(`讲稿数量错误：请求 ${facts.length} 个，返回 ${parsed.scripts.length} 个`);
  const byRepo = new Map(parsed.scripts.map((script) => [script.repo.toLowerCase(), script as ProjectScript]));
  return facts.map((source) => {
    const script = byRepo.get(source.fullName.toLowerCase());
    if (!script) throw new Error(`模型漏掉仓库 ${source.fullName}`);
    validateScriptCoverage(script, source, timing);
    return { ...script, visualAssets: source.visualAssets };
  });
}

async function generateBatch(facts: RepoFacts[], timing: NarrationTiming): Promise<ProjectScript[]> {
  if (!config.openAiApiKey || !config.openAiModel) {
    throw new Error("节点 3 需要配置 OPENAI_API_KEY 和 OPENAI_MODEL。请复制 .env.example 为 .env 并填写；脚本生成结果会按输入与模型缓存。");
  }
  const system = [
    "你是中文开源软件讲解视频的事实型编剧。",
    "只能使用输入资料支持的事实，不得推测功能、性能、用户数量、收费模式或成熟度。资料不足就用中性表述，不要编造。",
    "本周名次和仓库名必须原样保留。来源只能从每个项目 allowedSources 里选择。",
    "只输出 JSON，不要 Markdown、代码围栏或额外解释。JSON 格式为 {\"scripts\":[...]}。",
    "每个项目必须输出 repo, rank, title, oneLineSummary, problem, features（最多3项）, audience, usage, exampleScenario, exampleFlow（2到4步）, exampleResult, usageSteps（2到5步）, requirements（1到4项）, limitations（1到3项）, narrationSegments, sources 和 conceptStoryboard；不要省略这些字段。",
    "narrationSegments 必须正好九段且顺序固定：intro、problem、concept、case、dashboard、setup、workflow、requirements、summary；每段含 scene 和 text。只有数字需要特殊口播时才额外提供 spokenText；text 用于字幕，spokenText 用于配音。",
    "面向普通短视频观众，逐步讲明白：先说排名，再说痛点和项目是什么，用一个简单类比解释，再走完一个具体案例，然后讲界面里能看到的结果、安装配置步骤、核心操作、运行条件与边界，最后只做内容总结。",
    "严格按场景放置口播：intro 只讲排名、项目名和榜单数字；problem 只讲痛点；concept 只解释项目是什么；case 才引出并展开案例。后续场景的预告或转场句必须放在对应场景里，不能提前塞进 intro；每段口播必须和该段动画画面对应。",
    "conceptStoryboard 的 beats 必须按口播顺序讲清一个项目的核心原理。每个 beat 必须同时给出 text（这一拍要说的话）和可选 spokenText，voiceShare 是 concept 口播中该节拍所占比例，所有 voiceShare 之和应接近 1。cue 只是程序内部的时间锚点，绝不作为观众可见文字；cue 只写简短的动作标记，不要写‘首先’、‘接着’、‘然后’、‘最后’等思考过程或讲解句。先画输入或问题，再逐步画核心对象和关系，最后画结果；不要把所有对象一开始铺满。对象位置只提供语义参考，渲染器会自动排版；不要在同一行堆卡片。每一个新增对象都必须通过 connectors 与已经出现或本拍出现的对象建立有口播依据的关系；没有关系的装饰对象不要输出。仅使用允许的对象类型，不写 React、SVG 或其他代码，不编造资料中没有的内部机制。",
    "不要输出背景、网格、渐变、边框、装饰图案或整张图片；背景和画布由程序统一提供。你的输出只描述要画的对象、对象之间的关系和每一拍的口播。",
    "conceptStoryboard 的 title 必须概括项目原理，summary 必须是一句普通人能听懂的话。多 Agent 项目可以画 agent 和 context；编译器、转换器、数据处理项目应按输入、处理、输出选择对象。动作只表达画出、连接、圈定、转换、强调、结果或停留。",
    `口播为自然普通话，目标约 180 秒，可接受 160–200 秒，不得超过 200 秒；不要为了凑时长重复内容。当前音色 ${timing.voice}，语速 ${timing.speed}，每段停顿 ${timing.pauseMs} 毫秒。按当前音色预算，实际送入配音的全部文字合计控制在约 ${narrationCharacterBudget(timing, 16)} 字符以内（包含中文、英文、标点和数字，不计空格）。intro 保留‘本周 GitHub Trending 第 N 名，今天介绍 XXX’的意思。`,
    "时长预算必须按实际口播统计：concept 场景由 conceptStoryboard.beats 的口播替代原 concept 段，其他八段各自保留；每段优先使用 spokenText，没有才使用 text。不得漏算 beats，也不得通过把更多文字放进 spokenText 绕过预算。重点给原理、案例和操作，排名、痛点、条件和总结简洁表达。",
    "案例可以用资料支持的假设场景，但必须说清是举例；不能把官方演示截图里的示例数字写成真实用户效果。使用步骤按官方资料可复现的先后顺序写，不要编造按钮、安装命令或不支持的功能。",
    "不要写‘想试用的话’、关注、点赞、评论等营销 CTA。视频只讲解、展示案例和讲清使用方法。",
    "保留英文项目名和必要技术词，首次出现的术语用日常语言解释，不逐字念 README，不使用 Markdown、列表符号或括号里的舞台指令。",
    "数量、日期等容易被语音合成器误读时，在 spokenText 中改写为完整中文读法，并保留量词单位；text 仍保留适合屏幕阅读的阿拉伯数字。其他部分不要重复整段。",
    "字段字数与数组项数必须符合以下 JSON Schema，不能缺字段或输出超长文字：",
    JSON.stringify(z.toJSONSchema(responseSchema)),
  ].join("\n");
  const messages: ChatMessage[] = [
    { role: "system", content: system },
    { role: "user", content: JSON.stringify({ projects: facts.map(factsForPrompt), narrationBudget: { targetSeconds: 180, maximumSeconds: 200, maximumSpokenCharacters: narrationCharacterBudget(timing, 16), voice: timing.voice, speed: timing.speed, pauseMs: timing.pauseMs } }) },
  ];
  let content = await requestChatCompletion(messages);
  try {
    return parseScripts(content, facts, timing);
  } catch (error) {
    const detail = error instanceof z.ZodError
      ? error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("；")
      : error instanceof SyntaxError ? "结果不是完整的 JSON" : error instanceof Error ? error.message : String(error);
    console.log(`[节点 3] 讲稿格式需要修复：${detail}；向同一模型修复一次`);
    content = await requestChatCompletion([
      ...messages,
      { role: "assistant", content },
      { role: "user", content: `修复以上结果，只输出符合 JSON Schema 的完整 JSON。错误：${detail}` },
    ]);
    try { return parseScripts(content, facts, timing); }
    catch (repairError) {
      const reason = repairError instanceof Error ? repairError.message : String(repairError);
      throw new Error(`${facts.map((item) => item.fullName).join("、")} 讲稿修复后仍不符合要求：${reason}`);
    }
  }
}

/** Ask the model to shorten only the spoken timeline while preserving facts and the drawing graph. */
export async function shortenScriptForDuration(script: ProjectScript, durationMs: number, maxDurationMs: number, timing: NarrationTiming, durationSource: "measured" | "estimated" = "measured"): Promise<ProjectScript> {
  const targetDurationMs = Math.min(TARGET_VIDEO_DURATION_MS, maxDurationMs - 10_000);
  const targetSeconds = Math.floor(targetDurationMs / 1_000);
  const before = estimateNarration(script, timing);
  const measuredBudget = Math.floor(before.spokenCharacters * Math.max(1, targetDurationMs - before.pauseMs) / Math.max(1, durationMs - before.pauseMs) * 0.97);
  const maximumSpokenCharacters = Math.min(measuredBudget, narrationCharacterBudget(timing, before.segmentCount, targetDurationMs));
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: [
        "你是中文技术视频的时长编辑。只输出 JSON，不要 Markdown 或解释。",
        "把一份已经通过事实、结构和原理故事板验收的讲稿压缩到指定时长。只压缩 narrationSegments 的口播文字，以及 conceptStoryboard.beats 的 text 和 spokenText；不要改变项目名、名次、事实、来源、场景顺序、beat id、对象、连线、动作或 voiceShare。",
        "不得删除九段 narrationSegments 或 conceptStoryboard 的 beat；每段仍要完整表达本段核心意思，不能用省略号、列表符号或舞台指令。不要添加背景、图片或装饰。",
        `目标总时长约 ${targetSeconds} 秒，当前${durationSource === "measured" ? "实测" : "预计"} ${Math.round(durationMs / 100) / 10} 秒，允许上限 ${Math.floor(maxDurationMs / 1_000)} 秒。当前实际口播 ${before.spokenCharacters} 字符，压缩后实际口播必须控制在 ${maximumSpokenCharacters} 字符以内。音色 ${timing.voice}，语速 ${timing.speed}，段间停顿 ${timing.pauseMs} 毫秒。输出格式必须是 {\"narrationSegments\":[...],\"conceptStoryboard\":{...}}。`,
        "实际口播按八段非 concept 的 spokenText（没有则 text）加上所有 conceptStoryboard.beats 的 spokenText（没有则 text）计算。concept 原始段不重复计入，但 beats 必须全部计入。中文、英文、数字和标点均计入，空格不计。text 与 spokenText 应表达同样内容，压缩两者，不能只改字幕而保留冗长 spokenText。",
      ].join("\n"),
    },
    { role: "user", content: JSON.stringify({ script }) },
  ];
  const parseRevision = (content: string): ProjectScript => {
    const revision = durationRevisionSchema.parse(safeJson(content));
    if (revision.narrationSegments.some((segment, index) => segment.scene !== script.narrationSegments[index]?.scene)) throw new Error(`${script.repo} 时长修订改变了九段场景顺序`);
    const storyboard = script.conceptStoryboard;
    if (!storyboard || revision.conceptStoryboard.beats.length !== storyboard.beats.length || revision.conceptStoryboard.beats.some((beat, index) => beat.id !== storyboard.beats[index]?.id)) {
      throw new Error(`${script.repo} 时长修订改变了原理 beat 结构`);
    }
    // Compression can edit speech only; keep the accepted drawing graph intact.
    const result: ProjectScript = {
      ...script,
      narrationSegments: revision.narrationSegments,
      conceptStoryboard: { ...storyboard, beats: storyboard.beats.map((beat, index) => ({ ...beat, text: revision.conceptStoryboard.beats[index]!.text, spokenText: revision.conceptStoryboard.beats[index]!.spokenText })) },
    };
    const after = estimateNarration(result, timing);
    if (after.spokenCharacters >= before.spokenCharacters) throw new Error(`实际口播未缩短：压缩前 ${before.spokenCharacters}，压缩后 ${after.spokenCharacters} 字符，要求不超过 ${maximumSpokenCharacters}`);
    if (after.spokenCharacters > maximumSpokenCharacters) throw new Error(`实际口播仍超出预算：${after.spokenCharacters} 字符，要求不超过 ${maximumSpokenCharacters}，请继续精简 text 和 spokenText`);
    return result;
  };
  let content = await requestChatCompletion(messages);
  try {
    return parseRevision(content);
  } catch (error) {
    const detail = error instanceof z.ZodError
      ? error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("；")
      : error instanceof Error ? error.message : String(error);
    content = await requestChatCompletion([
      ...messages,
      { role: "assistant", content },
      { role: "user", content: `修复结构和口播预算错误：${detail}。实际口播合计必须不超过 ${maximumSpokenCharacters} 字符。仍然只输出 narrationSegments 和 conceptStoryboard 的完整 JSON。` },
    ]);
    return parseRevision(content);
  }
}

async function fitNarrationBudget(script: ProjectScript, timing: NarrationTiming): Promise<ProjectScript> {
  let working = script;
  for (let revision = 0; revision <= MAX_BUDGET_REVISIONS; revision++) {
    const estimate = estimateNarration(working, timing);
    if (estimate.durationMs <= MAX_VIDEO_DURATION_MS) {
      console.log(`[节点 3] ${script.repo} 实际口播 ${estimate.spokenCharacters} 字符、${estimate.segmentCount} 段，预计 ${(estimate.durationMs / 1_000).toFixed(1)} 秒（配音后实测确认）`);
      return working;
    }
    if (revision === MAX_BUDGET_REVISIONS) throw new Error(`[节点 3] ${script.repo} 自动压缩后预计仍超过 200 秒，请重试讲稿生成`);
    console.log(`[节点 3] ${script.repo} 预计 ${(estimate.durationMs / 1_000).toFixed(1)} 秒，自动压缩讲稿（第 ${revision + 1} 轮）`);
    working = await shortenScriptForDuration(working, estimate.durationMs, MAX_VIDEO_DURATION_MS, timing, "estimated");
  }
  return working;
}

export async function generateScripts(facts: RepoFacts[], outputDirectory: string): Promise<ProjectScript[]> {
  console.log(`[节点 3] 模型服务：${config.openAiBaseUrl}；模型：${config.openAiModel || "未配置"}；思考强度：${config.openAiReasoningEffort ?? "自动"}；配音语速：${config.kokoroSpeed}`);
  const timing = await loadNarrationTiming();
  const cacheDirectory = path.resolve(".cache", "scripts");
  const cached = new Map<string, ProjectScript>();
  const validationReport: Array<{ repo: string; status: "passed" | "failed"; issues: string[] }> = [];
  const pending: RepoFacts[] = [];
  for (const item of facts) {
    const cachePath = path.join(cacheDirectory, `${repoSlug(item.fullName)}-${cacheKey(item, timing)}.json`);
    try {
      const script = await readJson<ProjectScript>(cachePath);
      validateScriptCoverage(script, item, timing);
      if (estimateNarration(script, timing).durationMs > MAX_VIDEO_DURATION_MS) throw new Error("缓存讲稿超出当前配音时长预算");
      cached.set(item.fullName.toLowerCase(), { ...script, visualAssets: item.visualAssets });
      validationReport.push({ repo: item.fullName, status: "passed", issues: [] });
    } catch {
      pending.push(item);
    }
  }
  if (pending.length) {
    console.log(`[节点 3] 为 ${pending.length} 个未缓存项目逐个生成讲稿，避免单次请求超时`);
    for (const item of pending) {
      console.log(`[节点 3] 正在生成 ${item.fullName} 的九段讲稿`);
      let generated: ProjectScript[];
      try {
        generated = await generateBatch([item], timing);
        generated = await Promise.all(generated.map((script) => fitNarrationBudget(script, timing)));
      } catch (error) {
        validationReport.push({ repo: item.fullName, status: "failed", issues: [error instanceof Error ? error.message : String(error)] });
        await writeJson(path.join(outputDirectory, "storyboard-validation.json"), validationReport);
        throw error;
      }
      const script = generated[0];
      if (!script) throw new Error(`讲稿生成缺失：${item.fullName}`);
      cached.set(item.fullName.toLowerCase(), { ...script, visualAssets: item.visualAssets });
      await writeJson(path.join(cacheDirectory, `${repoSlug(item.fullName)}-${cacheKey(item, timing)}.json`), script);
      await writeJson(path.join(outputDirectory, `${repoSlug(item.fullName)}.json`), script);
      console.log(`[节点 3] ${cached.size}/${facts.length} ${item.fullName} 讲稿已保存`);
      validationReport.push({ repo: item.fullName, status: "passed", issues: [] });
    }
  }
  const ordered = facts.map((item) => {
    const script = cached.get(item.fullName.toLowerCase());
    if (!script) throw new Error(`没有讲稿：${item.fullName}`);
    return script;
  });
  await Promise.all(ordered.map((script) => writeJson(path.join(outputDirectory, `${repoSlug(script.repo)}.json`), script)));
  await writeJson(path.join(outputDirectory, "index.json"), ordered);
  await writeJson(path.join(outputDirectory, "storyboard-validation.json"), {
    version: 1,
    checkedAt: new Date().toISOString(),
    passed: validationReport.every((item) => item.status === "passed"),
    checks: ["对象引用", "已出现的连线端点", "孤立对象", "voiceShare", "实际口播时长预算"],
    narrationTiming: { model: timing.model, voice: timing.voice, speed: timing.speed, pauseMs: timing.pauseMs, charactersPerSecond: timing.charactersPerSecond, targetDurationMs: TARGET_VIDEO_DURATION_MS, maximumDurationMs: MAX_VIDEO_DURATION_MS },
    projects: validationReport,
  });
  return ordered;
}
