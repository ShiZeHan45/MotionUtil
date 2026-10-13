import React from "react";
import type { ActionCategory } from "./categories";
import { Character } from "./characters";
import { PAYLOAD_COLORS, ease, lerp, palette, payloadColor, SIZES, span, STROKE } from "./style";
import { TextBlock, textLayout } from "../text-layout";

export type Point = { x: number; y: number };
export type ActionProps = { from: Point; to: Point; t: number; payload?: string; becomes?: string; label?: string; becomesLabel?: string };
type ActionRender = (props: ActionProps) => React.ReactElement;

const at = (point: Point, size: number, extra = ""): React.CSSProperties => ({ position: "absolute", left: point.x - size / 2, top: point.y - size / 2, width: size, height: size, transform: extra || undefined });
const mix = (a: Point, b: Point, u: number): Point => ({ x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u) });
const hopAt = (a: Point, b: Point, u: number, height: number): Point => { const p = mix(a, b, u); return { x: p.x, y: p.y - Math.sin(u * Math.PI) * height }; };
const mid = (a: Point, b: Point): Point => mix(a, b, 0.5);
const others = (name: string | undefined) => (Object.keys(PAYLOAD_COLORS) as Array<keyof typeof PAYLOAD_COLORS>).filter((key) => key !== (name ?? "yellow"));
const nextColor = (payload: string | undefined, becomes: string | undefined) => becomes ?? others(payload)[payload === "teal" ? 0 : 1]!;
const BOLT = "M64 6 L26 68 H56 L44 114 L98 46 H68 Z";

function Chip({ point, text }: { point: Point; text?: string }) {
  if (!text) return null;
  return <div data-text-region="包裹标签" style={{ position: "absolute", left: point.x - 100, top: point.y, width: 200, display: "flex", justifyContent: "center" }}>
    <div style={{ borderRadius: 99, padding: "1px 12px", background: palette.cream, border: `${STROKE.tiny}px solid ${palette.ink}` }}>
      <TextBlock layout={textLayout(text, 150, 34, 24, 18, 800)} name="包裹标签文字" style={{ color: palette.ink, textAlign: "center", fontWeight: 800 }} />
    </div>
  </div>;
}

function Parcel({ point, size = SIZES.packet, color, scale = 1, opacity = 1, label }: { point: Point; size?: number; color: string; scale?: number; opacity?: number; label?: string }) {
  return <>
    <div style={{ ...at(point, size, `scale(${scale})`), opacity }}><Character id="packet" size={size} color={color} /></div>
    {opacity > 0.4 && scale > 0.5 && <Chip point={{ x: point.x, y: point.y + size / 2 + 4 }} text={label} />}
  </>;
}

function Badge({ point, glyph, color = palette.teal, size = SIZES.badge - 12, scale = 1 }: { point: Point; glyph: string; color?: string; size?: number; scale?: number }) {
  return <div style={{ ...at(point, size, `scale(${scale})`), borderRadius: "50%", background: color, color: palette.white, display: "grid", placeItems: "center", fontSize: size * 0.55, fontWeight: 900, border: `${STROKE.detail}px solid ${palette.ink}` }}>{glyph}</div>;
}

function Cross({ point, scale = 1 }: { point: Point; scale?: number }) {
  return <div style={{ ...at(point, SIZES.badge - 12, `scale(${scale})`), borderRadius: "50%", background: palette.coral, border: `${STROKE.detail}px solid ${palette.ink}`, display: "grid", placeItems: "center" }}>
    <svg viewBox="0 0 40 40" width="30" height="30"><path d="M10 10 L30 30 M30 10 L10 30" stroke={palette.white} strokeWidth={STROKE.base} strokeLinecap="round" fill="none" /></svg>
  </div>;
}

function Sparkle({ point, size, rotate = 0, opacity = 1 }: { point: Point; size: number; rotate?: number; opacity?: number }) {
  return <svg viewBox="0 0 40 40" style={{ ...at(point, size, `rotate(${rotate}deg)`), opacity, overflow: "visible" }}>
    <path d="M20 2 Q23 17 38 20 Q23 23 20 38 Q17 23 2 20 Q17 17 20 2 Z" fill={palette.yellow} stroke={palette.ink} strokeWidth={STROKE.tiny} strokeLinejoin="round" />
  </svg>;
}

