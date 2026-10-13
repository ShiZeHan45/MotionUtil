import React from "react";
import { CHARACTER_CANVAS, materials, palette, SHADOW, STROKE, strokeProps } from "./style";

export type CharacterProps = { size: number; color?: string; rotate?: number };
type CharacterRender = (props: CharacterProps) => React.ReactElement;
// `use` tells the planning model what each character can stand for; it is part of the vocabulary hash.

const Frame: React.FC<{ size: number; children: React.ReactNode }> = ({ size, children }) => (
  <svg viewBox={`0 0 ${CHARACTER_CANVAS} ${CHARACTER_CANVAS}`} width={size} height={size} style={{ filter: SHADOW.character, overflow: "visible" }}>
    <g {...strokeProps}>{children}</g>
  </svg>
);
const Eyes: React.FC<{ y: number; gap?: number }> = ({ y, gap = 22 }) => (
  <g stroke="none" fill={palette.ink}><ellipse cx={80 - gap / 2} cy={y} rx="5" ry="7" /><ellipse cx={80 + gap / 2} cy={y} rx="5" ry="7" /></g>
);

const person: CharacterRender = ({ size }) => (
  <Frame size={size}>
    <path d="M32 150 Q32 100 80 100 Q128 100 128 150 Z" fill={palette.teal} />
    <circle cx="80" cy="62" r="38" fill={materials.skin} />
    <path d="M44 56 Q50 22 80 24 Q112 22 116 56 Q96 40 80 42 Q60 40 44 56 Z" fill={palette.ink} />
    <Eyes y={66} />
    <path d="M68 82 Q80 92 92 82" fill="none" />
  </Frame>
);

const assistant: CharacterRender = ({ size }) => (
  <Frame size={size}>
    <path d="M80 28 V14" fill="none" />
    <circle cx="80" cy="10" r="8" fill={palette.yellow} />
    <rect x="22" y="28" width="116" height="104" rx="38" fill={palette.mint} />
    <rect x="38" y="46" width="84" height="62" rx="26" fill={palette.cream} strokeWidth={STROKE.detail} />
    <Eyes y={74} />
    <path d="M68 92 Q80 102 92 92" fill="none" strokeWidth={STROKE.detail} />
    <rect x="54" y="136" width="52" height="16" rx="8" fill={palette.teal} />
  </Frame>
);

const file: CharacterRender = ({ size }) => (
  <Frame size={size}>
    <path d="M38 18 H98 L130 50 V142 H38 Z" fill={palette.cream} />
    <path d="M98 18 V50 H130" fill={palette.tealLight} />
    <path d="M54 78 H114 M54 98 H114 M54 118 H92" fill="none" strokeWidth={STROKE.detail} />
  </Frame>
);

const box: CharacterRender = ({ size }) => (
  <Frame size={size}>
    <path d="M22 62 H138 V138 H22 Z" fill={materials.cardboard} />
    <rect x="14" y="36" width="132" height="30" rx="8" fill={palette.coral} />
    <rect x="62" y="82" width="36" height="14" rx="7" fill={palette.cream} strokeWidth={STROKE.detail} />
  </Frame>
);

const server: CharacterRender = ({ size }) => (
  <Frame size={size}>
    {[22, 62, 102].map((y) => <g key={y}>
      <rect x="22" y={y} width="116" height="34" rx="10" fill={palette.mint} />
      <circle cx="46" cy={y + 17} r="5" fill={palette.coral} strokeWidth={STROKE.tiny} />
      <circle cx="64" cy={y + 17} r="5" fill={palette.yellow} strokeWidth={STROKE.tiny} />
      <path d={`M88 ${y + 17} H122`} fill="none" strokeWidth={STROKE.detail} />
    </g>)}
  </Frame>
);

const packet: CharacterRender = ({ size, color = palette.yellow }) => (
  <Frame size={size}>
    <rect x="26" y="44" width="108" height="86" rx="14" fill={color} />
    <path d="M80 44 V130" fill="none" />
    <path d="M26 74 H134" fill="none" strokeWidth={STROKE.fine} />
    <path d="M80 44 Q62 16 52 34 Q56 48 80 44 Q104 48 108 34 Q98 16 80 44" fill={palette.cream} strokeWidth={STROKE.fine} />
  </Frame>
);

const gear: CharacterRender = ({ size, rotate = 0 }) => (
  <Frame size={size}>
    <g transform={`rotate(${rotate} 80 80)`}>
      {Array.from({ length: 8 }, (_, index) => <rect key={index} x="68" y="10" width="24" height="30" rx="6" fill={palette.yellow} transform={`rotate(${index * 45} 80 80)`} />)}
      <circle cx="80" cy="80" r="48" fill={palette.yellow} />
      <circle cx="80" cy="80" r="20" fill={palette.cream} />
    </g>
  </Frame>
);

