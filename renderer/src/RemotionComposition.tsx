import React from 'react';
import { AbsoluteFill } from 'remotion';
import { ContinuousCanvasWorld } from './m1/ContinuousCanvasWorld';
import type { M1CompositionProps } from './Root';

// This is the runtime composition used when the independent Remotion packages are available.
// Every visual value is derived from the Remotion frame; there is no wall clock or requestAnimationFrame.
export const CanvasWorldComposition: React.FC<M1CompositionProps> = props => {
  return <AbsoluteFill style={{ backgroundColor: '#050816' }}>
    <ContinuousCanvasWorld {...props} />
  </AbsoluteFill>;
};
