import React from "react";
import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame } from "remotion";
import { ChapterProgress, FPS, framesForMs, StageBackground } from "./ProjectVideo";
import { LayoutGuard, TextBlock, textLayout, VIDEO_FONT } from "./text-layout";
import { openrigStory, type OpenRigStoryId, type OpenRigStoryProps } from "./openrig-story";

const colors = { ink: "#14344A", teal: "#168C86", mint: "#D9F1EB", coral: "#EF6A55", yellow: "#F7C64B", white: "#FFFEFA", muted: "#667780" };
const agentColors = [colors.teal, colors.yellow, colors.coral];
const roles = ["写代码", "安排任务", "检查修改"];
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const smooth = (value: number) => { const t = clamp(value); return t * t * (3 - 2 * t); };
const lerp = (from: number, to: number, progress: number) => from + (to - from) * progress;

function Agent({ x, y, color, role, appear, working, thinking, terminal }: { x: number; y: number; color: string; role: string; appear: number; working: number; thinking: number; terminal: boolean }) {
  const frame = useCurrentFrame();
  const bob = Math.sin(frame / 16) * 2.5 * working;
  const arm = Math.sin(frame / 5) * 7 * working;
  return <g transform={`translate(${x} ${y + bob}) scale(${0.88 + 0.12 * appear})`} opacity={appear} stroke={colors.ink} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round">
    <ellipse cx={0} cy={173} rx={83} ry={11} fill={colors.ink} opacity={0.09} stroke="none" />
    <path d="M-30 119 L-34 150 M30 119 L34 150" fill="none" strokeWidth={13} />
    <path d={`M-52 68 Q-77 ${89 + arm} -68 ${112 + arm} M52 68 Q77 ${89 - arm} 68 ${112 - arm}`} fill="none" strokeWidth={13} />
    <rect x={-53} y={42} width={106} height={85} rx={29} fill={color} />
    <path d="M0 -32 L0 -47" />
    <circle cx={0} cy={-54} r={8} fill={color} />
    <rect x={-66} y={-30} width={132} height={85} rx={27} fill={colors.white} />
    <rect x={-49} y={-15} width={98} height={49} rx={18} fill={colors.mint} stroke="none" />
    <circle cx={-20} cy={5} r={6} fill={colors.ink} stroke="none" />
    <circle cx={20} cy={5} r={6} fill={colors.ink} stroke="none" />
    <path d="M-10 22 Q0 30 10 22" fill="none" strokeWidth={3} />
    <path d="M-15 79 L-25 89 L-15 99 M15 79 L25 89 L15 99" fill="none" stroke={colors.white} strokeWidth={4} />
    {terminal && <g transform="translate(0 145)">
      <path d="M-98 42 H98" strokeWidth={7} />
      <rect x={-82} y={-32} width={164} height={70} rx={7} fill={colors.ink} />
      <path d="M-64 -12 L-55 -5 L-64 2 M-43 4 H-13" stroke={colors.mint} strokeWidth={4} />
      <path d="M-43 17 H32" stroke={color} strokeWidth={4} opacity={0.55 + working * 0.45} />
    </g>}
    <text y={terminal ? 232 : 213} textAnchor="middle" fill={colors.ink} stroke="none" fontSize={27} fontWeight={800}>{role}</text>
    {thinking > 0 && <g opacity={thinking} transform="translate(79 -39)">
      <path d="M-10 15 L-18 27 L-15 10" fill={colors.white} />
      <circle r={26} fill={colors.white} />
      <text x={0} y={9} textAnchor="middle" fill={colors.muted} stroke="none" fontSize={29} fontWeight={800}>?</text>
    </g>}
  </g>;
}

