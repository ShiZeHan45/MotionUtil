import { createHash } from "node:crypto";
import path from "node:path";
import { z } from "zod";
import type { ProjectScript, RepoFacts } from "../types";
import { config } from "../lib/config";
import { readJson, safeJson, writeJson } from "../lib/io";
import { repoSlug } from "../lib/paths";

const PROMPT_VERSION = "gh-weekly-script-v4";
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
  };
  return createHash("sha256").update(JSON.stringify({ prompt: PROMPT_VERSION, model: config.openAiModel, facts: compact })).digest("hex");
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
    "每个项目输出 repo, rank, title, oneLineSummary, problem, features, audience, usage, narrationSegments, sources。",
    "narrationSegments 必须正好九段且顺序固定：intro、problem、concept、case、dashboard、setup、workflow、requirements、summary；每段含 scene 和 text。只有数字需要特殊口播时才额外提供 spokenText；text 用于字幕，spokenText 用于配音。",
    "面向普通短视频观众，逐步讲明白：先说排名，再说痛点和项目是什么，用一个简单类比解释，再走完一个具体案例，然后讲界面里能看到的结果、安装配置步骤、核心操作、运行条件与边界，最后只做内容总结。",
    "严格按场景放置口播：intro 只讲排名、项目名和榜单数字；problem 只讲痛点；concept 只解释项目是什么；case 才引出并展开案例。后续场景的预告或转场句必须放在对应场景里，不能提前塞进 intro；每段口播必须和该段动画画面对应。",
    "口播为自然普通话，目标约 2 分钟，最长 3 分钟。建议总长度约 800–1,100 个汉字；intro 保留‘本周 GitHub Trending 第 N 名，今天介绍 XXX’的意思。",
    "案例可以用资料支持的假设场景，但必须说清是举例；不能把官方演示截图里的示例数字写成真实用户效果。使用步骤按官方资料可复现的先后顺序写，不要编造按钮、安装命令或不支持的功能。",
    "不要写‘想试用的话’、关注、点赞、评论等营销 CTA。视频只讲解、展示案例和讲清使用方法。",
    "保留英文项目名和必要技术词，首次出现的术语用日常语言解释，不逐字念 README，不使用 Markdown、列表符号或括号里的舞台指令。",
    "数量、日期等容易被语音合成器误读时，在 spokenText 中改写为完整中文读法，并保留量词单位；text 仍保留适合屏幕阅读的阿拉伯数字。其他部分不要重复整段。",
  ].join("\n");
  const response = await fetch(`${config.openAiBaseUrl}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${config.openAiApiKey}` },
    body: JSON.stringify({
      model: config.openAiModel,
      temperature: 0.35,
      messages: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify({ projects: facts.map(factsForPrompt) }) },
      ],
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error(`讲稿模型请求失败：HTTP ${response.status}: ${(await response.text()).slice(0, 1_000)}`);
  const body = (await response.json()) as { choices?: Array<{ message?: { content?: string | null } }> };
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error("讲稿模型返回为空");
  const parsed = responseSchema.parse(safeJson(content));
  if (parsed.scripts.length !== facts.length) throw new Error(`讲稿数量错误：请求 ${facts.length} 个，返回 ${parsed.scripts.length} 个`);
  const byRepo = new Map(parsed.scripts.map((script) => [script.repo.toLowerCase(), script as ProjectScript]));
  return facts.map((source) => {
    const script = byRepo.get(source.fullName.toLowerCase());
    if (!script) throw new Error(`模型漏掉仓库 ${source.fullName}`);
    validateScriptCoverage(script, source);
    return script;
  });
}

export async function generateScripts(facts: RepoFacts[], outputDirectory: string): Promise<ProjectScript[]> {
  const cacheDirectory = path.resolve(".cache", "scripts");
  const cached = new Map<string, ProjectScript>();
  const pending: RepoFacts[] = [];
  for (const item of facts) {
    const cachePath = path.join(cacheDirectory, `${repoSlug(item.fullName)}-${cacheKey(item)}.json`);
    try {
      const script = await readJson<ProjectScript>(cachePath);
      validateScriptCoverage(script, item);
      cached.set(item.fullName.toLowerCase(), script);
    } catch {
      pending.push(item);
    }
  }
  if (pending.length) {
    console.log(`[节点 3] 为 ${pending.length} 个未缓存项目发起一次批量讲稿请求`);
    const generated = await generateBatch(pending);
    for (const [index, item] of pending.entries()) {
      const script = generated[index];
      if (!script) throw new Error(`讲稿生成缺失：${item.fullName}`);
      cached.set(item.fullName.toLowerCase(), script);
      await writeJson(path.join(cacheDirectory, `${repoSlug(item.fullName)}-${cacheKey(item)}.json`), script);
    }
  }
  const ordered = facts.map((item) => {
    const script = cached.get(item.fullName.toLowerCase());
    if (!script) throw new Error(`没有讲稿：${item.fullName}`);
    return script;
  });
  await Promise.all(ordered.map((script) => writeJson(path.join(outputDirectory, `${repoSlug(script.repo)}.json`), script)));
  await writeJson(path.join(outputDirectory, "index.json"), ordered);
  return ordered;
}
