import React from "react";

export const palette = { ink: "#14344A", teal: "#168C86", tealLight: "#B7E0D7", mint: "#D9F1EB", coral: "#EF6A55", yellow: "#F7C64B", paper: "#F7F4EB", cream: "#FFFDF6", muted: "#667780" };

export type CharacterProps = { size: number; color?: string; rotate?: number };
type CharacterRender = (props: CharacterProps) => React.ReactElement;

const stroke = { stroke: palette.ink, strokeWidth: 6, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const Frame: React.FC<{ size: number; children: React.ReactNode }> = ({ size, children }) => (
  <svg viewBox="0 0 160 160" width={size} height={size} style={{ filter: "drop-shadow(0 6px 0 rgba(20,52,74,.12))", overflow: "visible" }}>
    <g {...stroke}>{children}</g>
  </svg>
);
const Eyes: React.FC<{ y: number; gap?: number }> = ({ y, gap = 22 }) => (
  <g stroke="none" fill={palette.ink}><ellipse cx={80 - gap / 2} cy={y} rx="5" ry="7" /><ellipse cx={80 + gap / 2} cy={y} rx="5" ry="7" /></g>
);

const person: CharacterRender = ({ size }) => (
  <Frame size={size}>
    <path d="M32 150 Q32 100 80 100 Q128 100 128 150 Z" fill={palette.teal} />
    <circle cx="80" cy="62" r="38" fill="#FFE3B8" />
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
    <rect x="38" y="46" width="84" height="62" rx="26" fill={palette.cream} strokeWidth={5} />
    <Eyes y={74} />
    <path d="M68 92 Q80 102 92 92" fill="none" strokeWidth={5} />
    <rect x="54" y="136" width="52" height="16" rx="8" fill={palette.teal} />
  </Frame>
);

const file: CharacterRender = ({ size }) => (
  <Frame size={size}>
    <path d="M38 18 H98 L130 50 V142 H38 Z" fill={palette.cream} />
    <path d="M98 18 V50 H130" fill={palette.tealLight} />
    <path d="M54 78 H114 M54 98 H114 M54 118 H92" fill="none" strokeWidth={5} />
  </Frame>
);

const box: CharacterRender = ({ size }) => (
  <Frame size={size}>
    <path d="M22 62 H138 V138 H22 Z" fill="#F2C892" />
    <rect x="14" y="36" width="132" height="30" rx="8" fill={palette.coral} />
    <rect x="62" y="82" width="36" height="14" rx="7" fill={palette.cream} strokeWidth={5} />
  </Frame>
);

const server: CharacterRender = ({ size }) => (
  <Frame size={size}>
    {[22, 62, 102].map((y) => <g key={y}>
      <rect x="22" y={y} width="116" height="34" rx="10" fill={palette.mint} />
      <circle cx="46" cy={y + 17} r="5" fill={palette.coral} strokeWidth={3} />
      <circle cx="64" cy={y + 17} r="5" fill={palette.yellow} strokeWidth={3} />
      <path d={`M88 ${y + 17} H122`} fill="none" strokeWidth={5} />
    </g>)}
  </Frame>
);

const packet: CharacterRender = ({ size, color = palette.yellow }) => (
  <Frame size={size}>
    <rect x="26" y="44" width="108" height="86" rx="14" fill={color} />
    <path d="M80 44 V130" fill="none" />
    <path d="M26 74 H134" fill="none" strokeWidth={4} />
    <path d="M80 44 Q62 16 52 34 Q56 48 80 44 Q104 48 108 34 Q98 16 80 44" fill={palette.cream} strokeWidth={4} />
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
    <path d="M100 100 L140 142" fill="none" strokeWidth={14} />
    <circle cx="70" cy="68" r="44" fill="rgba(217,241,235,.75)" />
    <path d="M44 56 Q52 38 70 36" fill="none" strokeWidth={5} stroke={palette.cream} />
  </Frame>
);

export const CHARACTERS = {
  person: { zh: "人", render: person },
  assistant: { zh: "助手", render: assistant },
  file: { zh: "文件", render: file },
  box: { zh: "箱子", render: box },
  server: { zh: "服务", render: server },
  packet: { zh: "包裹", render: packet },
  gear: { zh: "齿轮", render: gear },
  lens: { zh: "放大镜", render: lens },
} as const satisfies Record<string, { zh: string; render: CharacterRender }>;

export type CharacterId = keyof typeof CHARACTERS;
export function Character({ id, ...props }: CharacterProps & { id: CharacterId }) {
  return CHARACTERS[id].render(props);
}
