import React from 'react';
import { Composition } from 'remotion';
import { CanvasWorldComposition } from './RemotionComposition';
import { blankCanvas } from './canvas-world';
import type { BeatTimeline, ChapterTimeline } from './m1/timeline';

export type M1CompositionProps = {
  projectName: string;
  starCount: number;
  starCountSpoken: string;
  projectNames: string[];
  totalDurationInFrames: number;
  chapters: ChapterTimeline[];
  beats: BeatTimeline[];
  audioFiles: Array<{ beatId: string; publicPath: string; volume?: number }>;
  bgmFile?: string;
};

const fixtureProps: M1CompositionProps = {
  projectName: 'CanvasWorld',
  starCount: 12345,
  starCountSpoken: '一万两千三百四十五',
  projectNames: ['CanvasWorld', 'remotion', 'three.js', 'kokoro'],
  totalDurationInFrames: blankCanvas.durationInFrames,
  chapters: [
    { id: 'opening', startFrame: 0, endFrame: 30, hookFrames: 0 },
    { id: 'principle', startFrame: 30, endFrame: 60, hookFrames: 0 },
    { id: 'case', startFrame: 60, endFrame: 90, hookFrames: 0 },
    { id: 'application', startFrame: 90, endFrame: 120, hookFrames: 0 },
    { id: 'conclusion', startFrame: 120, endFrame: 150, hookFrames: 30 },
  ],
  beats: [],
  audioFiles: [],
};

export const RemotionRoot: React.FC = () => <Composition
  id="CanvasWorld"
  component={CanvasWorldComposition as React.FC<M1CompositionProps>}
  durationInFrames={blankCanvas.durationInFrames}
  fps={30}
  width={1080}
  height={1920}
  defaultProps={fixtureProps}
  calculateMetadata={({ props }) => ({
    durationInFrames: Math.max(1, Math.min(9000, props.totalDurationInFrames)),
    fps: 30,
    width: 1080,
    height: 1920,
  })}
/>;