function Bolt({ point, size, scale = 1 }: { point: Point; size: number; scale?: number }) {
  return <svg viewBox="0 0 120 120" style={{ ...at(point, size, `scale(${scale})`), overflow: "visible" }}><path d={BOLT} fill={palette.yellow} stroke={palette.ink} strokeWidth={STROKE.base} strokeLinejoin="round" /></svg>;
}

/** Dotted trail with an arrowhead just before the destination, so the viewer always sees who sends to whom. */
function Path({ from, to, t, color = palette.tealLight }: { from: Point; to: Point; t: number; color?: string }) {
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  const angle = Math.atan2(to.y - from.y, to.x - from.x) * 180 / Math.PI;
  const fade = 1 - span(t, 0.85, 1);
  const unit = { x: (to.x - from.x) / (length || 1), y: (to.y - from.y) / (length || 1) };
  const head = { x: to.x - unit.x * 108, y: to.y - unit.y * 108 };
  return <>
    <div style={{ position: "absolute", left: from.x, top: from.y - 3, width: length, height: 0, borderTop: `${STROKE.base}px dotted ${color}`, transformOrigin: "0 50%", transform: `rotate(${angle}deg)`, opacity: 0.9 * fade }} />
    <svg viewBox="0 0 40 40" style={{ ...at(head, 44, `rotate(${angle}deg)`), opacity: fade * span(t, 0, 0.12), overflow: "visible" }}>
      <path d="M6 6 L36 20 L6 34 Z" fill={palette.teal} stroke={palette.ink} strokeWidth={STROKE.fine} strokeLinejoin="round" />
    </svg>
  </>;
}

function Ring({ point, t, color = palette.teal }: { point: Point; t: number; color?: string }) {
  const radius = 70 + 70 * ease(t);
  return <div style={{ position: "absolute", left: point.x - radius, top: point.y - radius, width: radius * 2, height: radius * 2, borderRadius: "50%", border: `${STROKE.base}px solid ${color}`, opacity: 0.9 * (1 - span(t, 0.7, 1)) }} />;
}

const introduce: ActionRender = ({ to, t }) => <Ring point={to} t={span(t, 0.05, 0.8)} />;

const send: ActionRender = (props) => {
  const { from, to, t } = props;
  const move = ease(span(t, 0.1, 0.9));
  return <><Path {...props} /><Parcel point={hopAt(from, to, move, 44)} color={payloadColor(props.payload)} label={props.label} /></>;
};

const receive: ActionRender = (props) => {
  const { from, to, t } = props;
  const move = ease(span(t, 0.05, 0.5));
  const settle = ease(span(t, 0.5, 0.7));
  const ack = ease(span(t, 0.65, 0.95));
  const bounce = 1 + Math.sin(span(t, 0.5, 0.65) * Math.PI) * 0.15;
  return <>
    <Path {...props} />
    <Parcel point={hopAt(from, to, move, 36)} scale={bounce * (1 - settle * 0.6)} opacity={1 - settle * 0.7} color={payloadColor(props.payload)} label={props.label} />
    {t > 0.6 && <Badge point={hopAt(to, from, ack, 30)} glyph="✓" scale={0.5 + ack * 0.5} />}
  </>;
};

const transform: ActionRender = (props) => {
  const { from, to, t } = props;
  // The conversion happens on the converter itself: the parcel shrinks into it, the gear turns on its shoulder,
  // and a parcel of the new colour pops out and travels to the receiver.
  const shrink = ease(span(t, 0.2, 0.45));
  const pop = ease(span(t, 0.5, 0.65));
  const fly = ease(span(t, 0.65, 0.95));
  const next = payloadColor(nextColor(props.payload, props.becomes));
  return <>
    {t < 0.5 && <Parcel point={{ x: from.x, y: from.y - 6 }} size={SIZES.packetLarge} scale={1 - shrink} color={payloadColor(props.payload)} />}
    {t > 0.15 && t < 0.75 && <div style={at({ x: from.x + 76, y: from.y - 70 }, SIZES.gearSmall + 8, `rotate(${t * 720}deg)`)}><Character id="gear" size={SIZES.gearSmall + 8} rotate={t * 720} /></div>}
    {t >= 0.5 && <Parcel point={t < 0.65 ? { x: from.x, y: from.y - 6 } : hopAt(from, to, fly, 40)} size={SIZES.packetLarge} scale={0.5 + 0.5 * pop} color={next} label={t > 0.78 ? props.becomesLabel : undefined} />}
    {t > 0.65 && <Path from={from} to={to} t={t} />}
  </>;
};

