import test from 'node:test';
import assert from 'node:assert/strict';
import { createComposition, frameState } from '../src/composition.ts';

test('blank composition is fixed and deterministic', () => {
  const a = createComposition();
  const b = createComposition();
  assert.deepEqual(a, b);
  assert.deepEqual({ width: a.width, height: a.height, fps: a.fps }, { width: 1080, height: 1920, fps: 30 });
  assert.equal(a.durationInFrames, 150);
  assert.deepEqual(frameState(75), frameState(75));
});
