// Single source of truth for the cartoon style. Characters, actions and scenes take every colour,
// stroke width, size and easing from here; tools/check (check.tsx) rejects values outside it.
import type React from "react";

export const palette = { ink: "#14344A", teal: "#168C86", tealLight: "#B7E0D7", mint: "#D9F1EB", coral: "#EF6A55", yellow: "#F7C64B", paper: "#F7F4EB", cream: "#FFFDF6", muted: "#667780", white: "#FFFFFF" } as const;

// Extra fills that give objects their material; kept separate so the brand palette stays small.
export const materials = { skin: "#FFE3B8", cardboard: "#F2C892", glass: "rgba(217,241,235,.75)" } as const;

export const STROKE = { base: 6, detail: 5, fine: 4, tiny: 3, handle: 14 } as const;
export const CHARACTER_CANVAS = 160;
export const SHADOW = { character: "drop-shadow(0 6px 0 rgba(20,52,74,.12))", panel: "0 10px 0 rgba(20,52,74,.10)", panelFill: "rgba(255,255,255,.6)", caption: "0 8px 0 rgba(20,52,74,.12)" } as const;
export const SIZES = { actor: 170, packet: 96, packetLarge: 104, packetResult: 110, packetSmall: 64, gearSmall: 68, lens: 150, badge: 68 } as const;
export const STAGE = { width: 940, height: 900, actorArea: 700 } as const;
export const FONT_WEIGHT = { strong: 900, normal: 800 } as const;

export const allowedColors: ReadonlySet<string> = new Set([...Object.values(palette), ...Object.values(materials), "none"].map((value) => value.toLowerCase()));
export const allowedStrokeWidths: ReadonlySet<number> = new Set(Object.values(STROKE));

export const clamp = (value: number) => Math.min(1, Math.max(0, value));
export const ease = (value: number) => { const x = clamp(value); return x * x * (3 - 2 * x); };
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Progress of t between start and end, clamped to 0–1. */
export const span = (t: number, start: number, end: number) => clamp((t - start) / (end - start));

export const strokeProps = { stroke: palette.ink, strokeWidth: STROKE.base, strokeLinecap: "round", strokeLinejoin: "round" } as const satisfies React.SVGProps<SVGGElement>;