const store: ActionRender = (props) => {
  const { from, to, t } = props;
  const move = ease(span(t, 0.05, 0.6));
  const drop = ease(span(t, 0.6, 0.85));
  const p = hopAt(from, to, move, 40);
  return <>
    <Path {...props} />
    {drop < 0.98 && <Parcel point={{ x: p.x, y: p.y + drop * 50 }} scale={1 - drop * 0.7} color={payloadColor(props.payload)} label={props.label} />}
    {t > 0.85 && <Badge point={{ x: to.x + 70, y: to.y - 80 }} glyph="✓" />}
  </>;
};

const retrieve: ActionRender = (props) => {
  const { from, to, t } = props;
  const pop = ease(span(t, 0.05, 0.25));
  const fly = ease(span(t, 0.25, 0.85));
  const bounce = 1 + Math.sin(span(t, 0.85, 1) * Math.PI) * 0.12;
  const color = payloadColor(props.payload);
  return <>
    <Path {...props} />
    <Parcel point={{ x: from.x, y: from.y - 6 }} size={SIZES.packetSmall} opacity={0.4} color={color} />
    <Parcel point={t < 0.25 ? { x: from.x, y: from.y - 40 * pop } : hopAt(from, to, fly, 44)} scale={(0.4 + 0.6 * pop) * bounce} color={color} label={props.label} />
  </>;
};

const check: ActionRender = ({ from, to, t }) => {
  const sweep = Math.sin(span(t, 0.05, 0.7) * Math.PI * 2) * 64;
  const arrive = ease(span(t, 0, 0.2));
  const done = ease(span(t, 0.72, 0.9));
  return <>
    <div style={at({ x: lerp(from.x + 40, to.x + 60 + sweep, arrive), y: lerp(from.y - 40, to.y - 40, arrive) }, SIZES.lens, "rotate(-8deg)")}><Character id="lens" size={SIZES.lens} /></div>
    {done > 0 && <Badge point={{ x: to.x + 80, y: to.y - 90 }} glyph="✓" size={SIZES.badge} scale={done} />}
  </>;
};

const split: ActionRender = (props) => {
  const { from, to, t } = props;
  const fly = ease(span(t, 0.3, 0.85));
  const color = payloadColor(props.payload);
  return <>
    {t < 0.3 && <Parcel point={from} size={SIZES.packetLarge} scale={1 + Math.sin(t / 0.3 * Math.PI) * 0.12} color={color} label={props.label} />}
    {t >= 0.3 && [-104, 0, 104].map((dx, index) => <Parcel key={index} point={{ x: lerp(from.x, to.x + dx, fly), y: lerp(from.y, to.y + (index === 1 ? -30 : 20), fly) - Math.sin(fly * Math.PI) * 30 }} size={SIZES.packetSmall} color={color} />)}
  </>;
};

const merge: ActionRender = (props) => {
  const { from, to, t } = props;
  const gather = ease(span(t, 0.1, 0.7));
  const whole = ease(span(t, 0.7, 0.9));
  const color = payloadColor(props.payload);
  return <>
    {whole < 0.5 && [-104, 0, 104].map((dx, index) => <Parcel key={index} point={{ x: lerp(from.x + dx, to.x, gather), y: lerp(from.y + (index === 1 ? -30 : 20), to.y, gather) }} size={SIZES.packetSmall} scale={1 - whole} color={color} />)}
    {whole > 0 && <Parcel point={to} size={SIZES.packetResult} scale={whole} color={payloadColor(props.becomes, props.payload)} label={props.becomesLabel ?? props.label} />}
  </>;
};

