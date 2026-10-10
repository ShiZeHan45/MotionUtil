import React from "react";
import { AbsoluteFill, Audio, Img, Loop, OffthreadVideo, Sequence, Video, cancelRender, continueRender, delayRender, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import type { ConceptBeat, ConceptConnector, ConceptObject, ConceptStoryboard, LeaderboardContext, RenderProject, TrendingRepo } from "../types";
import { leaderboardPresentation } from "../lib/leaderboard";
import { isBadgeAsset } from "../lib/visual-assets";
import { LayoutGuard, TextBlock, textLayout, textProgress, VIDEO_FONT } from "./text-layout";
import { connectorId, layoutConceptGraph, type ConceptGraphLayout, type GraphEdge, type GraphNode } from "./concept-layout";

export type VideoProps = { project: RenderProject; leaderboard: TrendingRepo[]; leaderboardContext?: LeaderboardContext; background?: string; backgroundFrames?: string[]; backgroundDurationInFrames?: number };
export const FPS = 30;
export const INTRO_PAD_MS = 300;

export function framesForMs(ms: number): number {
  return Math.max(1, Math.ceil((ms * FPS) / 1_000));
}

export function durationInFrames(project: RenderProject): number {
  return project.narrationSegments.reduce((total, segment) => total + framesForMs(segment.durationMs), 0) + framesForMs(INTRO_PAD_MS);
}

const palette = { ink: "#14344A", teal: "#168C86", tealLight: "#B7E0D7", coral: "#EF6A55", yellow: "#F7C64B", paper: "#F7F4EB", muted: "#667780" };
const VIDEO_SAFE_TOP = 64;
const CHAPTER_BAR_TOP = 112;
const sceneTitles: Record<string, string> = {
  problem: "它想解决的麻烦",
  concept: "把项目原理拆成几步",
  case: "用一个具体案例走一遍",
  dashboard: "结果如何被看见",
  setup: "从安装到首次启动",
  workflow: "步骤如何串成流程",
  requirements: "运行前要知道的事",
  summary: "把输入到结果串起来",
};

function StageBackground({ asset, frames, durationInFrames }: { asset?: string; frames?: string[]; durationInFrames?: number }) {
  const frame = useCurrentFrame();
  const sequenceFrame = frames?.length ? frames[frame % frames.length] : undefined;

  if (asset || frames?.length) {
    const staticAsset = asset ?? "";
    const isImage = /\.(?:png|jpe?g|webp|avif)$/iu.test(staticAsset);
    return <div aria-hidden="true" style={{ position: "absolute", zIndex: 0, inset: 0, overflow: "hidden", background: "#fffefa", pointerEvents: "none" }}>
      {sequenceFrame
        ? <Img src={staticFile(sequenceFrame)} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
        : isImage
        ? <Img src={staticFile(staticAsset)} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
        : durationInFrames
          ? <Loop durationInFrames={durationInFrames} layout="none"><OffthreadVideo src={staticFile(staticAsset)} muted style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} /></Loop>
          : <Video src={staticFile(staticAsset)} muted loop style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />}
      <div style={{ position: "absolute", inset: 0, background: "rgba(255,255,255,.18)" }} />
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(255,255,255,.2) 0%, rgba(255,255,255,0) 38%, rgba(255,255,255,.1) 100%)" }} />
    </div>;
  }

  return <div aria-hidden="true" style={{ position: "absolute", zIndex: 0, inset: 0, background: "#fffefa", pointerEvents: "none" }} />;
}

function splitCaption(text: string, limit = 24): string[] {
  const sentences = text.match(/[^，。；！？]+[，。；！？]?/g) ?? [text];
  const chunks: string[] = [];
  for (const sentence of sentences) {
    // Keep Latin words, paths, versions, and CLI flags intact while allowing Chinese
    // captions to wrap at any character. Otherwise a command like `npx` is split
    // across subtitle cards even though the voice reads it as one token.
    const tokens = sentence.match(/(?:\b(?:npx|npm|pnpm|yarn|bun|bunx|python3?|node|docker|git|uv|deno|cargo|go|make)\s+[A-Za-z0-9][A-Za-z0-9._:/-]*(?:\s+--?[A-Za-z0-9][A-Za-z0-9._:/-]*)*)|[A-Za-z0-9][A-Za-z0-9._:/-]*|--[A-Za-z0-9_-]+|\s+|[^\s]/giu) ?? [sentence];
    let chunk = "";
    let visibleLength = 0;
    for (const token of tokens) {
      const tokenLength = /^\s+$/u.test(token) ? 0 : Array.from(token).length;
      if (visibleLength > 0 && visibleLength + tokenLength > limit) {
        chunks.push(chunk.trim());
        chunk = "";
        visibleLength = 0;
      }
      chunk += token;
      visibleLength += tokenLength;
    }
    if (chunk.trim()) chunks.push(chunk.trim());
  }
  return chunks.filter(Boolean);
}

