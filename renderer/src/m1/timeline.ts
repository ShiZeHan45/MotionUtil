export type TimelineBeat = { id: string; chapter: 'opening' | 'principle' | 'case' | 'application' | 'conclusion'; subtitleText: string; durationMs: number; hook?: boolean };
export type SubtitleCue = { index: number; beatId: string; startMs: number; endMs: number; text: string };
export type ChapterTimeline = { id: TimelineBeat['chapter']; startFrame: number; endFrame: number; hookFrames: number };
export type BeatTimeline = TimelineBeat & { startFrame: number; endFrame: number; durationFrames: number };

export const CHAPTER_LABELS = ['开场', '原理', '案例', '应用', '结论'] as const;
export const FPS = 30;

export function buildTimeline(beats: TimelineBeat[], fps = FPS) {
  const cues: SubtitleCue[] = [];
  const beatTimeline: BeatTimeline[] = [];
  const chapters = new Map<TimelineBeat['chapter'], { startMs: number; endMs: number; hookMs: number }>();
  let cursor = 0;
  for (const beat of beats) {
    const startMs = cursor;
    const endMs = cursor + Math.max(1, beat.durationMs);
    cues.push({ index: cues.length + 1, beatId: beat.id, startMs, endMs, text: beat.subtitleText });
    const startFrame = Math.round(startMs * fps / 1000);
    const endFrame = Math.max(startFrame + 1, Math.round(endMs * fps / 1000));
    beatTimeline.push({ ...beat, startFrame, endFrame, durationFrames: endFrame - startFrame });
    const chapter = chapters.get(beat.chapter) ?? { startMs, endMs, hookMs: 0 };
    chapter.endMs = endMs;
    if (beat.hook) chapter.hookMs += beat.durationMs;
    chapters.set(beat.chapter, chapter);
    cursor = endMs;
  }
  const totalFrames = Math.max(1, Math.ceil(cursor * fps / 1000));
  const chapterTimeline = (['opening', 'principle', 'case', 'application', 'conclusion'] as const).map(id => {
    const value = chapters.get(id) ?? { startMs: cursor, endMs: cursor, hookMs: 0 };
    return { id, startFrame: Math.round(value.startMs * fps / 1000), endFrame: Math.round(value.endMs * fps / 1000), hookFrames: Math.round(value.hookMs * fps / 1000) };
  });
  return { cues, beats: beatTimeline, chapters: chapterTimeline, totalDurationInFrames: totalFrames };
}

function twoDigits(value: number) { return String(Math.floor(value)).padStart(2, '0'); }
function timestamp(ms: number, separator = ',') { const hours = Math.floor(ms / 3600000); const minutes = Math.floor((ms % 3600000) / 60000); const seconds = Math.floor((ms % 60000) / 1000); const millis = Math.floor(ms % 1000); return `${twoDigits(hours)}:${twoDigits(minutes)}:${twoDigits(seconds)}${separator}${String(millis).padStart(3, '0')}`; }
export function toSrt(cues: SubtitleCue[]) { return cues.map(cue => `${cue.index}\n${timestamp(cue.startMs)} --> ${timestamp(cue.endMs)}\n${cue.text}\n`).join('\n'); }

export function progressAtFrame(frame: number, totalDurationInFrames: number, chapters: ChapterTimeline[]) {
  const totalProgress = Math.max(0, Math.min(1, frame / Math.max(1, totalDurationInFrames - 1)));
  const current = chapters.findIndex(chapter => frame >= chapter.startFrame && frame < chapter.endFrame);
  const activeIndex = current < 0 && frame >= (chapters.at(-1)?.endFrame ?? 0) ? chapters.length - 1 : Math.max(0, current);
  const cells = chapters.map((chapter, index) => ({
    id: chapter.id,
    fill: index < activeIndex ? 1 : index > activeIndex ? 0 : Math.max(0, Math.min(1, (frame - chapter.startFrame) / Math.max(1, chapter.endFrame - chapter.startFrame))),
  }));
  return { totalProgress, activeChapter: chapters[activeIndex]?.id ?? 'opening', cells };
}