const filter: ActionRender = (props) => {
  const { from, to, t } = props;
  const gate = mid(from, to);
  const approach = ease(span(t, 0.05, 0.4));
  const reject = ease(span(t, 0.4, 0.7));
  const pass = ease(span(t, 0.5, 0.95));
  const rest = others(props.payload).map((name) => PAYLOAD_COLORS[name]);
  const lanes = [-66, 66];
  return <>
    <Path {...props} />
    <div style={at(gate, 140)}><Character id="funnel" size={140} /></div>
    {rest.map((color, index) => <React.Fragment key={index}>
      <Parcel point={{ x: lerp(from.x, gate.x, approach) + (t > 0.4 ? reject * (index ? 60 : -60) : 0), y: lerp(from.y + lanes[index]!, gate.y, approach) + reject * 110 }} size={SIZES.packetSmall + 14} opacity={1 - reject} color={color} />
      {reject > 0.2 && reject < 0.95 && <Cross point={{ x: gate.x + (index ? 90 : -90), y: gate.y + 20 + reject * 40 }} scale={0.6 + 0.4 * reject} />}
    </React.Fragment>)}
    <Parcel point={t < 0.5 ? mix(from, gate, approach) : mix(gate, to, pass)} color={payloadColor(props.payload)} label={t > 0.5 ? props.label : undefined} />
  </>;
};

const route: ActionRender = (props) => {
  const { from, to, t } = props;
  const post = mid(from, to);
  const in1 = ease(span(t, 0.05, 0.45));
  const out = ease(span(t, 0.55, 0.95));
  return <>
    <Path from={from} to={post} t={Math.min(t, 0.5)} />
    <div style={{ position: "absolute", left: post.x - 3, top: post.y + 40, width: 0, height: 110, borderLeft: `${STROKE.base}px dashed ${palette.tealLight}` }} />
    <Cross point={{ x: post.x, y: post.y + 170 }} scale={0.8} />
    <div style={at({ x: post.x, y: post.y - 20 }, 130)}><Character id="signpost" size={130} /></div>
    <Parcel point={t < 0.5 ? mix(from, post, in1) : hopAt(post, to, out, 30)} color={payloadColor(props.payload)} label={props.label} />
    {t > 0.55 && <Path from={post} to={to} t={t} />}
  </>;
};

const trigger: ActionRender = (props) => {
  const { from, to, t } = props;
  const fly = ease(span(t, 0.1, 0.65));
  const hit = span(t, 0.65, 1);
  return <>
    <Path {...props} color={palette.yellow} />
    {t < 0.7 && <Bolt point={mix(from, to, fly)} size={100} />}
    {hit > 0 && <Ring point={to} t={hit} color={palette.yellow} />}
    {hit > 0.15 && <Sparkle point={{ x: to.x + 70, y: to.y - 70 }} size={46} rotate={hit * 90} opacity={1 - hit * 0.5} />}
  </>;
};

const wait: ActionRender = (props) => {
  const { from, to, t } = props;
  const hand = ease(span(t, 0.05, 0.7)) * 360;
  const go = ease(span(t, 0.75, 0.97));
  const color = payloadColor(props.payload);
  const dir = from.x <= to.x ? -1 : 1;
  const queue = [0, 1, 2].map((index) => ({ x: to.x + dir * (122 + index * 44), y: to.y + 30 }));
  return <>
    <div style={at({ x: to.x - dir * 100, y: to.y }, 104)}><Character id="clock" size={104} rotate={hand} /></div>
    {queue.map((point, index) => <Parcel key={index} point={index === 0 ? mix(point, to, go) : point} size={52} color={color} scale={index === 0 ? 1 - go * 0.5 : 1} />)}
    {t < 0.3 && <Chip point={{ x: queue[1]!.x, y: queue[1]!.y + 40 }} text={props.label} />}
  </>;
};

const loop: ActionRender = (props) => {
  const { from, to, t } = props;
  const arrive = ease(span(t, 0, 0.3));
  const angle = span(t, 0.3, 0.9) * Math.PI * 3 - Math.PI / 2;
  const orbit = { x: to.x + Math.cos(angle) * 108, y: to.y + Math.sin(angle) * 108 };
  return <>
    <Path {...props} />
    {t > 0.25 && <div style={{ position: "absolute", left: to.x - 108, top: to.y - 108, width: 216, height: 216, borderRadius: "50%", border: `${STROKE.base}px dashed ${palette.tealLight}` }} />}
    <Parcel point={t < 0.3 ? hopAt(from, { x: to.x, y: to.y - 108 }, arrive, 30) : orbit} size={SIZES.packetSmall + 14} color={payloadColor(props.payload)} label={t < 0.3 ? props.label : undefined} />
    {t > 0.92 && <Badge point={{ x: to.x + 80, y: to.y - 90 }} glyph="✓" />}
  </>;
};

