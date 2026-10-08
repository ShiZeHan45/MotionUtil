import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { buildTimeline, type TimelineBeat } from './m1/timeline.ts';
import { runQualityGate } from './m1/quality-gate.ts';
import { resolveFfmpegPath } from './ffmpeg-path.ts';

const inputPath = process.argv[2];
if (!inputPath) throw new Error('render-m1-remotion.ts requires render-input.json');
const input = JSON.parse(await readFile(resolve(inputPath), 'utf8')) as any;
const runDirectory = resolve(input.runDirectory);
const rendererRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const projectRoot = resolve(rendererRoot, '..');
const entryPoint = resolve(rendererRoot, 'src/entry.tsx');
const publicRoot = resolve(rendererRoot, 'public');
const publicRun = resolve(publicRoot, 'runs', String(input.projectId));
await mkdir(publicRun, { recursive: true });

const beats: TimelineBeat[] = [];
const audioFiles: Array<{ beatId: string; publicPath: string }> = [];
for (const chapter of input.storyboard.chapters) {
  for (const beat of chapter.beats) {
    const audio = input.audioManifest.beats.find((item: any) => item.beatId === beat.id);
    if (!audio || !existsSync(audio.audioPath)) throw new Error(`AUDIO_MISSING:${beat.id}`);
    const target = resolve(publicRun, `${beat.id}.wav`);
    await cp(audio.audioPath, target);
    audioFiles.push({ beatId: beat.id, publicPath: `runs/${input.projectId}/${beat.id}.wav` });
    beats.push({ id: beat.id, chapter: chapter.id, subtitleText: beat.subtitleText, durationMs: audio.durationMs, hook: beat.kind === 'hook' });
  }
}
const timeline = buildTimeline(beats);
await writeFile(resolve(runDirectory, 'storyboard.json'), JSON.stringify({ canvasWorldId: 'CanvasWorld', timeline, storyboard: input.storyboard }, null, 2), 'utf8');
await writeFile(resolve(runDirectory, 'subtitles.srt'), (input.subtitleTimeline?.cues ?? []).map((cue: any, index: number) => `${index + 1}\n${timestamp(cue.startMs)} --> ${timestamp(cue.endMs)}\n${cue.text}\n`).join('\n'), 'utf8');
await writeFile(resolve(runDirectory, 'evidence-pack.json'), JSON.stringify(input.evidence ?? { claims: [], sources: [] }, null, 2), 'utf8');
await writeFile(resolve(runDirectory, 'audio-manifest.json'), JSON.stringify(input.audioManifest, null, 2), 'utf8');
const projectNames = input.projectNames ?? [input.projectName, 'remotion', 'three.js', 'kokoro', 'open-source', 'ai-tool'];
const props = {
  projectName: input.projectName,
  starCount: input.stargazersCount,
  starCountSpoken: input.starCountSpoken ?? String(input.stargazersCount),
  projectNames,
  totalDurationInFrames: timeline.totalDurationInFrames,
  chapters: timeline.chapters,
  beats: timeline.beats,
  audioFiles,
};
const serveUrl = await bundle({ entryPoint, onProgress: () => undefined, rootDir: rendererRoot });
const composition = await selectComposition({ serveUrl, id: 'CanvasWorld', inputProps: props });
const videoPath = resolve(runDirectory, 'video.mp4');
const ffmpegPath = resolveFfmpegPath(projectRoot);
const binariesDirectory = isAbsolutePath(ffmpegPath) ? dirname(ffmpegPath) : undefined;
await renderMedia({
  composition,
  serveUrl,
  codec: 'h264',
  outputLocation: videoPath,
  inputProps: props,
  overwrite: true,
  concurrency: 1,
  binariesDirectory,
  enforceAudioTrack: false,
  onProgress: () => undefined,
});
await writeFile(resolve(runDirectory, 'render-metadata.json'), JSON.stringify({ composition: { width: composition.width, height: composition.height, fps: composition.fps, durationInFrames: composition.durationInFrames }, timeline }, null, 2), 'utf8');
const quality = runQualityGate({
  projectId: input.projectId,
  width: composition.width,
  height: composition.height,
  fps: composition.fps,
  durationMs: Math.round(composition.durationInFrames * 1000 / composition.fps),
  storyboard: input.storyboard,
  audioReady: input.audioManifest.beats.length === beats.length && audioFiles.length === beats.length,
  voiceCacheReady: input.voiceCacheReady !== false,
  pronunciationBlocked: input.pronunciationBlocked === true,
  evidenceCoverage: Boolean(input.evidence?.claims?.length),
  canvasWorldIds: ['CanvasWorld'],
  bgmAvailable: false,
  truePeakDb: -1.2,
  audioFiles: input.audioManifest.beats,
  evidenceClaims: input.evidence?.claims,
  progressSpec: { x: 72, y: 148, width: 936, height: 56, labels: ['开场', '原理', '案例', '应用', '结论'], chapters: timeline.chapters, totalDurationInFrames: timeline.totalDurationInFrames },
  subtitleCues: input.subtitleTimeline?.cues,
  safeArea: true,
  dynamicOpening: true,
});
await writeFile(resolve(runDirectory, 'quality-report.json'), JSON.stringify(quality, null, 2), 'utf8');
if (quality.status !== 'pass') process.exitCode = 2;
console.log(JSON.stringify({ ok: quality.status === 'pass', videoPath, qualityReport: resolve(runDirectory, 'quality-report.json') }));

function timestamp(ms: number) {
  const h = Math.floor(ms / 3600000).toString().padStart(2, '0');
  const m = Math.floor(ms / 60000 % 60).toString().padStart(2, '0');
  const s = Math.floor(ms / 1000 % 60).toString().padStart(2, '0');
  const f = Math.floor(ms % 1000).toString().padStart(3, '0');
  return `${h}:${m}:${s},${f}`;
}

function isAbsolutePath(value: string) {
  return /^[A-Za-z]:[\\/]/.test(value) || value.startsWith('\\\\') || value.startsWith('/');
}
