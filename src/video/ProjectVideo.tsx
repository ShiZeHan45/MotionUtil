import React from "react";
import { AbsoluteFill, Audio, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import type { RenderProject, TrendingRepo } from "../types";

export type VideoProps = { project: RenderProject; leaderboard: TrendingRepo[] };
export const FPS = 30;
export const INTRO_PAD_MS = 300;

export function framesForMs(ms: number): number {
  return Math.max(1, Math.ceil((ms * FPS) / 1_000));
}

export function durationInFrames(project: RenderProject): number {
  return project.narrationSegments.reduce((total, segment) => total + framesForMs(segment.durationMs), 0) + framesForMs(INTRO_PAD_MS);
}

const palette = { ink: "#14344A", teal: "#168C86", tealLight: "#B7E0D7", coral: "#EF6A55", yellow: "#F7C64B", paper: "#F7F4EB", muted: "#667780" };
const clampText = (lines: number): React.CSSProperties => ({
  display: "-webkit-box",
  WebkitBoxOrient: "vertical",
  WebkitLineClamp: lines,
  overflow: "hidden",
  overflowWrap: "anywhere",
  wordBreak: "break-word",
});
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

function StageBackground() {
  return <>
    <AbsoluteFill style={{ background: "linear-gradient(180deg, #fbfcf9 0%, #f0f3f1 54%, #e8efed 100%)" }} />
    <div style={{ position: "absolute", top: "51%", left: 0, right: 0, height: 3, background: "rgba(20,52,74,.15)" }} />
    <div style={{ position: "absolute", left: "-25%", right: "-25%", bottom: "-7%", height: "48%", transform: "perspective(600px) rotateX(58deg)", transformOrigin: "bottom", opacity: 0.58, backgroundImage: "linear-gradient(rgba(20,52,74,.25) 2px, transparent 2px), linear-gradient(90deg, rgba(20,52,74,.25) 2px, transparent 2px)", backgroundSize: "92px 92px", maskImage: "linear-gradient(to top, black 45%, transparent 100%)" }} />
    <div style={{ position: "absolute", top: 77, left: 64, display: "flex", alignItems: "center", gap: 13, color: palette.ink, fontSize: 25, fontWeight: 900 }}><span style={{ width: 18, height: 18, borderRadius: "50%", background: palette.coral, border: `4px solid ${palette.ink}` }} />每周开源项目排行</div>
    <div style={{ position: "absolute", top: 81, right: 58, color: palette.teal, fontSize: 22, fontWeight: 900, letterSpacing: 1 }}>GITHUB · WEEKLY</div>
  </>;
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
  return <div style={{ position: "absolute", zIndex: 45, left: 68, right: 68, bottom: 104, minHeight: 82, maxHeight: 122, boxSizing: "border-box", borderRadius: 22, border: "2px solid rgba(255,255,255,.6)", background: "rgba(22, 31, 40, .9)", color: "white", padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", fontSize: 31, lineHeight: 1.35, fontWeight: 800, boxShadow: "0 12px 26px rgba(20,30,40,.2)", ...clampText(2) }}>{chunks[activeIndex] ?? text}</div>;
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

function SceneDiagram({ project, scene }: { project: RenderProject; scene: string }) {
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
            { label: shortCardLabel(steps[0] ?? "开始使用", "开始使用", 8), detail: steps[0] ?? project.usage, kind: kinds[0] },
            { label: shortCardLabel(steps[1] ?? "执行流程", "执行流程", 8), detail: steps[1] ?? flow[0] ?? project.features[0] ?? project.usage, kind: kinds[1] },
            { label: shortCardLabel(steps[2] ?? "查看结果", "查看结果", 8), detail: steps[2] ?? project.exampleResult, kind: kinds[2] },
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
  return <div style={{ position: "absolute", left: 74, right: 74, top: 1125, height: 480, borderRadius: 34, border: `3px solid rgba(20,52,74,.5)`, background: "rgba(255,255,255,.86)", boxShadow: "0 12px 0 rgba(20,52,74,.1)", padding: "28px 28px", boxSizing: "border-box", opacity: panelIn, transform: `translateY(${(1 - panelIn) * 36}px) scale(${0.98 + panelIn * 0.02})` }}>
    <div style={{ fontSize: 22, color: palette.teal, fontWeight: 950, letterSpacing: 2 }}>项目示意图 · 依据项目资料整理</div>
    <div style={{ position: "absolute", top: 100, left: 24, right: 24, display: "flex", alignItems: "stretch", justifyContent: "space-between", gap: 4 }}>
      {stages.map((stage, index) => {
        const cardIn = spring({ frame: frame - 12 - index * 8, fps, config: { damping: 16, mass: 0.65 } });
        const arrowOpacity = interpolate(frame, [18 + index * 8, 28 + index * 8], [0, 1], { extrapolateRight: "clamp" });
        return <React.Fragment key={stage.label}>
        <div style={{ width: 244, height: 270, border: `3px solid ${index === 1 ? palette.teal : palette.ink}`, borderRadius: 24, background: index === 1 ? "#E5F4EF" : "#FCFBF6", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "16px 12px", boxSizing: "border-box", textAlign: "center", opacity: cardIn, transform: `translateY(${(1 - cardIn) * 32}px) scale(${0.94 + cardIn * 0.06})` }}>
          <DiagramIcon kind={stage.kind} />
          <div style={{ marginTop: 8, color: palette.ink, fontWeight: 900, fontSize: 23, lineHeight: 1.16, maxHeight: 54, ...clampText(2) }}>{stage.label}</div>
          <div style={{ marginTop: 6, color: palette.muted, fontWeight: 650, fontSize: stage.detail.length > 34 ? 16 : 18, lineHeight: 1.28, maxHeight: 68, ...clampText(3) }}>{stage.detail}</div>
        </div>
        {index < stages.length - 1 && <div style={{ alignSelf: "center", color: palette.coral, fontSize: 38, fontWeight: 950, opacity: arrowOpacity, transform: `translateX(${(1 - arrowOpacity) * -8}px)` }}>➜</div>}
      </React.Fragment>;
      })}
    </div>
    <div style={{ position: "absolute", right: 12, bottom: 3, width: 185, height: 65, borderRadius: "50%", background: "rgba(22,140,134,.12)" }} />
  </div>;
}

function RankCard({ repo, selected, scanning, index }: { repo: TrendingRepo; selected: boolean; scanning: boolean; index: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entrance = spring({ frame: frame - index * 3, fps, config: { damping: 18, mass: 0.7 } });
  const lift = selected ? interpolate(frame, [fps * 0.7, fps * 1.8], [0, -18], { extrapolateRight: "clamp" }) : 0;
  const formatStars = (stars: number | null) => stars === null ? "—" : new Intl.NumberFormat("en-US").format(stars);
  return <div style={{ transform: `translateY(${(1 - entrance) * 48 + lift}px) scale(${selected ? 1.035 : scanning ? 1.02 : 1})`, opacity: entrance * (selected || scanning || frame < fps * 1.2 ? 1 : 0.55), width: 800, minHeight: 126, marginBottom: 17, padding: "18px 24px", boxSizing: "border-box", display: "flex", alignItems: "center", gap: 22, border: `4px solid ${selected ? palette.teal : scanning ? palette.coral : palette.ink}`, borderRadius: 26, background: selected ? "#fffef9" : scanning ? "#fff8eb" : "rgba(255,255,255,.75)", boxShadow: selected ? "0 18px 0 rgba(22,140,134,.16)" : "0 7px 0 rgba(20,52,74,.08)" }}>
    <div style={{ flex: "0 0 auto", width: 76, height: 76, borderRadius: "50%", display: "grid", placeItems: "center", color: "white", background: selected ? palette.coral : scanning ? palette.teal : palette.ink, fontSize: 42, fontWeight: 900 }}>#{repo.rank}</div>
      <div style={{ minWidth: 0, flex: 1, overflow: "hidden" }}>
      <div style={{ fontSize: 32, lineHeight: 1.15, fontWeight: 850, color: palette.ink, textOverflow: "ellipsis", whiteSpace: "nowrap", overflow: "hidden", overflowWrap: "anywhere" }}>{repo.fullName}</div>
      <div style={{ marginTop: 7, fontSize: 22, lineHeight: 1.2, color: palette.muted, textOverflow: "ellipsis", whiteSpace: "nowrap", overflow: "hidden", overflowWrap: "anywhere" }}>{repo.description || "GitHub Trending 本周项目"}</div>
    </div>
    <div style={{ flex: "0 0 132px", textAlign: "right", whiteSpace: "nowrap" }}>
      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 5, fontSize: 24, lineHeight: 1.15, fontWeight: 950, color: palette.ink }}>
        <span style={{ color: palette.yellow, fontSize: 28 }}>★</span>{formatStars(repo.totalStars)}
      </div>
      {repo.starsThisWeek !== null && <div style={{ marginTop: 7, color: palette.teal, fontSize: 17, lineHeight: 1.1, fontWeight: 850 }}>↗ {formatStars(repo.starsThisWeek)} 本周</div>}
    </div>
    {selected && <div style={{ color: palette.teal, fontSize: 21, fontWeight: 900, flex: "0 0 auto" }}>本期介绍</div>}
  </div>;
}

function LeaderboardScene({ project, leaderboard, caption, durationFrames }: { project: RenderProject; leaderboard: TrendingRepo[]; caption: string; durationFrames: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pulse = 1 + Math.sin(frame / 8) * 0.025;
  const visibleRepos = leaderboard.slice(0, 5);
  const locked = frame >= fps * 1.5;
  const scanRank = Math.min(visibleRepos.length, Math.floor(frame / Math.max(1, fps * 0.24)) + 1);
  const selected = leaderboard.find((repo) => repo.rank === project.rank) ?? { rank: project.rank, fullName: project.repo, description: project.oneLineSummary, owner: project.repo.split("/")[0] ?? "", name: project.repo.split("/")[1] ?? "", url: "", language: null, totalStars: null, starsThisWeek: null };
  return <AbsoluteFill style={{ color: palette.ink }}>
    <StageBackground />
    <div style={{ position: "absolute", top: 180, left: 0, right: 0, textAlign: "center" }}>
      <div style={{ fontSize: 26, letterSpacing: 5, color: palette.teal, fontWeight: 900 }}>本周 GitHub Trending</div>
      <div style={{ marginTop: 22, fontSize: 66, fontWeight: 950 }}>开源项目排行</div>
      <div style={{ marginTop: 10, fontSize: 28, color: palette.muted }}>从本周榜单中，找到值得关注的项目</div>
    </div>
    <div style={{ position: "absolute", top: 480, left: 140, right: 140, display: "flex", flexDirection: "column", alignItems: "center", transform: `scale(${pulse})`, transformOrigin: "center top" }}>
      {visibleRepos.map((repo, index) => <RankCard key={repo.fullName} repo={repo} selected={locked && repo.rank === project.rank} scanning={!locked && repo.rank === scanRank} index={index} />)}
    </div>
    <div style={{ position: "absolute", bottom: 265, left: 0, right: 0, textAlign: "center", fontSize: 30, color: palette.ink, fontWeight: 800 }}>今天介绍：<span style={{ color: palette.coral }}>{selected.fullName}</span></div>
    <div style={{ position: "absolute", top: 1204, left: 54, transform: `translateY(${Math.sin(frame / 14) * 5}px) rotate(${Math.sin(frame / 22) * 1.5}deg)` }}><CodeMascot /></div>
    <Subtitle text={caption} durationFrames={durationFrames} />
  </AbsoluteFill>;
}

function EvidencePanel({ project, assetId }: { project: RenderProject; assetId: string }) {
  const asset = project.visualAssets?.find((item) => item.id === assetId);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (!asset) return null;
  const entrance = spring({ frame: frame - 8, fps, config: { damping: 20, mass: 0.8 } });
  return <div style={{ position: "absolute", top: 674, left: 56, right: 56, height: 770, borderRadius: 30, overflow: "hidden", border: `4px solid ${palette.ink}`, background: "#111820", boxShadow: "0 14px 0 rgba(20,52,74,.18)", opacity: entrance, transform: `translateY(${(1 - entrance) * 30}px)` }}>
    <div style={{ height: 56, padding: "0 22px", display: "flex", alignItems: "center", justifyContent: "space-between", color: "white", background: palette.ink, fontSize: 21, fontWeight: 900 }}>
      <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", overflowWrap: "anywhere" }}>{asset.label}</span><span style={{ flex: "0 0 auto", borderRadius: 99, padding: "5px 12px", color: "#173A50", background: "#D9F1EB", fontSize: 17 }}>项目资料</span>
    </div>
    <div style={{ height: 645, display: "grid", placeItems: "center", background: "#111820" }}>
      <img src={staticFile(asset.path)} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
    </div>
    <div style={{ position: "absolute", left: 18, right: 18, bottom: 10, color: "#CAD8DE", fontSize: 15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", overflowWrap: "anywhere" }}>来源：{asset.sourceUrl} · 资料页中的示例内容，仅用于说明界面</div>
  </div>;
}

function StoryNode({
  x,
  y,
  width,
  label,
  detail,
  color,
  visible,
  icon,
}: {
  x: number;
  y: number;
  width: number;
  label: string;
  detail: string;
  color: string;
  visible: number;
  icon: string;
}) {
  return <div style={{ position: "absolute", left: x, top: y, width, minHeight: 126, boxSizing: "border-box", padding: "16px 18px", border: `3px solid ${palette.ink}`, borderRadius: 24, background: "#fffef9", boxShadow: `0 8px 0 ${color}55`, opacity: visible, transform: `translateY(${(1 - visible) * 22}px) scale(${0.94 + visible * 0.06})`, transformOrigin: "center bottom" }}>
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ width: 48, height: 48, borderRadius: 15, display: "grid", placeItems: "center", background: color, color: "white", fontSize: 25, fontWeight: 950 }}>{icon}</div>
      <div style={{ minWidth: 0, overflow: "hidden" }}>
        <div style={{ color: palette.ink, fontSize: 23, lineHeight: 1.16, fontWeight: 950, maxHeight: 54, ...clampText(2) }}>{label}</div>
        <div style={{ marginTop: 5, color: palette.muted, fontSize: 17, lineHeight: 1.25, fontWeight: 700, maxHeight: 43, ...clampText(2) }}>{detail}</div>
      </div>
    </div>
  </div>;
}

function StoryConnector({ x, y, width, visible, color = palette.coral }: { x: number; y: number; width: number; visible: number; color?: string }) {
  return <div style={{ position: "absolute", left: x, top: y, width: Math.max(0, width * visible), height: 7, borderRadius: 8, background: color, opacity: visible, transformOrigin: "left center" }} />;
}

function shortCardLabel(value: string, fallback: string, maxLength = 12): string {
  const firstClause = value.split(/[，,；;：:。.!！？!?]/u)[0]?.trim() || value.trim();
  const chars = Array.from(firstClause);
  return chars.length > maxLength ? `${chars.slice(0, maxLength).join("")}…` : firstClause || fallback;
}

function ConceptWalkthrough({ project, caption, durationFrames }: { project: RenderProject; caption: string; durationFrames: number }) {
  const frame = useCurrentFrame();
  const t = Math.min(1, Math.max(0, frame / Math.max(1, durationFrames - 1)));
  const reveal = (start: number, end: number) => interpolate(t, [start, end], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const goal = reveal(0.03, 0.16);
  const roles = reveal(0.18, 0.37);
  const tasks = reveal(0.39, 0.59);
  const governance = reveal(0.61, 0.79);
  const result = reveal(0.81, 0.98);
  const phase = t < 0.18 ? "先看它解决什么" : t < 0.39 ? "再拆出核心能力" : t < 0.61 ? "按案例步骤运行" : t < 0.81 ? "检查前提和边界" : "最后留下可验证结果";
  const projectName = shortCardLabel(project.title || project.repo, project.repo, 20);
  const moduleCards = (project.features.length ? project.features : [project.usage, project.oneLineSummary]).slice(0, 3).map((detail, index) => ({
    label: shortCardLabel(detail, `核心能力 ${index + 1}`, 10),
    detail,
    color: [palette.coral, palette.teal, palette.yellow][index] ?? palette.teal,
    icon: `${index + 1}`,
  }));
  const taskCards = (project.exampleFlow.length ? project.exampleFlow : project.usageSteps).slice(0, 3).map((detail, index) => ({
    label: `步骤 ${String(index + 1).padStart(2, "0")}`,
    detail,
    color: [palette.coral, palette.yellow, palette.teal][index] ?? palette.teal,
    icon: String(index + 1).padStart(2, "0"),
  }));
  const requirement = project.requirements[0] || "按项目文档准备运行环境";
  const limitation = project.limitations[0] || "实际效果取决于项目配置";
  return <AbsoluteFill style={{ color: palette.ink }}>
    <StageBackground />
    <div style={{ position: "absolute", top: 144, left: 70, display: "flex", gap: 10, fontSize: 20, fontWeight: 900, color: palette.ink }}><span style={{ borderRadius: 99, padding: "8px 14px", background: palette.teal, color: "white" }}>#{project.rank}</span><span style={{ borderRadius: 99, padding: "8px 14px", background: "white" }}>原理动画 Demo</span></div>
    <div style={{ position: "absolute", top: 218, left: 72, right: 72 }}>
      <div style={{ fontSize: 24, letterSpacing: 3, color: palette.teal, fontWeight: 950 }}>第二步 · 先理解原理</div>
      <div style={{ marginTop: 15, fontSize: 53, lineHeight: 1.12, fontWeight: 950, maxHeight: 120, ...clampText(2) }}>{projectName} 怎样把问题变成结果？</div>
      <div style={{ marginTop: 12, fontSize: 23, lineHeight: 1.35, color: palette.muted, fontWeight: 750, maxHeight: 66, ...clampText(2) }}>把项目的输入、核心能力和案例步骤按顺序画出来。</div>
    </div>
    <div style={{ position: "absolute", left: 58, right: 58, top: 415, height: 1095, border: `3px solid ${palette.ink}`, borderRadius: 34, background: "rgba(255,255,255,.82)", boxShadow: "0 14px 0 rgba(20,52,74,.11)", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: 24, left: 28, right: 28, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ color: palette.teal, fontSize: 19, fontWeight: 950, letterSpacing: 2 }}>一张图看懂协作闭环</div>
        <div style={{ color: palette.coral, fontSize: 19, fontWeight: 950 }}>{phase}</div>
      </div>
      <div style={{ position: "absolute", top: 84, left: 28, right: 28, height: 4, background: "rgba(20,52,74,.12)", borderRadius: 5 }}><div style={{ width: `${t * 100}%`, height: "100%", background: `linear-gradient(90deg, ${palette.coral}, ${palette.teal})`, borderRadius: 5 }} /></div>
      <StoryNode x={44} y={132} width={390} label="要解决的问题" detail={project.problem || project.exampleScenario || project.oneLineSummary} color={palette.coral} visible={goal} icon="问" />
      <StoryConnector x={438} y={194} width={72} visible={roles} />
      <div style={{ position: "absolute", left: 520, top: 111, color: palette.coral, fontSize: 18, fontWeight: 900, opacity: roles }}>问题被拆成核心能力</div>
      {moduleCards.map((module, index) => <StoryNode key={`${module.label}-${index}`} x={520 + (index % 2) * 188} y={145 + Math.floor(index / 2) * 142} width={170} label={module.label} detail={module.detail} color={module.color} visible={reveal(0.20 + index * 0.035, 0.28 + index * 0.035) * roles} icon={module.icon} />)}
      <div style={{ position: "absolute", left: 28, right: 28, top: 441, color: palette.teal, fontSize: 18, fontWeight: 900, opacity: tasks }}>案例按这个顺序一步步运行</div>
      {taskCards.map((task, index) => <React.Fragment key={task.label}><StoryConnector x={115 + index * 284} y={493} width={110} visible={tasks} color={task.color} /><StoryNode x={38 + index * 284} y={523} width={244} label={task.label} detail={task.detail} color={task.color} visible={reveal(0.43 + index * 0.045, 0.54 + index * 0.045) * tasks} icon={task.icon} /></React.Fragment>)}
      <div style={{ position: "absolute", left: 28, right: 28, top: 700, height: 3, background: "rgba(20,52,74,.12)" }} />
      <div style={{ position: "absolute", left: 28, top: 733, color: palette.coral, fontSize: 18, fontWeight: 900, opacity: governance }}>运行前先确认这些条件</div>
      <div style={{ position: "absolute", left: 38, top: 785, width: 432, height: 132, border: `3px solid ${palette.ink}`, borderRadius: 24, background: "#FFF8EB", padding: "18px 22px", boxSizing: "border-box", opacity: governance, transform: `translateY(${(1 - governance) * 18}px)` }}><div style={{ fontSize: 23, fontWeight: 950 }}>运行前提</div><div style={{ marginTop: 10, color: palette.muted, fontSize: 18, lineHeight: 1.25, fontWeight: 750, maxHeight: 47, ...clampText(2) }}>{requirement}</div></div>
      <div style={{ position: "absolute", left: 508, top: 785, width: 432, height: 132, border: `3px solid ${palette.ink}`, borderRadius: 24, background: "#E5F4EF", padding: "18px 22px", boxSizing: "border-box", opacity: governance, transform: `translateY(${(1 - governance) * 18}px)` }}><div style={{ fontSize: 23, fontWeight: 950 }}>边界提示</div><div style={{ marginTop: 10, color: palette.muted, fontSize: 18, lineHeight: 1.25, fontWeight: 750, maxHeight: 47, ...clampText(2) }}>{limitation}</div></div>
      <StoryConnector x={470} y={938} width={36} visible={result} color={palette.teal} /><StoryConnector x={506} y={938} width={36} visible={result} color={palette.teal} />
      <div style={{ position: "absolute", left: 28, right: 28, top: 960, height: 3, background: "rgba(20,52,74,.12)", opacity: result }} />
      <div style={{ position: "absolute", left: 28, right: 28, top: 974, color: palette.teal, fontSize: 18, lineHeight: 1.2, fontWeight: 900, opacity: result, maxHeight: 44, ...clampText(2) }}>结果不只是一句“完成”，而是一组可以回看的记录</div>
      <div style={{ position: "absolute", left: 38, right: 38, top: 1010, color: palette.ink, fontSize: 21, lineHeight: 1.2, fontWeight: 950, opacity: result, maxHeight: 68, ...clampText(2) }}>{project.exampleResult || project.oneLineSummary}</div>
    </div>
    <Subtitle text={caption} durationFrames={durationFrames} />
  </AbsoluteFill>;
}

function ExplainerScene({ project, scene, caption, index, durationFrames }: { project: RenderProject; scene: string; caption: string; index: number; durationFrames: number }) {
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
  const preferredAsset = project.visualAssets?.find((asset) => asset.id === preferredEvidenceId);
  const fallbackIndex: Record<string, number> = { case: 0, dashboard: 1, setup: 2, workflow: 3 };
  const evidenceId = preferredAsset?.id ?? project.visualAssets?.[fallbackIndex[scene] ?? 0]?.id;
  const hasEvidence = Boolean(evidenceId && project.visualAssets?.some((asset) => asset.id === evidenceId));
  const opacity = interpolate(progress, [0, 1], [0, 1]);
  if (scene === "concept") return <ConceptWalkthrough project={project} caption={caption} durationFrames={durationFrames} />;
  return <AbsoluteFill style={{ color: palette.ink }}>
    <StageBackground />
    <div style={{ position: "absolute", top: 214, left: 76, right: 76, opacity, transform: `translateY(${(1 - progress) * 35}px)` }}>
      <div style={{ fontSize: 24, letterSpacing: 3, color: content.color, fontWeight: 950 }}>{content.kicker}</div>
      <div style={{ marginTop: 16, fontSize: 54, lineHeight: 1.16, fontWeight: 950, maxHeight: 150, ...clampText(2) }}>{sceneTitles[scene] ?? project.title}</div>
    </div>
    <div style={{ position: "absolute", top: 394, left: 76, right: 76, display: "flex", flexDirection: "column", gap: 13 }}>
      <div style={{ border: `3px solid ${palette.ink}`, borderRadius: 24, background: "#fffef9", padding: "22px 27px", boxShadow: `0 9px 0 ${content.color}`, fontSize: 32, lineHeight: 1.28, fontWeight: 850, opacity, transform: `translateX(${(1 - progress) * 36}px)`, maxHeight: 138, ...clampText(3) }}>{content.main}</div>
      <div style={{ borderRadius: 18, background: "rgba(255,255,255,.78)", padding: "17px 24px", fontSize: 22, lineHeight: 1.32, color: palette.muted, fontWeight: 700, opacity: Math.max(0, progress - 0.2), maxHeight: 86, ...clampText(3) }}>{content.detail}</div>
    </div>
    {!hasEvidence && <>
      <div style={{ position: "absolute", top: 1010, right: 78, transform: `translateY(${Math.sin(frame / 14) * 5}px) rotate(${Math.sin(frame / 22) * 1.5}deg) scale(.82)`, transformOrigin: "bottom right", opacity }}><CodeMascot /></div>
      <SceneDiagram project={project} scene={scene} />
    </>}
    {hasEvidence && <EvidencePanel project={project} assetId={evidenceId!} />}
    <div style={{ position: "absolute", top: 144, left: 70, display: "flex", gap: 10, fontSize: 20, fontWeight: 900, color: palette.ink }}><span style={{ borderRadius: 99, padding: "8px 14px", background: content.color, color: "white" }}>#{project.rank}</span><span style={{ borderRadius: 99, padding: "8px 14px", background: "white" }}>{index + 1} / {project.narrationSegments.length}</span></div>
    <Subtitle text={caption} durationFrames={durationFrames} />
  </AbsoluteFill>;
}

function ChapterProgress({ project }: { project: RenderProject }) {
  const frame = useCurrentFrame();
  const totalFrames = project.narrationSegments.reduce((total, segment) => total + framesForMs(segment.durationMs), 0);
  const position = Math.max(0, Math.min(totalFrames, frame));
  const percent = totalFrames ? (position / totalFrames) * 100 : 0;
  const groups = [
    { label: "排行", scenes: ["intro"] },
    { label: "讲解", scenes: ["problem", "concept"] },
    { label: "案例", scenes: ["case", "dashboard"] },
    { label: "操作", scenes: ["setup", "workflow"] },
    { label: "条件与总结", scenes: ["requirements", "summary"] },
  ];
  let cursor = 0;
  let currentChapter = 0;
  groups.forEach((group, groupIndex) => {
    const frames = project.narrationSegments
      .filter((segment) => group.scenes.includes(segment.scene))
      .reduce((sum, segment) => sum + framesForMs(segment.durationMs), 0);
    if (position >= cursor && position < cursor + frames) currentChapter = groupIndex;
    cursor += frames;
  });
  return <div style={{ position: "absolute", zIndex: 80, top: 18, left: 62, right: 62 }}>
    <div style={{ height: 7, borderRadius: 9, background: "rgba(20,52,74,.16)", overflow: "hidden", boxShadow: "0 1px 2px rgba(20,52,74,.12)" }}>
      <div style={{ width: `${percent}%`, height: "100%", borderRadius: 9, background: `linear-gradient(90deg, ${palette.teal}, ${palette.coral})` }} />
    </div>
    <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", color: palette.muted, fontSize: 16, fontWeight: 850 }}>
      {groups.map((group, index) => <span key={group.label} style={{ color: currentChapter === index ? palette.coral : palette.muted }}>{group.label}</span>)}
    </div>
  </div>;
}

export const ProjectVideo: React.FC<VideoProps> = ({ project, leaderboard }) => {
  let from = 0;
  return <AbsoluteFill style={{ backgroundColor: palette.paper, fontFamily: "Arial, 'Microsoft YaHei', sans-serif" }}>
    {project.narrationSegments.map((segment, index) => {
      const frames = framesForMs(segment.durationMs);
      const start = from;
      from += frames;
      return <Sequence key={`${segment.scene}-${index}`} from={start} durationInFrames={frames} name={segment.scene}>
        {segment.scene === "intro"
          ? <LeaderboardScene project={project} leaderboard={leaderboard} caption={segment.text} durationFrames={frames} />
          : <ExplainerScene project={project} scene={segment.scene} caption={segment.text} index={index} durationFrames={frames} />}
        {segment.audio ? <Audio src={staticFile(segment.audio)} /> : null}
      </Sequence>;
    })}
    <ChapterProgress project={project} />
  </AbsoluteFill>;
};