function Subtitle({ text, durationFrames }: { text: string; durationFrames: number }) {
  const frame = useCurrentFrame();
  const chunks = splitCaption(text);
  const totalChars = chunks.reduce((sum, chunk) => sum + Array.from(chunk).length, 0);
  const spokenPosition = Math.min(totalChars - 1, Math.floor((frame / Math.max(1, durationFrames)) * totalChars));
  let accumulated = 0;
  const activeIndex = Math.max(0, chunks.findIndex((chunk) => {
    accumulated += Array.from(chunk).length;
    return spokenPosition < accumulated;
  }));
  const chunk = chunks[activeIndex] ?? text;
  const layout = textLayout(chunk, 892, 88, 31, 28, 800);
  const chunkStart = chunks.slice(0, activeIndex).reduce((sum, value) => sum + Array.from(value).length, 0);
  const progress = (spokenPosition - chunkStart) / Math.max(1, Array.from(chunk).length - 1);
  return <div data-text-region="字幕" style={{ position: "absolute", zIndex: 45, left: 68, right: 68, bottom: 104, minHeight: 82, boxSizing: "border-box", borderRadius: 22, border: "2px solid rgba(255,255,255,.6)", background: "rgba(22, 31, 40, .9)", color: "white", padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", fontWeight: 800, boxShadow: "0 12px 26px rgba(20,30,40,.2)" }}><TextBlock key={chunk} layout={layout} name="字幕正文" progress={progress} /></div>;
}

function CodeMascot() {
  return <svg viewBox="0 0 280 320" width="238" height="272" role="img" aria-label="友好的 AI 项目讲解员" style={{ filter: "drop-shadow(0 10px 0 rgba(20,52,74,.12))" }}>
    <g stroke={palette.ink} strokeWidth="9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M79 214 Q42 209 38 170 M202 213 Q239 203 244 165" fill="none" strokeWidth="17" />
      <circle cx="37" cy="163" r="17" fill={palette.yellow} />
      <circle cx="245" cy="158" r="17" fill={palette.coral} />
      <rect x="57" y="95" width="166" height="150" rx="53" fill="#D9F1EB" />
      <path d="M140 94 V58" fill="none" strokeWidth="10" />
      <circle cx="140" cy="47" r="15" fill={palette.yellow} />
      <rect x="77" y="119" width="126" height="84" rx="35" fill="#FFFDF6" strokeWidth="7" />
      <ellipse cx="116" cy="154" rx="9" ry="12" fill={palette.ink} stroke="none" />
      <ellipse cx="165" cy="154" rx="9" ry="12" fill={palette.ink} stroke="none" />
      <path d="M119 177 Q141 195 164 177" fill="none" strokeWidth="7" />
      <path d="M102 245 L88 278 Q85 289 98 292 L184 292 Q197 289 192 278 L178 245" fill={palette.teal} />
      <rect x="115" y="254" width="50" height="25" rx="12" fill={palette.yellow} strokeWidth="5" />
    </g>
    <path d="M228 88 L236 69 L244 88 L263 96 L244 104 L236 123 L228 104 L209 96 Z" fill={palette.coral} stroke={palette.ink} strokeWidth="5" strokeLinejoin="round" />
  </svg>;
}

function DiagramIcon({ kind }: { kind: "input" | "process" | "result" }) {
  const common = { fill: "none", stroke: palette.ink, strokeWidth: 7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (kind === "input") return <svg viewBox="0 0 100 100" width="84" height="84"><path {...common} d="M23 31h54v48H23z M34 20h54v48 M39 47h23 M39 59h35" /><circle cx="31" cy="79" r="10" fill={palette.coral} stroke={palette.ink} strokeWidth="5" /></svg>;
  if (kind === "process") return <svg viewBox="0 0 100 100" width="84" height="84"><rect {...common} x="19" y="20" width="62" height="62" rx="14" fill={palette.tealLight} /><path {...common} d="M50 32v14l12 8 M13 37l10 4 M77 63l10 4 M41 11l4 10 M60 79l4 10" /><circle cx="50" cy="53" r="21" fill="white" stroke={palette.ink} strokeWidth="6" /></svg>;
  return <svg viewBox="0 0 100 100" width="84" height="84"><path {...common} d="M19 77h62 M29 68V47h14v21 M54 68V29h14v39 M76 68V17h11v51" /><path d="M20 29L34 17L46 28" fill="none" stroke={palette.coral} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function SceneDiagram({ project, scene, top, durationFrames }: { project: RenderProject; scene: string; top: number; durationFrames: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const panelIn = spring({ frame: frame - 8, fps, config: { damping: 19, mass: 0.8 } });
  const kinds = ["input", "process", "result"] as const;
  const flow = project.exampleFlow ?? [];
  const steps = project.usageSteps ?? [];
  const requirements = project.requirements ?? [];
  const limitations = project.limitations ?? [];
  const stages = scene === "concept"
    ? [
        { label: "共同目标", detail: project.exampleScenario, kind: kinds[0] },
        { label: "AI 团队", detail: project.oneLineSummary, kind: kinds[1] },
        { label: "可追踪任务", detail: project.features[0] ?? project.usage, kind: kinds[2] },
      ]
    : scene === "case"
      ? [
          { label: "目标", detail: project.exampleScenario, kind: kinds[0] },
          { label: "协作", detail: flow.slice(0, 2).join("；") || project.features[0] || project.usage, kind: kinds[1] },
          { label: "结果", detail: project.exampleResult, kind: kinds[2] },
        ]
        : scene === "workflow"
        ? [
            { label: "步骤 1", detail: steps[0] ?? project.usage, kind: kinds[0] },
            { label: "步骤 2", detail: steps[1] ?? flow[0] ?? project.features[0] ?? project.usage, kind: kinds[1] },
            { label: "步骤 3", detail: steps[2] ?? project.exampleResult, kind: kinds[2] },
          ]
        : scene === "requirements"
          ? [
              { label: "运行条件", detail: requirements.join(" · ") || "按项目文档准备运行环境", kind: kinds[0] },
              { label: "使用边界", detail: limitations[0] ?? "实际效果取决于项目配置", kind: kinds[1] },
              { label: "适合场景", detail: project.audience || project.usage, kind: kinds[2] },
            ]
          : scene === "summary"
            ? [
                { label: "问题", detail: project.problem || project.exampleScenario, kind: kinds[0] },
                { label: "能力", detail: project.features.join(" · ") || project.oneLineSummary, kind: kinds[1] },
                { label: "结果", detail: project.exampleResult || project.oneLineSummary, kind: kinds[2] },
              ]
            : [
                { label: "输入", detail: project.problem || project.exampleScenario, kind: kinds[0] },
                { label: "处理", detail: flow[0] ?? project.features[0] ?? project.usage, kind: kinds[1] },
                { label: "输出", detail: project.exampleResult || project.oneLineSummary, kind: kinds[2] },
              ];
  const maxCardHeight = Math.min(530, 1645 - top - 140);
  const cards = stages.map((stage) => ({ ...stage, labelLayout: textLayout(stage.label, 214, 72, 26, 24, 900), detailLayout: textLayout(stage.detail, 214, maxCardHeight - 200, 24, 22, 650) }));
  const cardHeight = Math.max(...cards.map((card) => 130 + card.labelLayout.height + card.detailLayout.height));
  return <div data-text-region={`${scene} 示意图`} style={{ position: "absolute", left: 74, right: 74, top, height: cardHeight + 140, borderRadius: 34, border: `3px solid rgba(20,52,74,.5)`, background: "rgba(255,255,255,.86)", boxShadow: "0 12px 0 rgba(20,52,74,.1)", padding: "28px 28px", boxSizing: "border-box", opacity: panelIn, transform: `translateY(${(1 - panelIn) * 36}px) scale(${0.98 + panelIn * 0.02})` }}>
    <div style={{ fontSize: 22, color: palette.teal, fontWeight: 950, letterSpacing: 2 }}>项目示意图 · 依据项目资料整理</div>
    <div style={{ position: "absolute", top: 100, left: 24, right: 24, display: "flex", alignItems: "stretch", justifyContent: "space-between", gap: 4 }}>
      {cards.map((stage, index) => {
        const cardIn = spring({ frame: frame - 12 - index * 8, fps, config: { damping: 16, mass: 0.65 } });
        const arrowOpacity = interpolate(frame, [18 + index * 8, 28 + index * 8], [0, 1], { extrapolateRight: "clamp" });
        return <React.Fragment key={stage.label}>
        <div data-text-region={`${scene} 示意卡片 ${index + 1}`} style={{ width: 244, height: cardHeight, flexShrink: 0, border: `3px solid ${index === 1 ? palette.teal : palette.ink}`, borderRadius: 24, background: index === 1 ? "#E5F4EF" : "#FCFBF6", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "16px 12px", boxSizing: "border-box", textAlign: "center", opacity: cardIn, transform: `translateY(${(1 - cardIn) * 32}px) scale(${0.94 + cardIn * 0.06})` }}>
          <DiagramIcon kind={stage.kind} />
          <TextBlock layout={stage.labelLayout} name={`${scene} 示意标题 ${index + 1}`} style={{ marginTop: 8, color: palette.ink, fontWeight: 900 }} />
          <TextBlock layout={stage.detailLayout} name={`${scene} 示意正文 ${index + 1}`} progress={textProgress(frame, durationFrames, 0.08)} style={{ marginTop: 6, color: palette.muted, fontWeight: 650 }} />
        </div>
        {index < stages.length - 1 && <div style={{ alignSelf: "center", color: palette.coral, fontSize: 38, fontWeight: 950, opacity: arrowOpacity, transform: `translateX(${(1 - arrowOpacity) * -8}px)` }}>➜</div>}
      </React.Fragment>;
      })}
    </div>
    <div style={{ position: "absolute", right: 12, bottom: 3, width: 185, height: 65, borderRadius: "50%", background: "rgba(22,140,134,.12)" }} />
  </div>;
}

function RankCard({ repo, selected, scanning, index, durationFrames, context }: { repo: TrendingRepo; selected: boolean; scanning: boolean; index: number; durationFrames: number; context?: LeaderboardContext }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entrance = spring({ frame: frame - index * 3, fps, config: { damping: 18, mass: 0.7 } });
  const lift = selected ? interpolate(frame, [fps * 0.7, fps * 1.8], [0, -3], { extrapolateRight: "clamp" }) : 0;
  const formatStars = (stars: number | null) => stars === null ? "—" : new Intl.NumberFormat("en-US").format(stars);
  const starHistory = context?.source === "star-history";
  const primaryStars = starHistory ? repo.starsThisWeek : repo.totalStars;
  const nameLayout = textLayout(repo.fullName, 380, 82, 32, 28, 850);
  const descriptionLayout = textLayout(repo.description || leaderboardPresentation(context).name, 380, 62, 23, 22, 650);
  return <div data-text-region={`榜单 ${repo.rank}`} style={{ transform: `translateY(${(1 - entrance) * 48 + lift}px) scale(${selected || scanning ? 1.01 : 1})`, opacity: entrance * (selected || scanning || frame < fps * 1.2 ? 1 : 0.55), width: 800, height: 190, marginBottom: 14, padding: "15px 24px", boxSizing: "border-box", display: "flex", alignItems: "center", gap: 16, border: `4px solid ${selected ? palette.teal : scanning ? palette.coral : palette.ink}`, borderRadius: 26, background: selected ? "#fffef9" : scanning ? "#fff8eb" : "rgba(255,255,255,.75)", boxShadow: selected ? "0 8px 0 rgba(22,140,134,.16)" : "0 7px 0 rgba(20,52,74,.08)" }}>
    <div style={{ flex: "0 0 auto", width: 64, height: 64, borderRadius: "50%", display: "grid", placeItems: "center", color: "white", background: selected ? palette.coral : scanning ? palette.teal : palette.ink, fontSize: repo.rank >= 10 ? 27 : 34, fontWeight: 900 }}>#{repo.rank}</div>
      <div style={{ minWidth: 0, flex: 1 }}>
      <TextBlock layout={nameLayout} name={`榜单仓库名 ${repo.rank}`} progress={textProgress(frame, durationFrames)} style={{ fontWeight: 850, color: palette.ink }} />
      <TextBlock layout={descriptionLayout} name={`榜单说明 ${repo.rank}`} progress={textProgress(frame, durationFrames)} style={{ marginTop: 7, color: palette.muted }} />
    </div>
    <div style={{ flex: "0 0 180px", textAlign: "right" }}>
      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 5, fontSize: 24, lineHeight: 1.15, fontWeight: 950, color: palette.ink }}>
        <span style={{ color: starHistory ? palette.teal : palette.yellow, fontSize: 28 }}>{starHistory ? "↗" : "★"}</span>{formatStars(primaryStars)}
      </div>
      {starHistory ? <div style={{ marginTop: 7, color: palette.teal, fontSize: 17, lineHeight: 1.1, fontWeight: 850 }}>{leaderboardPresentation(context).metricLabel} Stars</div>
        : repo.starsThisWeek !== null && <div style={{ marginTop: 7, color: palette.teal, fontSize: 17, lineHeight: 1.1, fontWeight: 850 }}>↗ {formatStars(repo.starsThisWeek)}<br />{leaderboardPresentation(context).metricLabel}</div>}
      {selected && <div style={{ marginTop: 10, color: palette.teal, fontSize: 20, fontWeight: 900 }}>本期介绍</div>}
    </div>
  </div>;
}

function LeaderboardScene({ project, leaderboard, caption, durationFrames, context }: { project: RenderProject; leaderboard: TrendingRepo[]; caption: string; durationFrames: number; context?: LeaderboardContext }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pulse = 1 + Math.sin(frame / 8) * 0.025;
  const presentation = leaderboardPresentation(context);
  // Keep each rank readable: page a longer list and finish on the featured project.
  const pages = Math.max(1, Math.ceil(leaderboard.length / 5));
  const selectedPage = Math.max(0, Math.floor(leaderboard.findIndex((repo) => repo.rank === project.rank) / 5));
  const pageDuration = Math.max(fps, Math.floor(durationFrames * 0.6 / pages));
  const page = frame < durationFrames * 0.6 ? Math.min(pages - 1, Math.floor(frame / pageDuration)) : selectedPage;
  const visibleRepos = leaderboard.slice(page * 5, (page + 1) * 5);
  const locked = frame >= fps * 1.5;
  const scanRank = visibleRepos[Math.min(visibleRepos.length - 1, Math.floor((frame % pageDuration) / Math.max(1, fps * 0.24)))]?.rank;
  const selected = leaderboard.find((repo) => repo.rank === project.rank) ?? { rank: project.rank, fullName: project.repo, description: project.oneLineSummary, owner: project.repo.split("/")[0] ?? "", name: project.repo.split("/")[1] ?? "", url: "", language: null, totalStars: null, starsThisWeek: null };
  return <AbsoluteFill style={{ color: palette.ink }}>
    <div style={{ position: "absolute", top: 180, left: 0, right: 0, textAlign: "center" }}>
      <div style={{ fontSize: 26, color: palette.teal, fontWeight: 900 }}>{presentation.name}</div>
      <div style={{ marginTop: 22, fontSize: 66, fontWeight: 950 }}>{presentation.title}</div>
      <div style={{ marginTop: 10, fontSize: 26, color: palette.muted }}>{presentation.dateLabel || "关注值得了解的开源项目"}</div>
    </div>
    <div style={{ position: "absolute", top: 480, left: 140, right: 140, display: "flex", flexDirection: "column", alignItems: "center", transform: `scale(${pulse})`, transformOrigin: "center top" }}>
      {visibleRepos.map((repo, index) => <RankCard key={repo.fullName} repo={repo} selected={locked && repo.rank === project.rank} scanning={!locked && repo.rank === scanRank} index={index} durationFrames={durationFrames} context={context} />)}
    </div>
    <div style={{ position: "absolute", bottom: 265, left: 76, right: 76, textAlign: "center", color: palette.ink, fontWeight: 800 }}><TextBlock layout={textLayout(`今天介绍：${selected.fullName}`, 928, 84, 30, 28, 800)} name="本期仓库名" progress={textProgress(frame, durationFrames)} /></div>
    <div style={{ position: "absolute", top: 1450, left: 54, transformOrigin: "top left", transform: `translateY(${Math.sin(frame / 14) * 5}px) scale(.6)` }}><CodeMascot /></div>
    <Subtitle text={caption} durationFrames={durationFrames} />
  </AbsoluteFill>;
}

function EvidencePanel({ project, assetId, top, durationFrames }: { project: RenderProject; assetId: string; top: number; durationFrames: number }) {
  const asset = project.visualAssets?.find((item) => item.id === assetId);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (!asset) return null;
  const entrance = spring({ frame: frame - 8, fps, config: { damping: 20, mass: 0.8 } });
  const labelLayout = textLayout(asset.label, 778, 84, 23, 22, 900);
  const headerHeight = labelLayout.height + 24;
  const height = Math.min(770, 1630 - top);
  return <div data-text-region="项目资料" style={{ position: "absolute", top, left: 56, right: 56, height, borderRadius: 30, overflow: "hidden", border: `4px solid ${palette.ink}`, background: "#111820", boxShadow: "0 14px 0 rgba(20,52,74,.18)", opacity: entrance, transform: `translateY(${(1 - entrance) * 30}px)` }}>
    <div style={{ height: headerHeight, padding: "0 22px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, color: "white", background: palette.ink, fontWeight: 900 }}>
      <TextBlock layout={labelLayout} name="素材说明" progress={textProgress(frame, durationFrames)} /><span style={{ flex: "0 0 auto", borderRadius: 99, padding: "5px 12px", color: "#173A50", background: "#D9F1EB", fontSize: 17 }}>项目资料</span>
    </div>
    <div style={{ height: height - headerHeight - 50, display: "grid", placeItems: "center", background: "#111820" }}>
      <Img src={staticFile(asset.path)} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
    </div>
    <div style={{ position: "absolute", left: 18, right: 18, bottom: 10, color: "#CAD8DE", fontSize: 15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", overflowWrap: "anywhere" }}>来源：{asset.sourceUrl} · 资料页中的示例内容，仅用于说明界面</div>
  </div>;
}

function StoryNode({ width, height, label, detail, color, visible, icon, progress, name }: {
  width: number; height: number; label: string; detail: string; color: string;
  visible: number; icon: string; progress: number; name: string;
}) {
  const labelLayout = textLayout(label, width - 80, 34, 23, 22, 950);
  const detailLayout = textLayout(detail, width - 38, height - 80, 24, 22, 700);
  return <div data-text-region={name} style={{ width, height, boxSizing: "border-box", padding: 16, border: `3px solid ${palette.ink}`, borderRadius: 24, background: "#fffef9", boxShadow: `0 8px 0 ${color}55`, opacity: visible, transform: `translateY(${(1 - visible) * 18}px) scale(${0.96 + visible * 0.04})` }}>
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ width: 30, height: 30, flexShrink: 0, borderRadius: 9, display: "grid", placeItems: "center", background: color, color: "white", fontSize: 20, fontWeight: 950 }}>{icon}</div>
      <TextBlock layout={labelLayout} name={`${name} 标题`} progress={progress} style={{ color: palette.ink, fontWeight: 950 }} />
    </div>
    <TextBlock layout={detailLayout} name={`${name} 正文`} progress={progress} style={{ marginTop: 10, color: palette.muted, fontWeight: 700 }} />
  </div>;
}

const conceptColors = [palette.coral, palette.teal, palette.yellow];

function fallbackConceptStoryboard(project: RenderProject): ConceptStoryboard {
  const isInterop = /(?:ps5|编译|转换|重链接|shader|着色器|格式|兼容|运行库|库)/iu.test(`${project.title} ${project.oneLineSummary} ${project.features.join(" ")}`);
  const objects: ConceptObject[] = isInterop
    ? [
        { id: "input", kind: "input", label: "目标程序", detail: "PS5 可执行文件", x: 17, y: 42 },
        { id: "transform", kind: "transform", label: "转换层", detail: "重链接器与重编译器", x: 50, y: 42 },
        { id: "system", kind: "system", label: "目标环境", detail: "Linux / Windows", x: 83, y: 30 },
        { id: "context", kind: "context", label: "系统库与图形接口", detail: "PRX 库 · Vulkan / SPIR-V", x: 83, y: 65 },
        { id: "result", kind: "result", label: "可验证结果", detail: "运行状态与兼容性列表", x: 50, y: 80 },
      ]
    : [
        { id: "problem", kind: "problem", label: "现实问题", detail: project.problem, x: 18, y: 42 },
        { id: "input", kind: "input", label: "输入", detail: project.exampleScenario, x: 18, y: 68 },
        { id: "transform", kind: "transform", label: "核心处理", detail: project.features[0] ?? project.oneLineSummary, x: 50, y: 42 },
        { id: "context", kind: "context", label: "关键能力", detail: project.features.slice(1, 3).join(" · ") || project.usage, x: 82, y: 42 },
        { id: "result", kind: "result", label: "结果", detail: project.exampleResult, x: 82, y: 72 },
      ];
  const beats: ConceptBeat[] = [
    { id: "beat-1", cue: "先看输入和要解决的问题", text: isInterop ? "先把目标程序放进来，问题是它原本依赖的运行环境不同。" : `先看这个项目要处理的输入：${project.exampleScenario || project.problem}`, action: "draw", voiceShare: 0.2, objectIds: isInterop ? ["input"] : ["problem", "input"], objects, focusIds: isInterop ? ["input"] : ["problem"] },
    { id: "beat-2", cue: "再画出项目真正做的转换或处理", text: `接着由${project.title || project.repo}完成核心处理：${project.features[0] ?? project.oneLineSummary}`, action: "transform", voiceShare: 0.24, objectIds: ["transform"], objects, connectors: [{ from: "input", to: "transform", label: "送入处理" }], focusIds: ["transform"] },
    { id: "beat-3", cue: "补上它依赖的关键对象", text: `这一步还要调用关键能力：${project.features.slice(1, 3).join("、") || project.usage}`, action: "group", voiceShare: 0.2, objectIds: isInterop ? ["system", "context"] : ["context"], objects, connectors: [{ from: "context", to: "transform", label: "提供能力" }], focusIds: ["context"] },
    { id: "beat-4", cue: "最后落到可以验证的结果", text: `最后得到可以检查的结果：${project.exampleResult || project.oneLineSummary}`, action: "result", voiceShare: 0.22, objectIds: ["result"], objects, connectors: [{ from: "transform", to: "result", label: "输出" }], focusIds: ["result"] },
    { id: "beat-5", cue: "把整条原理链路收束起来", text: "把输入、处理、依赖和结果连起来，就能看懂这个项目如何把问题变成可验证的结果。", action: "hold", voiceShare: 0.14, objectIds: objects.map((object) => object.id), objects, connectors: [{ from: "result", to: isInterop ? "system" : "context", label: "回到实际环境" }] },
  ];
  return { version: 1, title: `${project.title || project.repo} 的工作原理`, summary: project.oneLineSummary, beats };
}

function conceptObjectWidth(object: ConceptObject): number {
  return object.kind === "context" ? 235 : object.kind === "problem" ? 205 : 195;
}

function conceptCardLayout(object: ConceptObject) {
  const isContext = object.kind === "context";
  const width = conceptObjectWidth(object);
  const contentWidth = width - 2 * 16 - 2 * (isContext ? 4 : 3);
  const detail = object.detail ? textLayout(object.detail, contentWidth, 126, 20, 18, 700) : null;
  const label = textLayout(object.label, contentWidth, 58, 24, 21, 900);
  const cardHeight = Math.max(isContext ? 170 : 132, label.height + (detail?.height ?? 0) + (detail ? 55 : 32));
  return { width, detail, label, cardHeight };
}

function ConceptObjectCard({ object, position, active, focus, beatProgress }: { object: ConceptObject; position: GraphNode; active: boolean; focus: boolean; beatProgress: number }) {
  const color = object.kind === "problem" ? palette.coral : object.kind === "result" ? palette.teal : object.kind === "context" ? palette.yellow : palette.ink;
  const isContext = object.kind === "context";
  const x = position.x + position.width / 2;
  const y = position.y + position.height / 2;
  const { width, detail, label, cardHeight } = conceptCardLayout(object);
  return <div data-concept-card={object.id} data-text-region={`原理对象 ${object.id}`} style={{ position: "absolute", left: x, top: y, width, height: cardHeight, transform: `translate(-50%, -50%) scale(${0.94 + (active ? beatProgress : 1) * 0.06})`, opacity: active ? beatProgress : 1, boxSizing: "border-box", padding: 16, border: `${isContext ? 4 : 3}px ${isContext ? "dashed" : "solid"} ${color}`, borderRadius: isContext ? 46 : 24, background: isContext ? "rgba(247,198,75,.13)" : "#fffef9", boxShadow: focus ? `0 0 0 8px ${color}33, 0 9px 0 ${color}55` : `0 8px 0 ${color}33`, textAlign: "center", zIndex: 3 }}>
    <TextBlock layout={label} name={`原理对象 ${object.id} 标题`} progress={active ? beatProgress : 1} style={{ color: palette.ink, fontWeight: 950 }} />
    {detail && <TextBlock layout={detail} name={`原理对象 ${object.id} 说明`} progress={active ? beatProgress : 1} style={{ marginTop: 7, color: palette.muted, fontWeight: 700 }} />}
  </div>;
}

function conceptRoute(edge: GraphEdge) {
  const bridges = (edge.bridges ?? []).map((bridge, index) => {
    const direction = Math.sign(edge.points[bridge.segmentIndex + 1]!.x - edge.points[bridge.segmentIndex]!.x);
    const startX = bridge.point.x - direction * bridge.radius;
    const endX = bridge.point.x + direction * bridge.radius;
    return { ...bridge, startX, endX, arc: `A ${bridge.radius} ${bridge.radius} 0 0 ${direction > 0 ? 1 : 0} ${endX} ${bridge.point.y}`,
      startDistance: bridge.distance - bridge.radius + index * (Math.PI - 2) * bridge.radius };
  });
  let path = `M ${edge.points[0]!.x} ${edge.points[0]!.y}`;
  for (let index = 0; index < edge.points.length - 1; index++) {
    for (const bridge of bridges.filter((bridge) => bridge.segmentIndex === index)) path += ` L ${bridge.startX} ${bridge.point.y} ${bridge.arc}`;
    const end = edge.points[index + 1]!;
    path += ` L ${end.x} ${end.y}`;
  }
  return { path, bridges, length: edge.length + bridges.reduce((sum, bridge) => sum + (Math.PI - 2) * bridge.radius, 0) };
}

function ConceptConnector({ connector, edge, visible, width, height }: { connector: ConceptConnector; edge: GraphEdge; visible: number; width: number; height: number }) {
  const { path } = conceptRoute(edge);
  const markerId = `arrow-${connector.from}-${connector.to}`.replace(/[^a-z0-9-]/giu, "-");
  const labelLayout = connector.label ? conceptConnectorLabel(connector.label) : null;
  return <div data-concept-connector={edge.id} data-connector-from={connector.from} data-connector-to={connector.to} data-connector-length={edge.length} style={{ position: "absolute", inset: 0, opacity: visible, pointerEvents: "none" }}>
    <svg width={width} height={height} style={{ position: "absolute", inset: 0, overflow: "visible", zIndex: 1 }}>
      <defs><marker id={markerId} viewBox="0 0 14 14" refX="14" refY="7" markerWidth="14" markerHeight="14" markerUnits="userSpaceOnUse" orient="auto"><path d="M 0 0 L 14 7 L 0 14 Z" fill={palette.coral} /></marker></defs>
      <path data-connector-path data-route-points={JSON.stringify(edge.points)} d={path} fill="none" stroke={palette.coral} strokeWidth={4} strokeLinejoin="round" strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - visible} />
      {visible > 0.9 && <path d={path} fill="none" stroke="transparent" strokeWidth={0} markerEnd={`url(#${markerId})`} />}
    </svg>
    {labelLayout && edge.label && <div data-connector-label={edge.id} data-text-region={`连线标签 ${edge.id}`} style={{ position: "absolute", left: edge.label.x, top: edge.label.y, width: edge.label.width, height: edge.label.height, boxSizing: "border-box", padding: "3px 8px", borderRadius: 5, background: "#fffef9", color: palette.coral, fontWeight: 850, zIndex: 4 }}>
      <TextBlock layout={labelLayout} name={`连线标签 ${edge.id}`} style={{ textAlign: "center" }} />
    </div>}
  </div>;
}

function ConceptCrossingBridges({ edges, width, height }: { edges: Array<{ edge: GraphEdge; visible: number }>; width: number; height: number }) {
  // Draw crossings above every route so an intersection cannot look like a junction.
  return <svg width={width} height={height} style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 2 }}>
    {edges.flatMap(({ edge, visible }) => {
      const route = conceptRoute(edge);
      return route.bridges.map((bridge, index) => {
        const progress = Math.max(0, Math.min(1, (visible * route.length - bridge.startDistance) / (Math.PI * bridge.radius)));
        if (progress === 0) return null;
        const path = `M ${bridge.startX} ${bridge.point.y} ${bridge.arc}`;
        return <g key={`${edge.id}-${index}`} opacity={visible}>
          <path d={path} fill="none" stroke="#fff" strokeWidth={10} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - progress} />
          <path d={path} fill="none" stroke={palette.coral} strokeWidth={4} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - progress} />
        </g>;
      });
    })}
  </svg>;
}