function Paper({ x, y, scale = 1, rotation = 0, opacity = 1, checked = false, label = false }: { x: number; y: number; scale?: number; rotation?: number; opacity?: number; checked?: boolean; label?: boolean }) {
  return <g transform={`translate(${x} ${y}) rotate(${rotation}) scale(${scale})`} opacity={opacity} stroke={colors.ink} strokeWidth={4} strokeLinejoin="round" strokeLinecap="round">
    <path d="M-61 -73 H36 L61 -48 V73 H-61 Z" fill={colors.white} />
    <path d="M36 -73 V-48 H61" fill={colors.mint} />
    <path d="M-39 -25 L-50 -15 L-39 -5 M-12 -25 L-1 -15 L-12 -5" fill="none" stroke={colors.teal} />
    <path d="M-38 19 H33 M-38 38 H10" stroke={colors.muted} strokeWidth={4} opacity={0.5} />
    {checked && <g transform="translate(40 56)"><circle r={22} fill={colors.teal} stroke={colors.white} /><path d="M-10 0 L-2 8 L12 -9" fill="none" stroke={colors.white} /></g>}
    {label && <text y={112} stroke="none" fill={colors.ink} textAnchor="middle" fontSize={25} fontWeight={800}>本次修改</text>}
  </g>;
}

function Website({ opacity, progress, check, y }: { opacity: number; progress: number; check: number; y: number }) {
  return <g transform={`translate(500 ${y})`} opacity={opacity} stroke={colors.ink} strokeWidth={4} strokeLinejoin="round" strokeLinecap="round">
    <rect x={-185} y={-110} width={370} height={220} rx={9} fill={colors.white} />
    <path d="M-185 -70 H185" />
    {[0, 1, 2].map(index => <circle key={index} cx={-163 + index * 18} cy={-91} r={4} fill={[colors.coral, colors.yellow, colors.teal][index]} stroke="none" />)}
    <path d="M-144 -35 H-67" stroke={colors.teal} strokeWidth={8} />
    <path d="M-144 34 H144 M-144 59 H75" stroke="#C9DAD8" strokeWidth={12} />
    <g opacity={progress} transform={`translate(${(1 - progress) * 12} 0)`}>
      <rect x={-147} y={-8} width={294} height={43} rx={5} fill={colors.mint} stroke={colors.teal} strokeWidth={3} />
      <circle cx={-124} cy={10} r={7} fill="none" strokeWidth={3} />
      <path d="M-119 15 L-112 22" strokeWidth={3} />
      <text x={-95} y={19} fontSize={21} fill={colors.ink} stroke="none">搜索项目</text>
    </g>
    {check > 0 && <g opacity={check} transform="translate(180 100)"><circle r={26} fill={colors.teal} stroke={colors.white} /><path d="M-12 0 L-3 10 L14 -10" fill="none" stroke={colors.white} strokeWidth={5} /></g>}
  </g>;
}

