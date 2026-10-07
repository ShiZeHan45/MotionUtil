import { blankCanvas, validateCanvasWorld, type CanvasWorldInput } from './canvas-world.ts';

export type CompositionSpec = { id: 'CanvasWorld'; width: 1080; height: 1920; fps: 30; durationInFrames: number; input: CanvasWorldInput };

export function createComposition(input: CanvasWorldInput = blankCanvas): CompositionSpec {
  const errors = validateCanvasWorld(input);
  if (errors.length) throw new Error(`CanvasWorld validation failed: ${errors.join('; ')}`);
  return { id: 'CanvasWorld', width: 1080, height: 1920, fps: 30, durationInFrames: input.durationInFrames, input };
}

export function frameState(frame: number, input = blankCanvas) {
  const t = Math.max(0, Math.min(1, frame / Math.max(1, input.durationInFrames - 1)));
  return { frame, progress: t, trajectoryOffset: t * 360, subjectScale: 1 + 0.08 * Math.sin(t * Math.PI * 2) };
}