function conceptConnectorLabel(text: string) {
  const width = Math.min(126, Math.max(40, Array.from(text).reduce((sum, char) => sum + (/[^\x00-\x7F]/u.test(char) ? 16 : 11), 0) + 4));
  return textLayout(text, width, 1000, 16, 16, 850);
}

function ConceptStoryboardScene({ project, caption, durationFrames, beatId }: { project: RenderProject; caption: string; durationFrames: number; beatId?: string }) {
  const frame = useCurrentFrame();
  const t = textProgress(frame, durationFrames);
  const storyboard = React.useMemo(() => project.conceptStoryboard ?? fallbackConceptStoryboard(project), [project]);
  const objects = React.useMemo(() => {
    const result = new Map<string, ConceptObject>();
    for (const beat of storyboard.beats) for (const object of beat.objects ?? []) result.set(object.id, object);
    return result;
  }, [storyboard]);
  const selectedBeat = beatId ? storyboard.beats.findIndex((beat) => beat.id === beatId) : -1;
  const beatPosition = t * storyboard.beats.length;
  const activeIndex = selectedBeat >= 0 ? selectedBeat : Math.max(0, Math.min(storyboard.beats.length - 1, Math.floor(beatPosition)));
  const beatProgress = selectedBeat >= 0 ? t : Math.max(0, Math.min(1, beatPosition - activeIndex));
  const seen = new Set(storyboard.beats.slice(0, activeIndex + 1).flatMap((beat) => beat.objectIds));
  const connectors = storyboard.beats.slice(0, activeIndex + 1).flatMap((beat, index) => (beat.connectors ?? []).map((connector) => ({ connector, visible: index === activeIndex ? beatProgress : 1 })));
  const allConnectors = React.useMemo(() => storyboard.beats.flatMap((beat) => beat.connectors ?? []), [storyboard]);
  const current = storyboard.beats[activeIndex];
  const title = textLayout(`${project.title || project.repo}：${storyboard.title}`, 936, 138, 44, 34, 950);
  const panelTop = 234 + 32 + 15 + title.height + 28;
  const panelHeight = 1650 - panelTop;
  const canvasWidth = 1080 - 58 * 2 - 3 * 2 - 28 * 2;
  const canvasHeight = panelHeight - 118;
  const graph = React.useMemo(() => ({
    nodes: [...objects.values()].map((object) => ({ id: object.id, width: conceptCardLayout(object).width, height: conceptCardLayout(object).cardHeight })),
    edges: allConnectors.map((connector) => {
      const label = connector.label ? conceptConnectorLabel(connector.label) : null;
      return { ...connector, labelWidth: label ? label.width + 16 : undefined, labelHeight: label ? label.height + 6 : undefined };
    }),
  }), [objects, allConnectors]);
  const [layout, setLayout] = React.useState<ConceptGraphLayout | null>(null);
  const handle = React.useMemo(() => delayRender("原理图自动排版与避让验收"), [graph, canvasWidth, canvasHeight]);
  React.useEffect(() => {
    let active = true;
    layoutConceptGraph(graph.nodes, graph.edges, canvasWidth, canvasHeight).then((result) => {
      if (active) { setLayout(result); continueRender(handle); }
    }).catch((error) => { if (active) cancelRender(error); });
    return () => { active = false; continueRender(handle); };
  }, [graph, canvasWidth, canvasHeight, handle]);
  return <AbsoluteFill style={{ color: palette.ink }}>
    <div style={{ position: "absolute", top: 174, left: 70, display: "flex", gap: 10, fontSize: 20, fontWeight: 900 }}><span style={{ borderRadius: 99, padding: "8px 14px", background: palette.teal, color: "white" }}>#{project.rank}</span><span style={{ borderRadius: 99, padding: "8px 14px", background: "white" }}>原理动画</span></div>
    <div style={{ position: "absolute", top: 234, left: 72, right: 72 }}><div style={{ fontSize: 24, letterSpacing: 3, color: palette.teal, fontWeight: 950 }}>第二步 · 先理解原理</div><TextBlock layout={title} name="原理故事板标题" progress={t} style={{ marginTop: 15, fontWeight: 950 }} /></div>
    <div data-text-region="原理故事板画布" style={{ position: "absolute", left: 58, right: 58, top: panelTop, height: panelHeight, boxSizing: "border-box", padding: 28, border: `3px solid ${palette.ink}`, borderRadius: 34, background: "rgba(255,255,255,.82)", boxShadow: "0 14px 0 rgba(20,52,74,.11)" }}>
      <div style={{ height: 46, display: "flex", alignItems: "center", justifyContent: "space-between", color: palette.teal, fontSize: 19, fontWeight: 950 }}><span>{storyboard.summary}</span><span style={{ color: palette.muted, fontSize: 16 }}>{activeIndex + 1} / {storyboard.beats.length}</span></div>
      <div style={{ height: 4, margin: "8px 0 10px", background: "rgba(20,52,74,.12)", borderRadius: 5 }}><div style={{ width: `${t * 100}%`, height: "100%", background: `linear-gradient(90deg, ${palette.coral}, ${palette.teal})`, borderRadius: 5 }} /></div>
      <div data-text-region="原理画布安全区" style={{ position: "relative", height: canvasHeight, overflow: "hidden", borderRadius: 22, background: "transparent" }}>
        {layout && <div data-concept-canvas style={{ position: "absolute", left: layout.offsetX, top: layout.offsetY, width: layout.width, height: layout.height, transform: `scale(${layout.scale})`, transformOrigin: "top left" }}>
        <LayoutGuard>
        {connectors.map(({ connector, visible }) => <ConceptConnector key={connectorId(connector)} connector={connector} edge={layout.edges[connectorId(connector)]!} visible={visible} width={layout.width} height={layout.height} />)}
        <ConceptCrossingBridges edges={connectors.map(({ connector, visible }) => ({ edge: layout.edges[connectorId(connector)]!, visible }))} width={layout.width} height={layout.height} />
        {[...objects.values()].filter((object) => seen.has(object.id)).map((object) => {
          const beatIndex = storyboard.beats.findIndex((beat) => beat.objectIds.includes(object.id));
          const isCurrent = beatIndex === activeIndex;
          const focus = Boolean(current?.focusIds?.includes(object.id));
          return <ConceptObjectCard key={object.id} object={object} position={layout.nodes[object.id]!} active focus={focus} beatProgress={isCurrent ? beatProgress : 1} />;
        })}
        </LayoutGuard>
        </div>}
      </div>
    </div>
    <Subtitle text={caption} durationFrames={durationFrames} />
  </AbsoluteFill>;
}

