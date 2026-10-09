import React, { useLayoutEffect, useRef } from "react";
import { cancelRender, useCurrentFrame } from "remotion";

export const VIDEO_FONT = "Arial, 'Microsoft YaHei', sans-serif";
export type TextLayout = { text: string; width: number; fontSize: number; lineHeight: number; height: number; pages: string[][] };
const layouts = new Map<string, TextLayout>();
let context: CanvasRenderingContext2D | null = null;

export function wrapText(text: string, width: number, measure: (value: string) => number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/u)) {
    let line = "";
    // Wrap Chinese by character, Latin words by token; long paths may wrap without losing characters.
    const tokens = paragraph.match(/[A-Za-z0-9_]+(?:[.-][A-Za-z0-9_]+)*|[^]/gu) ?? [];
    for (const token of tokens) {
      const pieces = measure(token) <= width ? [token] : Array.from(token);
      for (const piece of pieces) {
        if (line && measure(line + piece) > width) { lines.push(line.trimEnd()); line = ""; }
        if (!line && /^\s+$/u.test(piece)) continue;
        line += piece;
      }
    }
    lines.push(line.trimEnd());
  }
  return lines.length ? lines : [""];
}

export function textLayout(text: string, width: number, maxHeight: number, fontSize: number, minFontSize = fontSize, weight = 700): TextLayout {
  const key = JSON.stringify([text, width, maxHeight, fontSize, minFontSize, weight]);
  const cached = layouts.get(key);
  if (cached) return cached;
  if (typeof document !== "undefined") context ??= document.createElement("canvas").getContext("2d");
  let size = fontSize;
  let lines: string[] = [];
  let lineHeight = 0;
  for (; size >= minFontSize; size--) {
    if (context) context.font = `${weight} ${size}px ${VIDEO_FONT}`;
    const measure = context
      ? (value: string) => context!.measureText(value).width
      : (value: string) => Array.from(value).reduce((sum, char) => sum + (/[^\x00-\x7F]/u.test(char) ? size : size * 0.65), 0);
    lines = wrapText(text, width - 2, measure);
    lineHeight = Math.ceil(size * 1.35);
    if (lines.length * lineHeight <= maxHeight || size === minFontSize) break;
  }
  const rows = Math.floor(maxHeight / lineHeight);
  if (rows < 1) throw new Error(`文字区域不足一行：${text}`);
  const pages: string[][] = [];
  for (let index = 0; index < lines.length; index += rows) pages.push(lines.slice(index, index + rows));
  const layout = { text, width, fontSize: size, lineHeight, height: Math.min(rows, lines.length) * lineHeight, pages };
  if (layouts.size > 2_000) layouts.clear();
  layouts.set(key, layout);
  return layout;
}

export function TextBlock({ layout, name, progress = 0, style }: { layout: TextLayout; name: string; progress?: number; style?: React.CSSProperties }) {
  const page = Math.min(layout.pages.length - 1, Math.max(0, Math.floor(progress * layout.pages.length)));
  return <div data-core-text={name} data-full-text={layout.text} data-page-count={layout.pages.length} data-page-index={page} style={{ ...style, width: layout.width, maxWidth: "100%", height: layout.height, flexShrink: 0, fontSize: layout.fontSize, lineHeight: `${layout.lineHeight}px`, whiteSpace: "pre", boxSizing: "border-box" }}>
    {layout.pages[page]!.map((line, index) => <div key={index} data-text-line style={{ height: layout.lineHeight, whiteSpace: "pre" }}>{line || "\u00a0"}</div>)}
  </div>;
}

export function textProgress(frame: number, duration: number, start = 0): number {
  return Math.max(0, Math.min(1, (frame - start * duration) / Math.max(1, duration * (1 - start) - 1)));
}

/** Check actual DOM geometry on every rendered frame, including clipping ancestors. */
export function LayoutGuard({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const frame = useCurrentFrame();
  useLayoutEffect(() => {
    if (!ref.current) return;
    // Remotion briefly mounts compositions at zero size while reading metadata.
    if (ref.current.getBoundingClientRect().width === 0) return;
    for (const element of ref.current.querySelectorAll<HTMLElement>("[data-core-text]")) {
      const name = element.dataset.coreText;
      if (element.scrollHeight > element.clientHeight + 1 || element.scrollWidth > element.clientWidth + 1) {
        cancelRender(new Error(`文字布局失败：${name}，帧 ${frame}，${element.scrollWidth}×${element.scrollHeight} 超过 ${element.clientWidth}×${element.clientHeight}`));
        return;
      }
      const rect = element.getBoundingClientRect();
      for (let ancestor = element.parentElement; ancestor && ancestor !== ref.current; ancestor = ancestor.parentElement) {
        if (!ancestor.hasAttribute("data-text-region")) continue;
        const bounds = ancestor.getBoundingClientRect();
        if (rect.left < bounds.left - 1 || rect.right > bounds.right + 1 || rect.top < bounds.top - 1 || rect.bottom > bounds.bottom + 1) {
          cancelRender(new Error(`文字布局失败：${name}，帧 ${frame}，文字超出 ${ancestor.dataset.textRegion}`));
          return;
        }
      }
    }
  });
  return <div ref={ref} style={{ position: "absolute", inset: 0 }}>{children}</div>;
}
