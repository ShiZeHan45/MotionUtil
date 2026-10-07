import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { progressAtFrame, type ChapterTimeline } from './timeline.ts';

const labels = ['开场', '原理', '案例', '应用', '结论'];
export const ProgressBar: React.FC<{ totalDurationInFrames: number; chapters: ChapterTimeline[] }> = ({ totalDurationInFrames, chapters }) => {
  const frame = useCurrentFrame();
  const state = progressAtFrame(frame, totalDurationInFrames, chapters);
  return <AbsoluteFill style={{ pointerEvents: 'none' }}>
    <div style={{ position: 'absolute', left: 72, top: 148, width: 936, height: 56, display: 'flex', overflow: 'hidden', borderRadius: 16, backgroundColor: '#E7EAF0', fontFamily: 'Arial, sans-serif', fontSize: 22, fontWeight: 600 }}>
      {labels.map((label, index) => <div key={label} style={{ width: 187.2, height: 56, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', color: index <= state.cells.findIndex(cell => cell.id === state.activeChapter) ? '#FFFFFF' : '#667085' }}>
        <div style={{ position: 'absolute', inset: 0, transformOrigin: 'left center', transform: `scaleX(${interpolate(state.cells[index]?.fill ?? 0, [0, 1], [0, 1])})`, backgroundColor: index < state.cells.findIndex(cell => cell.id === state.activeChapter) ? '#007AFF' : '#0A84FF' }} />
        <span style={{ position: 'relative' }}>{label}</span>
      </div>)}
    </div>
  </AbsoluteFill>;
};