export const OpenRigStory: React.FC<OpenRigStoryProps> = ({ project, backgroundFrames, backgroundDurationInFrames }) => {
  const frame = useCurrentFrame();
  const starts = new Map<OpenRigStoryId, number>();
  let cursor = 0;
  for (const segment of project.narrationSegments) {
    starts.set(segment.beatId as OpenRigStoryId, cursor);
    cursor += framesForMs(segment.durationMs);
  }
  const start = (id: OpenRigStoryId) => starts.get(id) ?? cursor;
  const motion = (id: OpenRigStoryId, seconds = 0.7, delaySeconds = 0) => smooth((frame - start(id) - delaySeconds * FPS) / (seconds * FPS));
  const active = project.narrationSegments.find((segment, index) => {
    const from = project.narrationSegments.slice(0, index).reduce((sum, item) => sum + framesForMs(item.durationMs), 0);
    return frame >= from && frame < from + framesForMs(segment.durationMs);
  }) ?? project.narrationSegments.at(-1)!;
  const gathered = motion("team", 1.2);
  const board = motion("whiteboard", 0.9);
  const context = motion("context", 0.65);
  const request = motion("search", 0.65, 0.3);
  const build = motion("build", 0.85);
  const buildDone = motion("build", 0.7, 1.8);
  const review = motion("review", 1.05, 0.3);
  const approved = motion("review", 0.65, 2.1);
  const inspected = motion("decision", 0.8);
  const resume = motion("return", 0.8);
  const overview = motion("outcome", 1.15);
  const caption = textLayout(active.text, 880, 114, 34, 30, 800);
  const originalX = [175, 515, 825];
  const originalY = [255, 350, 265];
  const teamX = [215, 500, 785];
  const teamY = [540, 540, 540];
  const status = inspected > 0 ? "结果和记录，一起查看" : review > 0 ? "交给另一个助手检查" : build > 0 ? "登记任务，再完成修改" : request > 0 ? "这次：加一个搜索框" : context > 0 ? "目标、分工、工作记录" : board > 0 ? "一块共同的工作白板" : gathered > 0 ? "让助手组成一个团队" : frame >= start("scattered") ? "工作分散，各自忙碌" : "先请三个助手来帮忙";
  let audioFrom = 0;
  const paperX = lerp(215, 785, review);
  const paperY = 840 + Math.sin(review * Math.PI) * 30;
  return <AbsoluteFill style={{ background: colors.white, color: colors.ink, fontFamily: VIDEO_FONT }}>
    <StageBackground frames={backgroundFrames} durationInFrames={backgroundDurationInFrames} />
    <LayoutGuard>
      <div style={{ position: "absolute", top: 64, left: 64, right: 58, display: "flex", justifyContent: "space-between", alignItems: "center", fontWeight: 900 }}><span style={{ fontSize: 25 }}>开源项目观察</span><span style={{ color: colors.teal, fontSize: 22 }}>GITHUB · TRENDING</span></div>
      <ChapterProgress project={project} />
      <div style={{ position: "absolute", top: 228, left: 72, right: 72 }}>
        <div style={{ fontSize: 25, fontWeight: 800, color: colors.teal }}>编程助手 · 团队协作</div>
        <div style={{ fontSize: 84, fontWeight: 950, marginTop: 10 }}>OpenRig</div>
        <div style={{ fontSize: 39, fontWeight: 850, marginTop: 4 }}>让编程助手，变成一个团队</div>
      </div>
      <div style={{ position: "absolute", top: 457, left: 72, right: 72, color: colors.muted, fontSize: 28, fontWeight: 750 }}>{status}</div>
      <svg viewBox="0 0 1000 1050" width={1000} height={1050} style={{ position: "absolute", top: 520, left: 40, overflow: "visible", fontFamily: VIDEO_FONT }}>
        <g transform={`translate(${500 * overview * 0.08} ${470 * overview * 0.08}) scale(${1 - overview * 0.08})`}>
          <path d="M100 535 V135 Q100 80 155 80 H845 Q900 80 900 135 V980 Q900 1035 845 1035 H155 Q100 1035 100 980 Z" fill="none" stroke={colors.teal} strokeWidth={3} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - gathered} opacity={gathered * 0.65} />
          <g opacity={gathered}><rect x={388} y={61} width={224} height={40} fill={colors.white} /><text x={500} y={92} textAnchor="middle" fontSize={25} fontWeight={800} fill={colors.teal}>OpenRig 工作组</text></g>
          <g opacity={board} stroke={colors.ink} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round">
            <path d="M305 466 L287 498 M695 466 L713 498" />
            <rect x={248} y={147} width={504} height={321} rx={8} fill={colors.white} />
            <rect x={248} y={147} width={504} height={321} rx={8} fill="none" stroke={colors.teal} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - board} />
            <text x={500} y={195} textAnchor="middle" fontSize={29} fontWeight={850} stroke="none" fill={colors.ink}>共同的工作信息</text>
            <path d="M280 219 H720" stroke="#D9E5E2" strokeWidth={3} />
            <g opacity={context}>
              <circle cx={291} cy={252} r={5} fill={colors.teal} stroke="none" /><text x={310} y={261} fontSize={24} fill={colors.ink} stroke="none">目标：一起改好这个网站</text>
              <circle cx={291} cy={297} r={5} fill={colors.teal} stroke="none" /><text x={310} y={306} fontSize={24} fill={colors.ink} stroke="none">分工：安排 / 实现 / 检查</text>
              <path d="M288 346 H473 M288 366 H425" stroke="#C9DAD8" strokeWidth={7} />
            </g>
            <g opacity={request * (1 - inspected)}>
              <path d="M283 348 H710" stroke={colors.white} strokeWidth={45} />
              <rect x={282} y={328} width={427} height={48} rx={4} fill="#FFF3CD" stroke="none" />
              <text x={302} y={360} fontSize={25} fontWeight={800} fill={colors.ink} stroke="none">待办：增加搜索框</text>
            </g>
            <g opacity={build}><text x={291} y={409} fontSize={23} fill={colors.teal} stroke="none">负责人：写代码的助手</text></g>
            <g opacity={inspected}><rect x={282} y={328} width={427} height={48} rx={4} fill={colors.mint} stroke="none" /><text x={302} y={360} fontSize={24} fontWeight={800} fill={colors.teal} stroke="none">已修改 · 检查记录已保留</text></g>
            <path d="M306 455 H690" stroke={colors.ink} strokeWidth={5} />
            <path d="M622 448 H654" stroke={colors.coral} strokeWidth={8} />
          </g>
          {[0, 1, 2].map(index => <Agent key={index}
            x={lerp(originalX[index]!, teamX[index]!, gathered)} y={lerp(originalY[index]!, teamY[index]!, gathered)}
            color={agentColors[index]!} role={gathered > 0.5 ? roles[index]! : `助手 ${index + 1}`}
            appear={motion("helpers", 0.5, index * 0.7)} terminal={true}
            working={index === 0 ? build * (1 - review) : index === 2 ? review * (1 - inspected) : 0.2 * (1 - board)}
            thinking={(index === 1 ? 1 : 0.65) * motion("scattered", 0.5, index * 0.25) * (1 - gathered)} />)}
          {[0, 1, 2].map(index => <Paper key={index} x={[145, 527, 846][index]!} y={[566, 690, 573][index]!} scale={0.64} rotation={[-12, 9, -7][index]!} opacity={motion("scattered", 0.45, index * 0.3) * (1 - gathered)} />)}
          <g opacity={buildDone * (1 - inspected)}><Paper x={paperX} y={paperY} scale={0.7} rotation={Math.sin(review * Math.PI) * 7} checked={approved > 0.5} label={review > 0.05 && review < 0.95} /></g>
          <Website y={910} opacity={request * (1 - build) + inspected} progress={buildDone} check={inspected} />
          <g opacity={resume}>
            <g transform="translate(181 170)" stroke={colors.teal} strokeWidth={4} strokeLinecap="round" fill="none"><circle r={26} fill={colors.white} /><path d="M0 -14 V0 L10 7" /></g>
            <text x={181} y={220} textAnchor="middle" fontSize={22} fontWeight={800} fill={colors.teal}>下次继续</text>
            <path d="M153 142 A40 40 0 0 1 214 145 M214 133 V147 H201" stroke={colors.teal} fill="none" strokeWidth={3} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - resume} />
          </g>
        </g>
      </svg>
      <div style={{ position: "absolute", top: 1610, left: 72, right: 72, textAlign: "center", color: colors.muted, fontSize: 22 }}>白板与纸张为原理示意 · 依据项目 README</div>
      <div data-text-region="样片字幕" style={{ position: "absolute", left: 68, right: 68, bottom: 104, minHeight: 100, padding: "18px 30px", boxSizing: "border-box", borderRadius: 16, background: "rgba(22,31,40,.92)", color: "white", display: "flex", justifyContent: "center", alignItems: "center", textAlign: "center" }}><TextBlock layout={caption} name="OpenRig 同步字幕" /></div>
      {project.narrationSegments.map((segment, index) => {
        const from = audioFrom;
        const frames = framesForMs(segment.durationMs);
        audioFrom += frames;
        return segment.audio ? <Sequence key={index} from={from} durationInFrames={frames} layout="none"><Audio src={staticFile(segment.audio)} /></Sequence> : null;
      })}
    </LayoutGuard>
  </AbsoluteFill>;
};

export const defaultOpenRigStoryProps: OpenRigStoryProps = {
  project: {
    repo: "mvschwarz/openrig", rank: 2, title: "OpenRig", oneLineSummary: "把零散的编程助手组织成持续协作的小队。",
    problem: "工作分散在多个终端。", features: ["团队分工", "共享上下文", "任务记录"], audience: "第一次接触编程助手的人",
    usage: "组织编程助手协作。", exampleScenario: "给网站增加搜索框。", exampleFlow: ["登记任务", "完成修改", "检查修改"],
    exampleResult: "修改与检查记录。", usageSteps: ["定义团队", "登记任务", "查看结果"], requirements: ["已有编程助手"], limitations: ["需要检查实际结果"],
    sources: ["https://github.com/mvschwarz/openrig"],
    narrationSegments: openrigStory.map(beat => ({ scene: "concept", beatId: beat.id, text: beat.text, spokenText: beat.text, audio: "", durationMs: 3_600 })),
  },
};
