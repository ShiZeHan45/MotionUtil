import React from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame } from 'remotion';
import { OpeningGalaxy } from './OpeningGalaxy.tsx';
import { ProgressBar } from './ProgressBar.tsx';
import type { ChapterTimeline } from './timeline.ts';

export type ContinuousCanvasWorldProps = { projectName: string; starCount: number; starCountSpoken: string; projectNames: string[]; totalDurationInFrames: number; chapters: ChapterTimeline[]; beats: Array<{ id: string; chapter: ChapterTimeline['id']; subtitleText: string; startFrame: number; endFrame: number; durationFrames: number; hook?: boolean }>; audioFiles: Array<{ beatId: string; publicPath: string; volume?: number }>; bgmFile?: string };
export const ContinuousCanvasWorld: React.FC<ContinuousCanvasWorldProps> = props => {
  const frame = useCurrentFrame();
  const openingEnd = props.chapters.find(chapter => chapter.id === 'opening')?.endFrame ?? Math.min(360, props.totalDurationInFrames);
  const activeBeat = props.beats.find(beat => frame >= beat.startFrame && frame < beat.endFrame) ?? props.beats.at(-1);
  return <AbsoluteFill style={{ backgroundColor: '#0A1028' }}>
    {frame <= openingEnd ? <OpeningGalaxy {...props} durationInFrames={Math.max(1, openingEnd)} /> : <AbsoluteFill style={{ backgroundColor: '#0A1028' }}><div style={{ position: 'absolute', inset: 0, opacity: 0.25, background: 'repeating-linear-gradient(115deg, transparent 0 90px, #4CC9F0 91px 93px, transparent 94px 180px)', transform: `translateX(${(frame % 180) - 180}px)` }} /><div style={{ position: 'absolute', top: 680, left: 72, right: 72, color: '#F8FAFC', fontFamily: 'Arial, sans-serif', fontSize: 42, textAlign: 'center' }}>CanvasWorld · {props.projectName}</div></AbsoluteFill>}
    {props.audioFiles.map(audio => {
      const beat = props.beats.find(item => item.id === audio.beatId);
      if (!beat) return null;
      return <Sequence key={audio.beatId} from={beat.startFrame} durationInFrames={beat.durationFrames} name={`voice-${audio.beatId}`}><Audio src={staticFile(audio.publicPath)} volume={audio.volume ?? 1} /></Sequence>;
    })}
    {props.bgmFile ? <Audio src={staticFile(props.bgmFile)} volume={0.08} loop /> : null}
    {activeBeat ? <div style={{ position: 'absolute', left: 72, right: 72, bottom: 150, color: '#F8FAFC', fontFamily: 'Arial, sans-serif', fontSize: 30, lineHeight: 1.35, textAlign: 'center', textShadow: '0 2px 12px rgba(0,0,0,.35)' }}>{activeBeat.subtitleText}</div> : null}
    <ProgressBar totalDurationInFrames={props.totalDurationInFrames} chapters={props.chapters} />
  </AbsoluteFill>;
};
