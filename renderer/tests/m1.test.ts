import assert from 'node:assert/strict';
import test from 'node:test';
import { buildTimeline, progressAtFrame, toSrt } from '../src/m1/timeline.ts';
import { createGalaxyLabels, galaxyCamera } from '../src/m1/galaxy.ts';
import { runQualityGate } from '../src/m1/quality-gate.ts';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('timeline uses audio durations and emits SRT', () => {
  const timeline = buildTimeline([
    { id: 'opening-1', chapter: 'opening', subtitleText: '开场', durationMs: 1000 },
    { id: 'conclusion-hook', chapter: 'conclusion', subtitleText: '评论区告诉我', durationMs: 2000, hook: true },
  ]);
  assert.equal(timeline.totalDurationInFrames, 90);
  assert.match(toSrt(timeline.cues), /00:00:00,000 --> 00:00:01,000/);
  assert.equal(timeline.chapters.at(-1)?.hookFrames, 60);
});

test('progress keeps hook in conclusion and fills cells by frame', () => {
  const timeline = buildTimeline([
    { id: 'a', chapter: 'opening', subtitleText: 'a', durationMs: 1000 },
    { id: 'h', chapter: 'conclusion', subtitleText: 'h', durationMs: 1000, hook: true },
  ]);
  const progress = progressAtFrame(45, timeline.totalDurationInFrames, timeline.chapters);
  assert.equal(progress.activeChapter, 'conclusion');
  assert.equal(progress.cells[0].fill, 1);
  assert.ok(progress.cells[4].fill > 0);
});

test('galaxy layout and camera are deterministic', () => {
  assert.deepEqual(createGalaxyLabels(['one', 'two'], 'two', 7), createGalaxyLabels(['one', 'two'], 'two', 7));
  assert.equal(galaxyCamera(0, 360).z, 32);
  assert.ok(galaxyCamera(359, 360).z < 12.01);
});

test('quality gate requires beat-aligned visual actions, subtitles, evidence and valid WAV metadata', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mvp-quality-'));
  const wavPath = join(directory, 'opening-1.wav');
  await writeFile(wavPath, minimalWav(24000, 2400));
  const storyboard = {
    schemaVersion: '1.0.0', projectId: 'p', title: 'demo', domainId: 'github-open-source', durationLimitMs: 300000,
    chapters: [
      { id: 'opening', title: '开场', beats: [{ id: 'opening-1', kind: 'narration', spokenText: '图解万物 之 GitHub 篇', displayText: '图解万物 之 GitHub 篇', pronunciationText: '图解万物 之 GitHub 篇', pronunciationTokens: [{ source: 'GitHub', spoken: 'GitHub', kind: 'english-proper-name', dictionaryRef: 'github' }], subtitleText: '图解万物 之 GitHub 篇', visualActions: [{ type: 'camera-zoom', durationFrames: 30, beatId: 'opening-1' }], evidenceRefs: ['claim-stargazers'], textBudget: { maxChars: 80 } }] },
      ...['principle', 'case', 'application'].map(id => ({ id, title: id, beats: [{ id: `${id}-1`, kind: 'narration', spokenText: '说明', displayText: '说明', pronunciationText: '说明', pronunciationTokens: [{ source: '说明', spoken: '说明', kind: 'plain' }], subtitleText: '说明', visualActions: [{ type: 'draw', durationFrames: 30, beatId: `${id}-1` }], evidenceRefs: ['claim-stargazers'], textBudget: { maxChars: 20 } }] })),
      { id: 'conclusion', title: '结论', beats: [{ id: 'conclusion-1', kind: 'narration', spokenText: '结论', displayText: '结论', pronunciationText: '结论', pronunciationTokens: [{ source: '结论', spoken: '结论', kind: 'plain' }], subtitleText: '结论', visualActions: [{ type: 'hold', durationFrames: 30, beatId: 'conclusion-1' }], evidenceRefs: ['claim-stargazers'], textBudget: { maxChars: 20 } }, { id: 'conclusion-hook', kind: 'hook', spokenText: '评论区告诉我', displayText: '评论区告诉我', pronunciationText: '评论区告诉我', pronunciationTokens: [{ source: '评论区告诉我', spoken: '评论区告诉我', kind: 'plain' }], subtitleText: '评论区告诉我', visualActions: [{ type: 'hold', durationFrames: 30, beatId: 'conclusion-hook' }], evidenceRefs: ['claim-stargazers'], textBudget: { maxChars: 30 } }] },
    ]
  } as any;
  const timeline = buildTimeline(storyboard.chapters.flatMap((chapter: any) => chapter.beats.map((beat: any) => ({ id: beat.id, chapter: chapter.id, subtitleText: beat.subtitleText, durationMs: 1000, hook: beat.kind === 'hook' }))));
  const report = runQualityGate({
    projectId: 'p', width: 1080, height: 1920, fps: 30, durationMs: 6000, storyboard,
    audioReady: true, voiceCacheReady: true, pronunciationBlocked: false, evidenceCoverage: true,
    evidenceClaims: [{ claimId: 'claim-stargazers', status: 'verified', sourceRefs: ['github'], field: 'stargazersCount' }],
    canvasWorldIds: ['CanvasWorld'], bgmAvailable: false, truePeakDb: -1.2,
    audioFiles: [{ beatId: 'opening-1', audioPath: wavPath, sha256: undefined, durationMs: 100, sampleRate: 24000, frameCount: 2400 }],
    subtitleCues: [{ beatId: 'opening-1', startMs: 0, endMs: 100, text: '图解万物 之 GitHub 篇' }],
    progressSpec: { x: 72, y: 148, width: 936, height: 56, labels: ['开场', '原理', '案例', '应用', '结论'], chapters: timeline.chapters, totalDurationInFrames: timeline.totalDurationInFrames },
    dynamicOpening: true,
  });
  assert.equal(report.checks.find(check => check.ruleId === 'AUDIO_WAV_METADATA')?.status, 'fail');
  assert.equal(report.checks.find(check => check.ruleId === 'BEAT_BINDINGS')?.status, 'fail');
});

function minimalWav(sampleRate: number, frameCount: number): Buffer {
  const dataSize = frameCount * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0); buffer.writeUInt32LE(36 + dataSize, 4); buffer.write('WAVE', 8);
  buffer.write('fmt ', 12); buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24); buffer.writeUInt32LE(sampleRate * 2, 28); buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36); buffer.writeUInt32LE(dataSize, 40);
  return buffer;
}