const lens: CharacterRender = ({ size }) => (
  <Frame size={size}>
    <path d="M100 100 L140 142" fill="none" strokeWidth={STROKE.handle} />
    <circle cx="70" cy="68" r="44" fill={materials.glass} />
    <path d="M44 56 Q52 38 70 36" fill="none" strokeWidth={STROKE.detail} stroke={palette.cream} />
  </Frame>
);

const terminal: CharacterRender = ({ size }) => (
  <Frame size={size}>
    <rect x="16" y="26" width="128" height="108" rx="16" fill={palette.ink} />
    <path d="M40 62 L62 80 L40 98" fill="none" stroke={palette.tealLight} />
    <path d="M74 100 H110" fill="none" stroke={palette.yellow} />
  </Frame>
);

const browser: CharacterRender = ({ size }) => (
  <Frame size={size}>
    <rect x="16" y="24" width="128" height="112" rx="16" fill={palette.cream} />
    <path d="M16 56 H144" fill="none" strokeWidth={STROKE.detail} />
    <circle cx="38" cy="40" r="5" fill={palette.coral} strokeWidth={STROKE.tiny} />
    <circle cx="56" cy="40" r="5" fill={palette.yellow} strokeWidth={STROKE.tiny} />
    <circle cx="74" cy="40" r="5" fill={palette.teal} strokeWidth={STROKE.tiny} />
    <rect x="34" y="72" width="44" height="40" rx="8" fill={palette.mint} strokeWidth={STROKE.detail} />
    <path d="M92 76 H126 M92 94 H126 M92 112 H114" fill="none" strokeWidth={STROKE.detail} />
  </Frame>
);

const cloud: CharacterRender = ({ size }) => (
  <Frame size={size}>
    <path d="M44 120 Q16 120 18 94 Q20 70 46 72 Q50 38 84 38 Q116 38 122 68 Q146 70 144 96 Q142 120 118 120 Z" fill={palette.mint} />
    <path d="M62 98 H98" fill="none" strokeWidth={STROKE.detail} />
  </Frame>
);

const database: CharacterRender = ({ size }) => (
  <Frame size={size}>
    <path d="M30 40 V120 Q30 144 80 144 Q130 144 130 120 V40" fill={palette.mint} />
    <ellipse cx="80" cy="40" rx="50" ry="20" fill={palette.tealLight} />
    <path d="M30 80 Q30 102 80 102 Q130 102 130 80" fill="none" strokeWidth={STROKE.detail} />
  </Frame>
);

const folder: CharacterRender = ({ size }) => (
  <Frame size={size}>
    <path d="M16 46 Q16 32 30 32 H62 L76 48 H130 Q144 48 144 62 V120 Q144 134 130 134 H30 Q16 134 16 120 Z" fill={palette.yellow} />
    <path d="M16 70 H144" fill="none" strokeWidth={STROKE.detail} />
  </Frame>
);

const image: CharacterRender = ({ size, color = palette.cream }) => (
  <Frame size={size}>
    <rect x="18" y="28" width="124" height="104" rx="14" fill={color} />
    <path d="M18 120 L58 74 L84 104 L104 82 L142 122 V118 Q142 132 128 132 H32 Q18 132 18 118 Z" fill={palette.teal} strokeWidth={STROKE.detail} />
    <circle cx="106" cy="56" r="12" fill={palette.yellow} strokeWidth={STROKE.detail} />
  </Frame>
);

const lock: CharacterRender = ({ size }) => (
  <Frame size={size}>
    <path d="M50 74 V54 Q50 22 80 22 Q110 22 110 54 V74" fill="none" strokeWidth={STROKE.handle} />
    <rect x="30" y="70" width="100" height="72" rx="16" fill={palette.yellow} />
    <circle cx="80" cy="102" r="9" fill={palette.ink} />
    <path d="M80 108 V124" fill="none" />
  </Frame>
);

const funnel: CharacterRender = ({ size }) => (
  <Frame size={size}>
    <path d="M20 34 H140 L96 92 V132 L64 144 V92 Z" fill={palette.tealLight} />
    <path d="M34 50 H126" fill="none" strokeWidth={STROKE.detail} />
  </Frame>
);

const clock: CharacterRender = ({ size, rotate = 0 }) => (
  <Frame size={size}>
    <circle cx="80" cy="82" r="56" fill={palette.cream} />
    <path d="M80 82 V46" fill="none" />
    <g transform={`rotate(${rotate} 80 82)`}><path d="M80 82 L106 82" fill="none" stroke={palette.coral} /></g>
    <circle cx="80" cy="82" r="6" fill={palette.ink} />
    <path d="M52 22 L40 12 M108 22 L120 12" fill="none" />
  </Frame>
);