const compare: ActionRender = (props) => {
  const { from, to, t } = props;
  const pivot = mid(from, to);
  const arrive = ease(span(t, 0.05, 0.4));
  const level = ease(span(t, 0.45, 0.8));
  const angle = t > 0.4 ? (1 - level) * -14 : 0;
  const rad = angle * Math.PI / 180;
  const half = 130;
  const left = { x: pivot.x - Math.cos(rad) * half, y: pivot.y - Math.sin(rad) * half - 70 };
  const right = { x: pivot.x + Math.cos(rad) * half, y: pivot.y + Math.sin(rad) * half - 70 };
  const show = span(t, 0, 0.1);
  return <>
    <div style={{ position: "absolute", left: pivot.x - half, top: pivot.y - 4, width: half * 2, height: 0, borderTop: `${STROKE.handle}px solid ${palette.ink}`, borderRadius: 9, transformOrigin: "50% 50%", transform: `rotate(${angle}deg)`, opacity: show }} />
    <div style={{ position: "absolute", left: pivot.x - 22, top: pivot.y + 6, width: 0, height: 0, borderLeft: "22px solid transparent", borderRight: "22px solid transparent", borderBottom: `64px solid ${palette.ink}`, opacity: show }} />
    <Parcel point={mix(from, left, arrive)} size={SIZES.packetSmall + 14} color={payloadColor(props.payload)} label={props.label} />
    <Parcel point={mix(to, right, arrive)} size={SIZES.packetSmall + 14} color={payloadColor(props.becomes, "teal")} label={props.becomesLabel} />
    {t > 0.85 && <Badge point={{ x: pivot.x, y: pivot.y + 140 }} glyph="=" size={SIZES.badge} scale={ease(span(t, 0.85, 0.97))} />}
  </>;
};

const cache: ActionRender = (props) => {
  const { from, to, t } = props;
  const fetch = ease(span(t, 0.05, 0.55));
  const copy = ease(span(t, 0.6, 0.8));
  const color = payloadColor(props.payload);
  return <>
    <Path from={to} to={from} t={t} />
    {t < 0.6 && <Parcel point={hopAt(to, from, fetch, 40)} color={color} label={props.label} />}
    {copy > 0 && <Parcel point={{ x: from.x + 96, y: from.y - 96 }} size={SIZES.packetSmall + 10} scale={copy} color={color} />}
    {copy > 0.5 && <Bolt point={{ x: from.x + 150, y: from.y - 118 }} size={44} scale={copy} />}
  </>;
};

const isolate: ActionRender = (props) => {
  const { from, to, t } = props;
  const move = ease(span(t, 0.05, 0.5));
  const close = ease(span(t, 0.5, 0.8));
  const lock = ease(span(t, 0.8, 0.95));
  const size = 250 - close * 40;
  return <>
    <Path {...props} />
    {t > 0.45 && <div style={{ position: "absolute", left: to.x - size / 2, top: to.y - size / 2, width: size, height: size, borderRadius: 44, border: `${STROKE.base}px dashed ${palette.teal}`, opacity: 0.4 + close * 0.6 }} />}
    <Parcel point={hopAt(from, to, move, 36)} color={payloadColor(props.payload)} label={t > 0.5 ? undefined : props.label} />
    {lock > 0 && <div style={at({ x: to.x + 100, y: to.y - 108 }, 76, `scale(${lock})`)}><Character id="lock" size={76} /></div>}
  </>;
};

const rollback: ActionRender = (props) => {
  const { from, to, t } = props;
  const out = ease(span(t, 0, 0.4));
  const back = ease(span(t, 0.55, 0.92));
  return <>
    <Path from={from} to={to} t={Math.min(t, 0.5)} />
    <Parcel point={t < 0.5 ? hopAt(from, to, out, 36) : hopAt(to, from, back, 36)} color={payloadColor(props.payload)} label={props.label} />
    {t > 0.4 && t < 0.62 && <Cross point={{ x: to.x + 70, y: to.y - 80 }} scale={ease(span(t, 0.4, 0.5))} />}
    {t > 0.6 && <Path from={to} to={from} t={t} color={palette.coral} />}
  </>;
};

