import type { NarrationSegment, OpeningCue, OpeningSpeechPart, RenderProject } from "../types";

type OpeningHookText = { text: string; spokenText?: string };

function applySubstitutions(text: string, substitutions: Array<[string, string]>): string {
  let result = text;
  for (const [source, replacement] of substitutions) {
    const escaped = source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(new RegExp(escaped, "gi"), replacement);
  }
  return result;
}

/** Split the opening into the knowledge hook and the ranking sentence, so the picture can follow the real voice. */
export function openingSpeechParts(segment: NarrationSegment, hook: OpeningHookText | undefined, substitutions: Array<[string, string]> = []): OpeningSpeechPart[] | undefined {
  if (segment.scene !== "intro" || !hook) return undefined;
  if (!segment.text.startsWith(hook.text)) throw new Error("开场字幕没有以所选知识钩子开头，请从节点 3 修复讲稿。");
  const rankText = segment.text.slice(hook.text.length).trim();
  if (!rankText) return undefined;
  const spoken = segment.spokenText ?? segment.text;
  const hookSpoken = applySubstitutions(hook.spokenText ?? hook.text, substitutions);
  const rankSpoken = spoken.slice(hookSpoken.length).trim();
  if (!spoken.startsWith(hookSpoken) || !rankSpoken) throw new Error("开场口播没有以所选知识钩子开头，请从节点 3 修复讲稿。");
  return [
    { cueId: "hook", text: hook.text, spokenText: hookSpoken },
    { cueId: "rank", text: rankText, spokenText: rankSpoken },
  ];
}

/** Reject missing or stale opening timing before the picture is synchronised to it. */
export function validateOpeningCues(segment: RenderProject["narrationSegments"][number], repo: string, hook: OpeningHookText | undefined): void {
  if (segment.scene !== "intro" || !hook || !segment.text.startsWith(hook.text)) return;
  const rankText = segment.text.slice(hook.text.length).trim();
  if (!rankText) return;
  const cues = segment.openingCues;
  const [first, second] = cues ?? [];
  const valid = cues?.length === 2 && first!.cueId === "hook" && second!.cueId === "rank"
    && first!.text === hook.text && second!.text === rankText
    && segment.spokenText.startsWith(first!.spokenText) && segment.spokenText.endsWith(second!.spokenText)
    && cues.every((cue) => Number.isFinite(cue.startMs) && Number.isFinite(cue.endMs) && cue.endMs > cue.startMs)
    && first!.startMs === 0 && Math.abs(second!.startMs - first!.endMs) <= 1 && second!.endMs <= segment.durationMs + 1;
  if (!valid) throw new Error(`${repo} 开场配音缺少有效的分句时间戳，请从节点 4 重新生成配音后再渲染；已有讲稿无需重新生成。`);
}

export type OpeningTiming = { hookEndMs: number; hasHook: boolean };

/** Without a hook plan the whole opening is the ranking sentence, so the camera moves in from the start. */
export function openingTiming(cues: OpeningCue[] | undefined): OpeningTiming {
  const hook = cues?.find((cue) => cue.cueId === "hook");
  return hook ? { hookEndMs: hook.endMs, hasHook: true } : { hookEndMs: 0, hasHook: false };
}
