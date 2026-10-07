export type CanvasWorldInput = {
  schemaVersion: '1.0.0';
  width: 1080; height: 1920; fps: 30; durationInFrames: number;
  world: { origin: 'viewport-center'; unit: 'world'; bounds: { minX: number; maxX: number; minY: number; maxY: number } };
  elements: Array<{ id: string; type: string; position: { x: number; y: number; z: number }; persistent: boolean }>;
  background: { type: 'bezier-trajectories' | 'particle-field'; trajectoryCount: 6; color: '#E4E7EC'; opacity: number };
};

export function validateCanvasWorld(input: CanvasWorldInput): string[] {
  const errors: string[] = [];
  if (input.schemaVersion !== '1.0.0') errors.push('schemaVersion must be 1.0.0');
  if (input.width !== 1080 || input.height !== 1920) errors.push('canvas must be 1080x1920');
  if (input.fps !== 30) errors.push('fps must be 30');
  if (!Number.isInteger(input.durationInFrames) || input.durationInFrames <= 0) errors.push('durationInFrames must be positive');
  if (input.background?.trajectoryCount !== 6) errors.push('background trajectoryCount must be 6');
  if (input.background?.color !== '#E4E7EC') errors.push('background color must use visual token');
  return errors;
}

export const blankCanvas: CanvasWorldInput = {
  schemaVersion: '1.0.0', width: 1080, height: 1920, fps: 30, durationInFrames: 150,
  world: { origin: 'viewport-center', unit: 'world', bounds: { minX: -9, maxX: 9, minY: -16, maxY: 16 } },
  elements: [{ id: 'canvas-world-subject', type: 'node', position: { x: 0, y: 0, z: 0 }, persistent: true }],
  background: { type: 'bezier-trajectories', trajectoryCount: 6, color: '#E4E7EC', opacity: 0.52 }
};