const stack: ActionRender = (props) => {
  const { to, t } = props;
  const tints = [palette.cream, palette.mint, palette.tealLight];
  return <>
    <Path {...props} />
    {tints.map((tint, index) => {
      const appear = ease(span(t, 0.1 + index * 0.25, 0.3 + index * 0.25));
      if (appear <= 0) return null;
      return <div key={index} style={at({ x: to.x + index * 18, y: to.y - index * 34 - (1 - appear) * 80 }, SIZES.layer, `rotate(${(index - 1) * 4}deg)`)}><Character id="image" size={SIZES.layer} color={tint} /></div>;
    })}
    {t > 0.8 && <Chip point={{ x: to.x + 18, y: to.y + SIZES.layer / 2 + 4 }} text={props.label} />}
  </>;
};

const connect: ActionRender = (props) => {
  const { from, to, t } = props;
  const draw = ease(span(t, 0.05, 0.75));
  const control = { x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) + 150 };
  const point = (u: number): Point => ({ x: (1 - u) ** 2 * from.x + 2 * (1 - u) * u * control.x + u * u * to.x, y: (1 - u) ** 2 * from.y + 2 * (1 - u) * u * control.y + u * u * to.y });
  const length = Math.hypot(to.x - from.x, to.y - from.y) * 1.25 + 60;
  const live = span(t, 0.8, 1);
  return <>
    <svg width="940" height="700" style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
      <path d={`M${from.x} ${from.y} Q${control.x} ${control.y} ${to.x} ${to.y}`} fill="none" stroke={live > 0 ? palette.teal : palette.ink} strokeWidth={STROKE.handle} strokeLinecap="round" strokeDasharray={length} strokeDashoffset={length * (1 - draw)} />
    </svg>
    <div style={at(point(draw), 84, "rotate(-20deg)")}><Character id="plug" size={84} /></div>
    {live > 0 && <Sparkle point={{ x: to.x + 70, y: to.y - 80 }} size={52} rotate={live * 90} />}
    {live > 0.3 && <Badge point={{ x: to.x - 70, y: to.y - 84 }} glyph="✓" scale={ease(live)} />}
  </>;
};

const ask: ActionRender = (props) => {
  const { from, to, t } = props;
  const move = ease(span(t, 0.1, 0.8));
  const p = hopAt({ x: from.x, y: from.y - 40 }, { x: to.x, y: to.y - 40 }, move, 50);
  return <>
    <Path {...props} />
    <div style={{ ...at(p, 112), borderRadius: 30, background: palette.cream, border: `${STROKE.base}px solid ${palette.ink}`, display: "grid", placeItems: "center", color: palette.teal, fontSize: 70, fontWeight: 900 }}>?</div>
    {t > 0.8 && <Ring point={to} t={span(t, 0.8, 1)} />}
  </>;
};

const create: ActionRender = (props) => {
  const { to, t } = props;
  const grow = ease(span(t, 0.3, 0.75));
  const burst = span(t, 0.4, 1);
  return <>
    <Path {...props} />
    {grow > 0 && <Parcel point={to} size={SIZES.packetResult} scale={grow} color={payloadColor(nextColor(props.payload, props.becomes))} label={t > 0.7 ? props.becomesLabel ?? props.label : undefined} />}
    {burst > 0 && [0, 1, 2, 3].map((index) => {
      const angle = index * Math.PI / 2 + Math.PI / 4;
      return <Sparkle key={index} point={{ x: to.x + Math.cos(angle) * (60 + burst * 60), y: to.y + Math.sin(angle) * (60 + burst * 60) }} size={40} rotate={burst * 180} opacity={1 - span(burst, 0.5, 1)} />;
    })}
  </>;
};

// Categories without an entry here cannot be drawn yet; scenes using them fall back to the card diagram.
export const ACTIONS: Partial<Record<ActionCategory, ActionRender>> = { introduce, send, receive, transform, store, retrieve, check, split, merge, filter, route, trigger, wait, loop, compare, cache, isolate, rollback, stack, connect, ask, create };

export function canRender(category: ActionCategory): boolean {
  return category in ACTIONS;
}

export function ActionLayer({ category, ...props }: ActionProps & { category: ActionCategory }) {
  const render = ACTIONS[category];
  return render ? render(props) : <></>;
}
