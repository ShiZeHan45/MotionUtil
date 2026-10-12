import type { NarrationSegment, OperationCue, OperationSpeechPart, RenderProject } from "../types";

export const OPERATION_STEP_LABELS = ["第一步", "第二步", "第三步", "第四步", "第五步"];

function splitSteps(text: string): Array<{ stepIndex: number; text: string }> {
  const markers = [...text.matchAll(/第([一二三四五1-5])步/gu)];
  return markers.map((marker, index) => ({
    stepIndex: /^[1-5]$/u.test(marker[1]!) ? Number(marker[1]) - 1 : "一二三四五".indexOf(marker[1]!),
    text: text.slice(index === 0 ? 0 : marker.index, markers[index + 1]?.index ?? text.length).trim(),
  }));
}

/** Match display text to pronunciation overrides by step number, never by character count. */
export function operationSpeechParts(segment: NarrationSegment): OperationSpeechPart[] | undefined {
  if (segment.scene !== "workflow") return undefined;
  const display = splitSteps(segment.text);
  const spoken = splitSteps(segment.spokenText ?? segment.text);
  if (!display.length && !spoken.length) return undefined;
  if (display.length < 2 || display.length !== spoken.length
    || display.some((part, index) => part.stepIndex !== index || spoken[index]?.stepIndex !== index)) {
    throw new Error("操作口播与字幕的步骤序号不一致，请从节点 3 修复讲稿；两者需要按第一步、第二步依次排列。");
  }
  return display.map((part, index) => ({ ...part, spokenText: spoken[index]!.text }));
}

export function activeOperationCue(cues: OperationCue[], timeMs: number): OperationCue | undefined {
  // Keep the current step visible through its trailing silence, until the next voice begins.
  for (let index = cues.length - 1; index >= 0; index--) if (timeMs >= cues[index]!.startMs) return cues[index];
  return cues[0];
}

/** Reject stale, missing or out-of-range timing before rendering an ordered operation. */
export function validateOperationCues(segment: RenderProject["narrationSegments"][number], repo: string): void {
  const parts = operationSpeechParts(segment);
  if (!parts) return;
  const cues = segment.operationCues;
  const valid = cues?.length === parts.length && cues.every((cue, index) => {
    const previous = cues[index - 1];
    return cue.stepIndex === parts[index]!.stepIndex && cue.text === parts[index]!.text
      && cue.spokenText === parts[index]!.spokenText
      && Number.isFinite(cue.startMs) && Number.isFinite(cue.endMs)
      && cue.startMs >= 0 && cue.endMs > cue.startMs && cue.endMs <= segment.durationMs + 1
      && (previous ? Math.abs(cue.startMs - previous.endMs) <= 1 : cue.startMs === 0);
  });
  if (!valid) throw new Error(`${repo} 操作配音缺少有效的逐步时间戳，请从节点 4 重新生成配音后再渲染；已有讲稿无需重新生成。`);
}
