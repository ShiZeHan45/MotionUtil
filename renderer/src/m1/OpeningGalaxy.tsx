import React, { useMemo } from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { ThreeCanvas } from '@remotion/three';
import { createGalaxyLabels, createGalaxyParticles, galaxyCamera } from './galaxy.ts';

export type OpeningGalaxyProps = { projectName: string; starCount: number; starCountSpoken: string; projectNames: string[]; durationInFrames: number };

export const OpeningGalaxy: React.FC<OpeningGalaxyProps> = ({ projectName, starCount, starCountSpoken, projectNames, durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const camera = galaxyCamera(frame, durationInFrames);
  const labels = useMemo(() => createGalaxyLabels(projectNames, projectName, 7), [projectNames, projectName]);
  const particles = useMemo(() => createGalaxyParticles(320, 7), []);
  const focus = interpolate(frame, [Math.floor(durationInFrames * 0.45), Math.floor(durationInFrames * 0.8)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return <AbsoluteFill style={{ backgroundColor: '#050816', color: '#F8FAFC', overflow: 'hidden' }}>
    <ThreeCanvas width={1080} height={1920} camera={{ position: [0, 0, camera.z], fov: 35, near: 0.1, far: 2000 }}>
      <ambientLight intensity={0.4} />
      <group rotation={[0, camera.rotationY, 0]}>
        {particles.map(particle => <mesh key={particle.id} position={[particle.position.x, particle.position.y, particle.position.z]} scale={particle.size}>
          <sphereGeometry args={[1, 5, 5]} /><meshBasicMaterial color={particle.color} transparent opacity={0.72} />
        </mesh>)}
      </group>
    </ThreeCanvas>
    <div style={{ position: 'absolute', inset: 0, transform: `translateZ(0) rotate(${camera.rotationY * 180 / Math.PI}deg)`, opacity: 0.98 }}>
      {labels.map(label => <div key={label.id} style={{ position: 'absolute', left: `${540 + label.position.x * 32}px`, top: `${960 - label.position.y * 46}px`, color: label.isTarget ? '#F8FAFC' : '#B8C4D6', opacity: label.isTarget ? 1 : 0.24 + 0.2 * (1 - focus), fontSize: label.isTarget ? 32 : 16, fontWeight: label.isTarget ? 700 : 400, transform: `scale(${label.isTarget ? 1 + focus * 0.34 : 1})`, whiteSpace: 'nowrap' }}>{label.displayName}</div>)}
    </div>
    <div style={{ position: 'absolute', left: 72, right: 72, bottom: 300, opacity: focus, textAlign: 'center', fontFamily: 'Arial, sans-serif' }}>
      <div style={{ fontSize: 38, fontWeight: 700 }}>图解万物 之 GitHub 篇</div>
      <div style={{ marginTop: 20, fontSize: 28 }}>今天要介绍的是 {projectName}，截止目前已斩获 {starCountSpoken} 颗星。</div>
      <div style={{ marginTop: 30, color: '#FFD60A', fontSize: 34 }}>★ {starCount.toLocaleString('en-US')}</div>
    </div>
  </AbsoluteFill>;
};