function ConceptWalkthrough({ project, caption, durationFrames }: { project: RenderProject; caption: string; durationFrames: number }) {
  const frame = useCurrentFrame();
  const t = textProgress(frame, durationFrames);
  const reveal = (start: number, end: number) => interpolate(t, [start, end], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const goal = reveal(0.03, 0.16);
  const roles = reveal(0.18, 0.37);
  const tasks = reveal(0.39, 0.59);
  const governance = reveal(0.61, 0.79);
  const result = reveal(0.81, 0.98);
  const title = textLayout(`${project.title || project.repo} 怎样把问题变成结果？`, 936, 138, 48, 36, 950);
  const panelTop = 234 + 32 + 15 + title.height + 28;
  const panelHeight = 1650 - panelTop;
  const available = panelHeight - 60 - 56 - 3 * 20;
  const moduleHeight = Math.floor(available * .37);
  const taskHeight = Math.floor(available * .25);
  const governanceHeight = Math.floor(available * .18);
  const resultHeight = available - moduleHeight - taskHeight - governanceHeight;
  const modules = (project.features.length ? project.features : [project.usage, project.oneLineSummary]).slice(0, 3);
  const steps = (project.exampleFlow.length ? project.exampleFlow : project.usageSteps).slice(0, 3);
  return <AbsoluteFill style={{ color: palette.ink }}>
    <div style={{ position: "absolute", top: 174, left: 70, display: "flex", gap: 10, fontSize: 20, fontWeight: 900 }}><span style={{ borderRadius: 99, padding: "8px 14px", background: palette.teal, color: "white" }}>#{project.rank}</span><span style={{ borderRadius: 99, padding: "8px 14px", background: "white" }}>原理动画</span></div>
    <div style={{ position: "absolute", top: 234, left: 72, right: 72 }}>
      <div style={{ fontSize: 24, letterSpacing: 3, color: palette.teal, fontWeight: 950 }}>第二步 · 先理解原理</div>
      <TextBlock layout={title} name="原理标题" progress={t} style={{ marginTop: 15, fontWeight: 950 }} />
    </div>
    <div data-text-region="原理面板" style={{ position: "absolute", left: 58, right: 58, top: panelTop, height: panelHeight, boxSizing: "border-box", padding: 28, border: `3px solid ${palette.ink}`, borderRadius: 34, background: "rgba(255,255,255,.82)", boxShadow: "0 14px 0 rgba(20,52,74,.11)" }}>
      <div style={{ height: 32, color: palette.teal, fontSize: 19, fontWeight: 950 }}>一张图看懂协作闭环</div>
      <div style={{ height: 4, margin: "12px 0", background: "rgba(20,52,74,.12)", borderRadius: 5 }}><div style={{ width: `${t * 100}%`, height: "100%", background: `linear-gradient(90deg, ${palette.coral}, ${palette.teal})`, borderRadius: 5 }} /></div>
      <div style={{ display: "flex", alignItems: "center", gap: 20, height: moduleHeight }}>
        <StoryNode width={340} height={moduleHeight} label="要解决的问题" detail={project.problem || project.exampleScenario || project.oneLineSummary} color={palette.coral} visible={goal} icon="问" progress={textProgress(frame, durationFrames, .03)} name="原理问题" />
        <div style={{ width: 30, flexShrink: 0, fontSize: 30, color: palette.coral, opacity: roles }}>➜</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {modules.map((detail, index) => <StoryNode key={index} width={486} height={(moduleHeight - (modules.length - 1) * 10) / modules.length} label={`核心能力 ${index + 1}`} detail={detail} color={[palette.coral, palette.teal, palette.yellow][index]!} visible={reveal(.20 + index * .035, .28 + index * .035) * roles} icon={String(index + 1)} progress={textProgress(frame, durationFrames, .20 + index * .035)} name={`核心能力 ${index + 1}`} />)}
        </div>
      </div>
      <div style={{ display: "flex", gap: 20, height: taskHeight, marginTop: 20 }}>
        {steps.map((detail, index) => <StoryNode key={index} width={285} height={taskHeight} label={`步骤 ${index + 1}`} detail={detail} color={[palette.coral, palette.yellow, palette.teal][index]!} visible={reveal(.43 + index * .045, .54 + index * .045) * tasks} icon={String(index + 1)} progress={textProgress(frame, durationFrames, .43 + index * .045)} name={`原理步骤 ${index + 1}`} />)}
      </div>
      <div style={{ display: "flex", gap: 20, height: governanceHeight, marginTop: 20 }}>
        <StoryNode width={438} height={governanceHeight} label="运行前提" detail={project.requirements[0] || "按项目文档准备运行环境"} color={palette.yellow} visible={governance} icon="!" progress={textProgress(frame, durationFrames, .61)} name="原理运行前提" />
        <StoryNode width={438} height={governanceHeight} label="边界提示" detail={project.limitations[0] || "实际效果取决于项目配置"} color={palette.teal} visible={governance} icon="!" progress={textProgress(frame, durationFrames, .61)} name="原理边界提示" />
      </div>
      <div style={{ marginTop: 20 }}><StoryNode width={896} height={resultHeight} label="可验证结果" detail={project.exampleResult || project.oneLineSummary} color={palette.teal} visible={result} icon="✓" progress={textProgress(frame, durationFrames, .81)} name="原理结果" /></div>
    </div>
    <Subtitle text={caption} durationFrames={durationFrames} />
  </AbsoluteFill>;
}

function ExplainerScene({ project, scene, caption, index, durationFrames, beatId }: { project: RenderProject; scene: string; caption: string; index: number; durationFrames: number; beatId?: string }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const progress = spring({ frame, fps, config: { damping: 20, mass: 0.8 } });
  const flow = project.exampleFlow ?? [];
  const steps = project.usageSteps ?? [];
  const requirements = project.requirements ?? [];
  const limitations = project.limitations ?? [];
  const firstStep = steps[0] ?? project.usage;
  const commandStep = steps.find((step) => /(?:^|\s)(?:npx|npm|pnpm|yarn|bun|python|docker|git)\b/iu.test(step));
  const setupMain = commandStep ? `按项目文档执行：${commandStep}` : firstStep;
  const setupDetail = requirements.length > 0
    ? `先准备：${requirements.slice(0, 2).join("；")}`
    : `先准备项目所需环境，再按 README 完成首次启动。`;
  const workflowMain = steps.length > 0 ? steps.slice(0, 3).join("  →  ") : flow.slice(0, 3).join("  →  ");
  const workflowDetail = project.usage || project.exampleResult;
  const requirementsMain = requirements.join(" · ") || "按项目文档准备运行环境";
  const requirementsDetail = limitations.join("；") || "实际效果取决于项目配置。";
  const sections: Record<string, { kicker: string; main: string; detail: string; color: string }> = {
    problem: { kicker: "第一步 · 看問題", main: project.problem, detail: project.oneLineSummary, color: palette.coral },
    concept: { kicker: "第二步 · 搞懂它", main: project.oneLineSummary, detail: project.features[0] ?? project.usage, color: palette.teal },
    case: { kicker: "第三步 · 具体案例", main: project.exampleScenario, detail: flow.slice(0, 3).join("  →  "), color: palette.coral },
    dashboard: { kicker: "案例画面 · 项目结果", main: project.exampleResult || project.oneLineSummary, detail: project.features.slice(0, 2).join(" · ") || project.usage, color: palette.teal },
    setup: { kicker: "怎么开始 · 首次使用", main: setupMain, detail: setupDetail, color: palette.yellow },
    workflow: { kicker: "怎么使用 · 实际步骤", main: workflowMain || project.usage, detail: workflowDetail, color: palette.teal },
    requirements: { kicker: "运行条件与边界", main: requirementsMain, detail: requirementsDetail, color: palette.coral },
    summary: { kicker: "最后总结", main: project.oneLineSummary, detail: project.exampleResult, color: palette.teal },
  };
  const content = sections[scene] ?? sections.problem!;
  const evidenceByScene: Record<string, string> = { case: "org-chart", dashboard: "dashboard", setup: "setup-wizard", workflow: "task-inbox" };
  const preferredEvidenceId = evidenceByScene[scene];
  const visualAssets = project.visualAssets?.filter((asset) => !isBadgeAsset(asset));
  const preferredAsset = visualAssets?.find((asset) => asset.id === preferredEvidenceId);
  const fallbackIndex: Record<string, number> = { case: 0, dashboard: 1, setup: 2, workflow: 3 };
  const evidenceId = preferredAsset?.id ?? visualAssets?.[fallbackIndex[scene] ?? 0]?.id;
  const hasEvidence = Boolean(evidenceId && visualAssets?.some((asset) => asset.id === evidenceId));
  const main = textLayout(content.main, 868, 336, 32, 28, 850);
  const detail = textLayout(content.detail, 874, 178, 24, 22, 700);
  const title = textLayout(sceneTitles[scene] ?? project.title, 928, 145, 54, 44, 950);
  const bodyTop = Math.max(420, 234 + 32 + 16 + title.height + 28);
  const mainHeight = main.height + 50;
  const detailHeight = detail.height + 34;
  const contentBottom = bodyTop + mainHeight + 13 + detailHeight;
  const visualTop = Math.max(674, contentBottom + 34);
  const opacity = interpolate(progress, [0, 1], [0, 1]);
  if (scene === "concept") return <ConceptStoryboardScene project={project} caption={caption} durationFrames={durationFrames} beatId={beatId} />;
  return <AbsoluteFill style={{ color: palette.ink }}>
    <div style={{ position: "absolute", top: 234, left: 76, right: 76, opacity, transform: `translateY(${(1 - progress) * 35}px)` }}>
      <div style={{ fontSize: 24, letterSpacing: 3, color: content.color, fontWeight: 950 }}>{content.kicker}</div>
      <TextBlock layout={title} name={`${scene} 场景标题`} progress={textProgress(frame, durationFrames)} style={{ marginTop: 16, fontWeight: 950 }} />
    </div>
    <div style={{ position: "absolute", top: bodyTop, left: 76, right: 76, display: "flex", flexDirection: "column", gap: 13 }}>
      <div data-text-region={`${scene} 主说明卡片`} style={{ height: mainHeight, boxSizing: "border-box", border: `3px solid ${palette.ink}`, borderRadius: 24, background: "#fffef9", padding: "22px 27px", boxShadow: `0 9px 0 ${content.color}`, fontWeight: 850, opacity, transform: `translateX(${(1 - progress) * 36}px)` }}><TextBlock layout={main} name={`${scene} 主说明`} progress={textProgress(frame, durationFrames)} /></div>
      <div data-text-region={`${scene} 补充说明卡片`} style={{ height: detailHeight, boxSizing: "border-box", borderRadius: 18, background: "rgba(255,255,255,.78)", padding: "17px 24px", color: palette.muted, fontWeight: 700, opacity: Math.max(0, progress - 0.2) }}><TextBlock layout={detail} name={`${scene} 补充说明`} progress={textProgress(frame, durationFrames)} /></div>
    </div>
    {!hasEvidence && <>
      <div style={{ position: "absolute", top: Math.max(900, visualTop), right: 78, transform: `translateY(${Math.sin(frame / 14) * 5}px) rotate(${Math.sin(frame / 22) * 1.5}deg) scale(.65)`, transformOrigin: "top right", opacity }}><CodeMascot /></div>
      <SceneDiagram project={project} scene={scene} top={Math.max(960, visualTop)} durationFrames={durationFrames} />
    </>}
    {hasEvidence && <EvidencePanel project={project} assetId={evidenceId!} top={visualTop} durationFrames={durationFrames} />}
    <div style={{ position: "absolute", top: 174, left: 70, display: "flex", gap: 10, fontSize: 20, fontWeight: 900, color: palette.ink }}><span style={{ borderRadius: 99, padding: "8px 14px", background: content.color, color: "white" }}>#{project.rank}</span><span style={{ borderRadius: 99, padding: "8px 14px", background: "white" }}>{index + 1} / {project.narrationSegments.length}</span></div>
    <Subtitle text={caption} durationFrames={durationFrames} />
  </AbsoluteFill>;
}

function ChapterProgress({ project }: { project: RenderProject }) {
  const frame = useCurrentFrame();
  const totalFrames = project.narrationSegments.reduce((total, segment) => total + framesForMs(segment.durationMs), 0);
  const position = Math.max(0, Math.min(totalFrames, frame));
  const groups = [
    { label: "排行", scenes: ["intro"] },
    { label: "讲解", scenes: ["problem", "concept"] },
    { label: "案例", scenes: ["case", "dashboard"] },
    { label: "操作", scenes: ["setup", "workflow"] },
    { label: "条件与总结", scenes: ["requirements", "summary"] },
  ];
  const groupFrames = groups.map((group) => project.narrationSegments
    .filter((segment) => group.scenes.includes(segment.scene))
    .reduce((sum, segment) => sum + framesForMs(segment.durationMs), 0));
  let cursor = 0;
  let currentChapter = 0;
  groups.forEach((_, groupIndex) => {
    const frames = groupFrames[groupIndex] ?? 0;
    if (frames > 0 && position >= cursor && position < cursor + frames) currentChapter = groupIndex;
    cursor += frames;
  });
  return <div style={{ position: "absolute", zIndex: 80, top: CHAPTER_BAR_TOP, left: 62, right: 62, height: 50, display: "flex", overflow: "hidden", border: `3px solid ${palette.ink}`, borderRadius: 16, background: "rgba(255,255,255,.82)", boxShadow: "0 5px 0 rgba(20,52,74,.12)" }}>
    {groups.map((group, index) => {
      const groupStart = groupFrames.slice(0, index).reduce((sum, frames) => sum + frames, 0);
      const frames = groupFrames[index] ?? 0;
      const groupProgress = frames ? Math.min(100, Math.max(0, ((position - groupStart) / frames) * 100)) : 0;
      const completed = index < currentChapter || (index === currentChapter && groupProgress >= 100);
      const active = index === currentChapter && !completed;
      const fillColor = completed ? palette.tealLight : active ? "#F6B8AA" : "transparent";
      const fill = completed ? 100 : active ? groupProgress : 0;
      const baseColor = index <= currentChapter ? "rgba(255,255,255,.86)" : "rgba(255,255,255,.52)";
      return <div key={group.label} style={{ position: "relative", flex: 1, minWidth: 0, display: "grid", placeItems: "center", borderLeft: index === 0 ? "none" : `2px solid rgba(20,52,74,.2)`, background: `linear-gradient(90deg, ${fillColor} ${fill}%, ${baseColor} ${fill}%)`, color: index <= currentChapter ? palette.ink : palette.muted, fontSize: group.label.length > 4 ? 15 : 17, fontWeight: 950, textAlign: "center" }}><span style={{ position: "relative", zIndex: 1, whiteSpace: "nowrap", padding: "0 5px" }}>{group.label}</span></div>;
    })}
  </div>;
}

export const ProjectVideo: React.FC<VideoProps> = ({ project, leaderboard, leaderboardContext: context, background, backgroundFrames, backgroundDurationInFrames }) => {
  const effectiveContext = context ?? project.leaderboard ?? leaderboard[0]?.leaderboard;
  const presentation = leaderboardPresentation(effectiveContext);
  let from = 0;
  return <AbsoluteFill style={{ backgroundColor: palette.paper, fontFamily: VIDEO_FONT }}><LayoutGuard>
    <StageBackground asset={background} frames={backgroundFrames} durationInFrames={backgroundDurationInFrames} />
    <div style={{ position: "absolute", zIndex: 79, top: VIDEO_SAFE_TOP, left: 64, right: 58, display: "flex", justifyContent: "space-between", alignItems: "center", color: palette.ink }}>
      <span style={{ fontSize: 25, fontWeight: 900 }}>开源项目观察</span><span style={{ color: palette.teal, fontSize: 22, fontWeight: 900 }}>{presentation.mark}</span>
    </div>
    {project.narrationSegments.map((segment, index) => {
      const frames = framesForMs(segment.durationMs);
      const start = from;
      from += frames;
      return <Sequence key={`${segment.scene}-${index}`} from={start} durationInFrames={frames} name={segment.scene}>
        {segment.scene === "intro"
          ? <LeaderboardScene project={project} leaderboard={leaderboard} caption={segment.text} durationFrames={frames} context={effectiveContext} />
          : <ExplainerScene project={project} scene={segment.scene} caption={segment.text} index={index} durationFrames={frames} beatId={segment.beatId} />}
        {segment.audio ? <Audio src={staticFile(segment.audio)} /> : null}
      </Sequence>;
    })}
    <ChapterProgress project={project} />
  </LayoutGuard></AbsoluteFill>;
};
