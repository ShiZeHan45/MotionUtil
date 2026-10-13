import React from "react";
import type { ActionCategory } from "./categories";
import { Character } from "./characters";
import { clamp, ease, lerp, palette, SIZES, span } from "./style";

export type Point = { x: number; y: number };
export type ActionProps = { from: Point; to: Point; t: number };
type ActionRender = (props: ActionProps) => React.ReactElement;

const at = (point: Point, size: number, extra = ""): React.CSSProperties => ({ position: "absolute", left: point.x - size / 2, top: point.y - size / 2, width: size, height: size, transform: extra || undefined });

function Trail({ from, to, t }: ActionProps) {
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  const angle = Math.atan2(to.y - from.y, to.x - from.x) * 180 / Math.PI;
  return <div style={{ position: "absolute", left: from.x, top: from.y - 3, width: length, height: 0, borderTop: `6px dotted ${palette.tealLight}`, transformOrigin: "0 50%", transform: `rotate(${angle}deg)`, opacity: 0.9 * (1 - span(t, 0.85, 1)) }} />;
}

const send: ActionRender = (props) => {
  const { from, to, t } = props;
  const move = ease(span(t, 0.1, 0.9));
  const hop = Math.sin(move * Math.PI) * 44;
  return <>
    <Trail {...props} />
    <div style={at({ x: lerp(from.x, to.x, move), y: lerp(from.y, to.y, move) - hop }, SIZES.packet)}><Character id="packet" size={SIZES.packet} /></div>
  </>;
};

const transform: ActionRender = (props) => {
  const { from, to, t } = props;
  const travel = ease(span(t, 0, 0.35));
  const shrink = 1 - ease(span(t, 0.35, 0.55));
  const pop = ease(span(t, 0.6, 0.85));
  return <>
    <Trail {...props} />
    {shrink > 0.02 && <div style={at({ x: lerp(from.x, to.x, travel), y: lerp(from.y, to.y, travel) }, SIZES.packet, `scale(${shrink})`)}><Character id="packet" size={SIZES.packet} /></div>}
    {t > 0.3 && t < 0.75 && <div style={at({ x: to.x - 96, y: to.y - 104 }, SIZES.gearSmall, `rotate(${t * 720}deg)`)}><Character id="gear" size={SIZES.gearSmall} rotate={t * 720} /></div>}
    {pop > 0 && <div style={at({ x: to.x + 40 * pop, y: to.y - 96 * pop }, SIZES.packetLarge, `scale(${0.6 + 0.4 * pop}) rotate(${(1 - pop) * -40}deg)`)}><Character id="packet" size={SIZES.packetLarge} color={palette.teal} /></div>}
  </>;
};

const store: ActionRender = (props) => {
  const { from, to, t } = props;
  const move = ease(span(t, 0.05, 0.6));
  const drop = ease(span(t, 0.6, 0.85));
  const lift = Math.sin(move * Math.PI) * 40;
  return <>
    <Trail {...props} />
    {drop < 0.98 && <div style={at({ x: lerp(from.x, to.x, move), y: lerp(from.y, to.y, move) - lift + drop * 50 }, SIZES.packet, `scale(${1 - drop * 0.7})`)}><Character id="packet" size={SIZES.packet} /></div>}
    {t > 0.85 && <div style={{ ...at({ x: to.x + 70, y: to.y - 80 }, SIZES.badge - 12), borderRadius: "50%", background: palette.teal, color: palette.white, display: "grid", placeItems: "center", fontSize: 28, fontWeight: 900, border: `4px solid ${palette.ink}` }}>✓</div>}
  </>;
};

const check: ActionRender = ({ from, to, t }) => {
  const sweep = Math.sin(span(t, 0.05, 0.7) * Math.PI * 2) * 64;
  const arrive = ease(span(t, 0, 0.2));
  const done = ease(span(t, 0.72, 0.9));
  return <>
    <div style={at({ x: lerp(from.x + 40, to.x + 60 + sweep, arrive), y: lerp(from.y - 40, to.y - 40, arrive) }, SIZES.lens, `rotate(-8deg)`)}><Character id="lens" size={SIZES.lens} /></div>
    {done > 0 && <div style={{ ...at({ x: to.x + 80, y: to.y - 90 }, SIZES.badge, `scale(${done})`), borderRadius: "50%", background: palette.teal, color: palette.white, display: "grid", placeItems: "center", fontSize: 36, fontWeight: 900, border: `5px solid ${palette.ink}` }}>✓</div>}
  </>;
};

const split: ActionRender = ({ from, to, t }) => {
  const fly = ease(span(t, 0.3, 0.85));
  const offsets = [-104, 0, 104];
  return <>
    {t < 0.3 && <div style={at({ x: from.x, y: from.y }, SIZES.packetLarge, `scale(${1 + Math.sin(t / 0.3 * Math.PI) * 0.12})`)}><Character id="packet" size={SIZES.packetLarge} /></div>}
    {t >= 0.3 && offsets.map((dx, index) => (
      <div key={index} style={at({ x: lerp(from.x, to.x + dx, fly), y: lerp(from.y, to.y + (index === 1 ? -30 : 20), fly) - Math.sin(fly * Math.PI) * 30 }, SIZES.packetSmall)}><Character id="packet" size={SIZES.packetSmall} color={[palette.yellow, palette.coral, palette.teal][index]} /></div>
    ))}
  </>;
};

const merge: ActionRender = ({ from, to, t }) => {
  const gather = ease(span(t, 0.1, 0.7));
  const whole = ease(span(t, 0.7, 0.9));
  const offsets = [-104, 0, 104];
  return <>
    {whole < 0.5 && offsets.map((dx, index) => (
      <div key={index} style={at({ x: lerp(from.x + dx, to.x, gather), y: lerp(from.y + (index === 1 ? -30 : 20), to.y, gather) }, SIZES.packetSmall * (1 - whole))}><Character id="packet" size={SIZES.packetSmall * (1 - whole)} color={[palette.yellow, palette.coral, palette.teal][index]} /></div>
    ))}
    {whole > 0 && <div style={at({ x: to.x, y: to.y }, SIZES.packetResult, `scale(${whole})`)}><Character id="packet" size={SIZES.packetResult} color={palette.teal} /></div>}
  </>;
};

// Categories without an entry here cannot be drawn yet; scenes using them fall back to the card diagram.
export const ACTIONS: Partial<Record<ActionCategory, ActionRender>> = { send, transform, store, check, split, merge };

export function canRender(category: ActionCategory): boolean {
  return category in ACTIONS;
}

export function ActionLayer({ category, ...props }: ActionProps & { category: ActionCategory }) {
  const render = ACTIONS[category];
  return render ? render(props) : <></>;
}
