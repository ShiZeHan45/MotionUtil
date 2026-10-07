import React, { useMemo } from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { ThreeCanvas } from '@remotion/three';
import { blankCanvas } from './canvas-world';

// This is the runtime composition used when the independent Remotion packages are available.
// Every visual value is derived from the Remotion frame; there is no wall clock or requestAnimationFrame.
export const CanvasWorldComposition: React.FC<{ input?: typeof blankCanvas }> = ({ input = blankCanvas }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const progress = interpolate(frame, [0, input.durationInFrames - 1], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const rotation = useMemo(() => progress * Math.PI * 0.18, [progress]);
  return <AbsoluteFill style={{ backgroundColor: '#F7F8FA' }}>
    <ThreeCanvas width={1080} height={1920} camera={{ position: [0, 0, 32], fov: 35, near: 0.1, far: 2000 }}>
      <ambientLight intensity={0.6} />
      <mesh rotation={[0.08 * Math.sin((frame / fps) * 0.35), rotation, 0]}>
        <icosahedronGeometry args={[2.5, 1]} />
        <meshBasicMaterial color="#007AFF" wireframe transparent opacity={0.42} />
      </mesh>
    </ThreeCanvas>
  </AbsoluteFill>;
};