const signpost: CharacterRender = ({ size }) => (
  <Frame size={size}>
    <rect x="72" y="22" width="16" height="122" rx="6" fill={materials.cardboard} />
    <path d="M30 34 H96 L116 50 L96 66 H30 Z" fill={palette.coral} />
    <path d="M130 78 H64 L44 94 L64 110 H130 Z" fill={palette.teal} />
  </Frame>
);

const plug: CharacterRender = ({ size }) => (
  <Frame size={size}>
    <path d="M60 18 V46 M100 18 V46" fill="none" strokeWidth={STROKE.handle} />
    <path d="M38 46 H122 V84 Q122 112 80 112 Q38 112 38 84 Z" fill={palette.coral} />
    <path d="M80 112 V144" fill="none" strokeWidth={STROKE.handle} />
  </Frame>
);

const book: CharacterRender = ({ size }) => (
  <Frame size={size}>
    <path d="M80 44 Q56 28 22 34 V122 Q56 116 80 134 Q104 116 138 122 V34 Q104 28 80 44 Z" fill={palette.cream} />
    <path d="M80 44 V134" fill="none" />
    <path d="M38 62 Q58 58 68 66 M38 82 Q58 78 68 86 M92 66 Q102 58 122 62 M92 86 Q102 78 122 82" fill="none" strokeWidth={STROKE.detail} />
  </Frame>
);

const toolbox: CharacterRender = ({ size }) => (
  <Frame size={size}>
    <path d="M56 50 V38 Q56 28 66 28 H94 Q104 28 104 38 V50" fill="none" strokeWidth={STROKE.handle} />
    <rect x="16" y="48" width="128" height="86" rx="16" fill={palette.coral} />
    <path d="M16 84 H144" fill="none" strokeWidth={STROKE.detail} />
    <rect x="66" y="74" width="28" height="22" rx="8" fill={palette.yellow} strokeWidth={STROKE.detail} />
  </Frame>
);

const bulb: CharacterRender = ({ size }) => (
  <Frame size={size}>
    <path d="M80 18 Q38 18 38 66 Q38 88 56 104 V118 H104 V104 Q122 88 122 66 Q122 18 80 18 Z" fill={palette.yellow} />
    <path d="M62 132 H98 M68 146 H92" fill="none" />
    <path d="M70 70 L80 86 L90 70" fill="none" strokeWidth={STROKE.detail} />
  </Frame>
);

export const CHARACTERS = {
  person: { zh: "人", use: "用户、开发者、请求的发起方", render: person },
  assistant: { zh: "助手", use: "智能体、编程助手、负责协调的程序或服务", render: assistant },
  file: { zh: "文件", use: "源码、文档、配置、被读取或处理的内容", render: file },
  box: { zh: "箱子", use: "存储、仓库、数据库、产物目录", render: box },
  server: { zh: "服务", use: "服务器、调度器、后台进程、接口", render: server },
  packet: { zh: "包裹", use: "数据、消息、请求、结果（由动作自动出现，不需要当角色）", render: packet },
  gear: { zh: "齿轮", use: "转换器、处理引擎、构建或分析流程", render: gear },
  lens: { zh: "放大镜", use: "检查、验证、审查工具（由 check 动作自动出现，不需要当角色）", render: lens },
  terminal: { zh: "终端", use: "命令行、终端、脚本运行环境", render: terminal },
  browser: { zh: "网页", use: "网站、网页界面、在线服务页面", render: browser },
  cloud: { zh: "云端", use: "云服务、远程服务器、外部网络上的服务", render: cloud },
  database: { zh: "数据库", use: "数据库、索引、成批保存的记录", render: database },
  folder: { zh: "文件夹", use: "项目目录、配置目录、一组文件", render: folder },
  image: { zh: "图片", use: "图片、画面、图层（分层动作会自动叠出多层）", render: image },
  lock: { zh: "锁", use: "权限、加密、沙箱、受限环境", render: lock },
  funnel: { zh: "漏斗", use: "过滤器、筛选条件（由 filter 动作自动出现，不需要当角色）", render: funnel },
  clock: { zh: "时钟", use: "等待、排队、定时（由 wait 动作自动出现，不需要当角色）", render: clock },
  signpost: { zh: "路牌", use: "路由、分派条件（由 route 动作自动出现，不需要当角色）", render: signpost },
  plug: { zh: "插头", use: "接口、连接器（由 connect 动作自动出现，不需要当角色）", render: plug },
  book: { zh: "书", use: "文档、说明、知识库、规范", render: book },
  toolbox: { zh: "工具箱", use: "一组工具、插件、扩展", render: toolbox },
  bulb: { zh: "灯泡", use: "想法、结论、洞察、推理结果", render: bulb },
} as const satisfies Record<string, { zh: string; use: string; render: CharacterRender }>;

export type CharacterId = keyof typeof CHARACTERS;
export function Character({ id, ...props }: CharacterProps & { id: CharacterId }) {
  return CHARACTERS[id].render(props);
}
