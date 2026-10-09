import { createHash } from "node:crypto";
import path from "node:path";
import { z } from "zod";
import type { ConceptObject, ConceptStoryboard, ProjectScript, RepoFacts, StoryboardValidationIssue } from "../types";
import { config } from "../lib/config";
import { readJson, safeJson, writeJson } from "../lib/io";
import { repoSlug } from "../lib/paths";
import { requestChatCompletion, type ChatMessage } from "../lib/chat-completion";

const PROMPT_VERSION = "gh-weekly-script-v7-validated-storyboard";
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

function cacheKey(facts: RepoFacts): string {
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
  return createHash("sha256").update(JSON.stringify({ prompt: PROMPT_VERSION, service: config.openAiBaseUrl, model: config.openAiModel, facts: compact })).digest("hex");
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

function validateScriptCoverage(script: ProjectScript, source: RepoFacts): void {
  if (script.repo.toLowerCase() !== source.fullName.toLowerCase()) throw new Error(`讲稿仓库不匹配：预期 ${source.fullName}，实际 ${script.repo}`);
  if (script.rank !== source.rank) throw new Error(`讲稿名次不匹配：${source.fullName} 应为 ${source.rank}，实际 ${script.rank}`);
  const requiredScenes = ["intro", "problem", "concept", "case", "dashboard", "setup", "workflow", "requirements", "summary"];
  const scenes = script.narrationSegments.map((segment) => segment.scene);
  if (requiredScenes.some((scene, index) => scenes[index] !== scene)) throw new Error(`${source.fullName} 讲稿场景必须按固定顺序包含 ${requiredScenes.join(" → ")}`);
  const allowed = new Set(source.sources);
  if (script.sources.some((url) => !allowed.has(url))) throw new Error(`${source.fullName} 讲稿引用了未提供给 AI 的来源`);
  const text = script.narrationSegments.map((segment) => segment.text).join("");
  const charCount = [...text.replace(/\s/g, "")].length;
  if (charCount < 450 || charCount > 1_350) throw new Error(`${source.fullName} 讲稿长度为 ${charCount} 字符，预期 450–1,350；实际时长仍以 TTS 测量为准`);
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

const objectWidthByKind: Record<ConceptObject["kind"], number> = {
  problem: 24, input: 22, agent: 22, context: 28, system: 22, file: 22,
  terminal: 22, transform: 22, result: 22, note: 22,
};

/** Validate the graph before TTS/rendering so disconnected cards never reach a video. */
export function validateStoryboardLayout(storyboard: ConceptStoryboard): StoryboardValidationIssue[] {
  const issues: StoryboardValidationIssue[] = [];
  const objects = new Map<string, ConceptObject>();
  const firstBeat = new Map<string, number>();
  for (const [beatIndex, beat] of storyboard.beats.entries()) {
    for (const object of beat.objects ?? []) {
      if (!objects.has(object.id)) firstBeat.set(object.id, beatIndex);
      objects.set(object.id, object);
      const halfWidth = objectWidthByKind[object.kind] / 2;
      if (object.x - halfWidth < 4 || object.x + halfWidth > 96 || object.y < 10 || object.y > 90) {
        issues.push({ code: "out-of-bounds", beatId: beat.id, objectId: object.id, message: `${beat.id}/${object.id} 位置超出安全区域` });
      }
    }
  }
  const edges = new Set<string>();
  for (const beat of storyboard.beats) {
    const beatObjects = new Set(beat.objectIds);
    for (const id of beat.objectIds) if (!objects.has(id)) issues.push({ code: "missing-object", beatId: beat.id, objectId: id, message: `${beat.id} 引用了未定义对象 ${id}` });
    for (const connector of beat.connectors ?? []) {
      if (!objects.has(connector.from) || !objects.has(connector.to) || connector.from === connector.to) {
        issues.push({ code: "invalid-connector", beatId: beat.id, message: `${beat.id} 有无效连线 ${connector.from} → ${connector.to}` });
        continue;
      }
      if (!beatObjects.has(connector.from) || !beatObjects.has(connector.to)) {
        issues.push({ code: "missing-connector", beatId: beat.id, message: `${beat.id} 的连线两端必须同时出现在本拍 objectIds 中` });
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
  const entries = [...objects.entries()];
  for (let index = 0; index < entries.length; index++) {
    const [leftId, left] = entries[index]!;
    for (let other = index + 1; other < entries.length; other++) {
      const [rightId, right] = entries[other]!;
      const horizontal = Math.abs(left.x - right.x) < (objectWidthByKind[left.kind] + objectWidthByKind[right.kind]) / 2 + 2;
      const vertical = Math.abs(left.y - right.y) < 13;
      if (horizontal && vertical) issues.push({ code: "overlap", objectId: leftId, message: `对象 ${leftId} 与 ${rightId} 会重叠` });
    }
  }
  if (storyboard.beats.some((beat) => beat.action === "connect" || (beat.connectors?.length ?? 0) > 0) && edges.size === 0) {
    issues.push({ code: "weak-sequence", message: "故事板声称在建立关系，但没有有效连线" });
  }
  return issues;
}

function parseScripts(content: string, facts: RepoFacts[]): ProjectScript[] {
  const parsed = responseSchema.parse(safeJson(content));
  if (parsed.scripts.length !== facts.length) throw new Error(`讲稿数量错误：请求 ${facts.length} 个，返回 ${parsed.scripts.length} 个`);
  const byRepo = new Map(parsed.scripts.map((script) => [script.repo.toLowerCase(), script as ProjectScript]));
  return facts.map((source) => {
    const script = byRepo.get(source.fullName.toLowerCase());
    if (!script) throw new Error(`模型漏掉仓库 ${source.fullName}`);
    validateScriptCoverage(script, source);
    return { ...script, visualAssets: source.visualAssets };
  });
}

async function generateBatch(facts: RepoFacts[]): Promise<ProjectScript[]> {
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
    "conceptStoryboard 的 beats 必须按口播顺序讲清一个项目的核心原理。每个 beat 必须同时给出 text（这一拍要说的话）和可选 spokenText，voiceShare 是 concept 口播中该节拍所占比例，所有 voiceShare 之和应接近 1。先画输入或问题，再逐步画核心对象和关系，最后画结果；不要把所有对象一开始铺满。对象位置只提供语义参考，渲染器会自动排版；不要在同一行堆卡片。每一个新增对象都必须通过 connectors 与已经出现或本拍出现的对象建立有口播依据的关系；没有关系的装饰对象不要输出。仅使用允许的对象类型，不写 React、SVG 或其他代码，不编造资料中没有的内部机制。",
    "不要输出背景、网格、渐变、边框、装饰图案或整张图片；背景和画布由程序统一提供。你的输出只描述要画的对象、对象之间的关系和每一拍的口播。",
    "conceptStoryboard 的 title 必须概括项目原理，summary 必须是一句普通人能听懂的话。多 Agent 项目可以画 agent 和 context；编译器、转换器、数据处理项目应按输入、处理、输出选择对象。动作只表达画出、连接、圈定、转换、强调、结果或停留。",
    "口播为自然普通话，目标约 3 分钟，通常控制在 2 分 40 秒到 3 分 20 秒；不要为了凑时长重复内容。建议总长度约 900–1,300 个汉字；intro 保留‘本周 GitHub Trending 第 N 名，今天介绍 XXX’的意思。",
    "案例可以用资料支持的假设场景，但必须说清是举例；不能把官方演示截图里的示例数字写成真实用户效果。使用步骤按官方资料可复现的先后顺序写，不要编造按钮、安装命令或不支持的功能。",
    "不要写‘想试用的话’、关注、点赞、评论等营销 CTA。视频只讲解、展示案例和讲清使用方法。",
    "保留英文项目名和必要技术词，首次出现的术语用日常语言解释，不逐字念 README，不使用 Markdown、列表符号或括号里的舞台指令。",
    "数量、日期等容易被语音合成器误读时，在 spokenText 中改写为完整中文读法，并保留量词单位；text 仍保留适合屏幕阅读的阿拉伯数字。其他部分不要重复整段。",
    "字段字数与数组项数必须符合以下 JSON Schema，不能缺字段或输出超长文字：",
    JSON.stringify(z.toJSONSchema(responseSchema)),
  ].join("\n");
  const messages: ChatMessage[] = [
    { role: "system", content: system },
    { role: "user", content: JSON.stringify({ projects: facts.map(factsForPrompt) }) },
  ];
  let content = await requestChatCompletion(messages);
  try {
    return parseScripts(content, facts);
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
    try { return parseScripts(content, facts); }
    catch (repairError) {
      const reason = repairError instanceof Error ? repairError.message : String(repairError);
      throw new Error(`${facts.map((item) => item.fullName).join("、")} 讲稿修复后仍不符合要求：${reason}`);
    }
  }
}

export async function generateScripts(facts: RepoFacts[], outputDirectory: string): Promise<ProjectScript[]> {
  console.log(`[节点 3] 模型服务：${config.openAiBaseUrl}；模型：${config.openAiModel || "未配置"}；配音语速：${config.kokoroSpeed}`);
  const cacheDirectory = path.resolve(".cache", "scripts");
  const cached = new Map<string, ProjectScript>();
  const validationReport: Array<{ repo: string; status: "passed" | "failed"; issues: string[] }> = [];
  const pending: RepoFacts[] = [];
  for (const item of facts) {
    const cachePath = path.join(cacheDirectory, `${repoSlug(item.fullName)}-${cacheKey(item)}.json`);
    try {
      const script = await readJson<ProjectScript>(cachePath);
      validateScriptCoverage(script, item);
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
        generated = await generateBatch([item]);
      } catch (error) {
        validationReport.push({ repo: item.fullName, status: "failed", issues: [error instanceof Error ? error.message : String(error)] });
        await writeJson(path.join(outputDirectory, "storyboard-validation.json"), validationReport);
        throw error;
      }
      const script = generated[0];
      if (!script) throw new Error(`讲稿生成缺失：${item.fullName}`);
      cached.set(item.fullName.toLowerCase(), { ...script, visualAssets: item.visualAssets });
      await writeJson(path.join(cacheDirectory, `${repoSlug(item.fullName)}-${cacheKey(item)}.json`), script);
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
    checks: ["对象引用", "连线端点", "孤立对象", "安全坐标", "对象重叠", "voiceShare"],
    projects: validationReport,
  });
  return ordered;
}
