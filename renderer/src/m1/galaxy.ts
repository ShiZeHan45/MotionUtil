export type GalaxyLabel = { id: string; displayName: string; isTarget: boolean; position: { x: number; y: number; z: number }; seed: number };
export type GalaxySpec = { projectName: string; starCount: number; starCountSpoken: string; durationFrames: number; labels: GalaxyLabel[]; targetLabelId: string };
export type GalaxyParticle = { id: number; position: { x: number; y: number; z: number }; color: '#FFFFFF' | '#C7D2FE' | '#A5F3FC'; size: number };

function seeded(seed: number) { const value = Math.sin(seed * 12.9898) * 43758.5453; return value - Math.floor(value); }

export function createGalaxyLabels(projectNames: string[], targetProjectName: string, seed = 7): GalaxyLabel[] {
  const names = projectNames.slice(0, 160);
  return names.map((displayName, index) => {
    const angle = seeded(seed + index) * Math.PI * 2 + index * 0.21;
    const radius = 2.5 + seeded(seed * 3 + index) * 8;
    return { id: `label-${index + 1}`, displayName, isTarget: displayName === targetProjectName, position: { x: Math.cos(angle) * radius, y: (seeded(seed + index * 2) - 0.5) * 3, z: (seeded(seed + index * 4) - 0.5) * 3 }, seed: seed + index };
  });
}

export function galaxyCamera(frame: number, durationFrames: number) {
  const progress = Math.max(0, Math.min(1, frame / Math.max(1, durationFrames - 1)));
  const eased = 1 - Math.pow(1 - progress, 3);
  return { z: 32 + (12 - 32) * eased, rotationY: progress * (32.4 * Math.PI / 180) };
}

export function createGalaxyParticles(count = 320, seed = 7): GalaxyParticle[] {
  return Array.from({ length: count }, (_, index) => {
    const angle = seeded(seed + index * 1.7) * Math.PI * 2 + index * 0.19;
    const radius = 2.5 + seeded(seed * 2 + index * 3.1) * 11;
    const arm = Math.sin(index * 0.17) * 0.8;
    const colors: GalaxyParticle['color'][] = ['#FFFFFF', '#C7D2FE', '#A5F3FC'];
    return {
      id: index,
      position: { x: Math.cos(angle) * radius, y: (seeded(seed + index * 4.2) - 0.5) * 6 + arm, z: (seeded(seed + index * 5.3) - 0.5) * 4 },
      color: colors[index % colors.length],
      size: 0.025 + seeded(seed + index * 7.1) * 0.07,
    };
  });
}
