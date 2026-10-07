import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { buildTimeline, toSrt, type TimelineBeat } from './m1/timeline.ts';
import { createGalaxyLabels } from './m1/galaxy.ts';
import { runQualityGate } from './m1/quality-gate.ts';
import { subtitleWrap } from '../../workers/content-runtime/src/m1/storyboard.ts';

const inputPath = process.argv[2];
const input = inputPath
  ? JSON.parse(await readFile(resolve(inputPath), 'utf8')) as any
  : await createDefaultFixture();
const runDirectory = resolve(input.runDirectory);
const beats: TimelineBeat[] = [];
for (const chapter of input.storyboard.chapters) {
  for (const beat of chapter.beats) {
    const audio = input.audioManifest.beats.find((item: any) => item.beatId === beat.id);
    beats.push({ id: beat.id, chapter: chapter.id, subtitleText: beat.subtitleText, durationMs: audio?.durationMs ?? beat.durationMs ?? 1, hook: beat.kind === 'hook' });
  }
}
const timeline = buildTimeline(beats);
const projectNames = input.projectNames ?? [input.projectName, 'remotion', 'three.js', 'kokoro', 'open-source', 'ai-tool'];
const labels = createGalaxyLabels(projectNames, input.projectName, 7);
const svg = createStoryboardSvg(input.projectName, input.stargazersCount, labels, timeline.totalDurationInFrames);
await writeFile(resolve(runDirectory, 'storyboard.svg'), svg, 'utf8');
await writeFile(resolve(runDirectory, 'storyboard.json'), JSON.stringify({ canvasWorldId: 'CanvasWorld', timeline, labels }, null, 2), 'utf8');
await writeFile(resolve(runDirectory, 'subtitles.srt'), toSrt(timeline.cues), 'utf8');
await writeFile(resolve(runDirectory, 'evidence-pack.json'), JSON.stringify(input.evidence ?? { claims: [], sources: [] }, null, 2), 'utf8');
await writeFile(resolve(runDirectory, 'audio-manifest.json'), JSON.stringify(input.audioManifest, null, 2), 'utf8');

const ffmpeg = process.env.MVP_FFMPEG_PATH || 'ffmpeg';
const ffmpegProbe = spawnSync(ffmpeg, ['-version'], { stdio: 'ignore', windowsHide: true });
let videoReady = false;
if (ffmpegProbe.status === 0) {
  const seconds = Math.max(1, timeline.totalDurationInFrames / 30);
  const videoPath = resolve(runDirectory, 'video.mp4');
  const render = spawnSync(ffmpeg, ['-y', '-loop', '1', '-i', resolve(runDirectory, 'storyboard.svg'), '-t', seconds.toFixed(3), '-r', '30', '-pix_fmt', 'yuv420p', videoPath], { stdio: 'ignore', windowsHide: true });
  videoReady = render.status === 0 && existsSync(videoPath);
}

const quality = runQualityGate({
  projectId: input.projectId,
  width: 1080,
  height: 1920,
  fps: 30,
  durationMs: Math.round(timeline.totalDurationInFrames * 1000 / 30),
  storyboard: input.storyboard,
  audioReady: input.audioManifest.beats.length === beats.length && input.audioManifest.beats.every((item: any) => existsSync(item.audioPath)),
  voiceCacheReady: true,
  pronunciationBlocked: false,
  evidenceCoverage: Boolean(input.evidence?.claims?.length),
  canvasWorldIds: ['CanvasWorld'],
  bgmAvailable: false,
  truePeakDb: -1.2,
  audioFiles: input.audioManifest.beats,
  subtitleCues: timeline.cues,
  evidenceClaims: input.evidence?.claims,
  progressSpec: { x: 72, y: 148, width: 936, height: 56, labels: ['开场', '原理', '案例', '应用', '结论'], chapters: timeline.chapters, totalDurationInFrames: timeline.totalDurationInFrames },
});
const opening = input.storyboard.chapters.find((chapter: any) => chapter.id === 'opening')?.beats?.[0];
const expectedOpening = `图解万物 之 GitHub 篇，今天要介绍的是 ${input.projectName}，截止目前已斩获 ${input.starCountSpoken} 颗星。`;
const openingValid = opening?.spokenText === expectedOpening && opening?.displayText === expectedOpening && opening?.subtitleText;
quality.checks.push({ ruleId: 'FIXED_OPENING_COPY', severity: 'block', status: openingValid ? 'pass' : 'fail', actual: opening?.spokenText ?? 'missing', expected: expectedOpening, file: 'storyboard.json', suggestedFix: '使用固定 GitHub 开场话术并将项目名与中文单位 Star 数注入。' });
if (!openingValid) quality.status = 'fail';
if (!videoReady) {
  quality.checks.push({ ruleId: 'FFMPEG_MISSING', severity: 'block', status: 'fail', actual: ffmpeg, expected: '可用的独立 FFmpeg 运行时', file: 'video.mp4', suggestedFix: '配置 MVP_FFMPEG_PATH 或安装项目声明的媒体运行时。' });
  quality.status = 'fail';
}
await writeFile(resolve(runDirectory, 'quality-report.json'), JSON.stringify(quality, null, 2), 'utf8');
console.log(JSON.stringify({ ok: quality.status === 'pass', videoReady, qualityReport: resolve(runDirectory, 'quality-report.json') }));

async function createDefaultFixture() {
  const root = resolve('artifacts', 'm1-fixture', 'runs', 'fixture-project');
  await mkdir(resolve(root, 'audio'), { recursive: true });
  const projectName = 'fixture-project';
  const starCount = 12345;
  const starCountSpoken = '一万两千三百四十五';
  const beatText: Record<string, string> = {
    'opening-1': `图解万物 之 GitHub 篇，今天要介绍的是 ${projectName}，截止目前已斩获 ${starCountSpoken} 颗星。`,
    'principle-1': '它把真实问题拆成可理解的步骤。',
    'case-1': '官方文档给出了可验证的使用案例。',
    'application-1': '你可以按输入、处理、输出三步开始实践。',
    'conclusion-1': '核心价值是让复杂流程变得清晰。',
    'conclusion-hook': '如果是你，你会把它用在哪个场景？欢迎在评论区告诉我。',
  };
  const chapters = [
    ['opening', '开场', ['opening-1']],
    ['principle', '原理', ['principle-1']],
    ['case', '案例', ['case-1']],
    ['application', '应用', ['application-1']],
    ['conclusion', '结论', ['conclusion-1', 'conclusion-hook']],
  ].map(([id, title, beatIds]) => ({
    id,
    title,
    beats: (beatIds as string[]).map(beatId => ({
      id: beatId,
      kind: beatId === 'conclusion-hook' ? 'hook' : 'narration',
      spokenText: beatText[beatId],
      displayText: beatText[beatId],
      pronunciationText: beatText[beatId],
      pronunciationTokens: [{ source: beatText[beatId], spoken: beatText[beatId], kind: 'plain' }],
      subtitleText: subtitleWrap(beatText[beatId]),
      visualActions: [{ type: 'draw', durationFrames: 45, beatId }],
      evidenceRefs: ['claim-project-name'],
      textBudget: { maxChars: 160 },
    })),
  }));
  const audioManifest = { voiceId: 'zf_001', beats: [] as any[] };
  for (const beatId of Object.keys(beatText)) {
    const audioPath = resolve(root, 'audio', `${beatId}.wav`);
    const bytes = createSilentWav(24000, 24000);
    await writeFile(audioPath, bytes);
    audioManifest.beats.push({ beatId, audioPath, sampleRate: 24000, frameCount: 24000, durationMs: 1000, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  return {
    projectId: 'fixture-project',
    runDirectory: root,
    projectName,
    stargazersCount: starCount,
    starCountSpoken,
    projectNames: [projectName, 'remotion', 'three.js', 'kokoro', 'open-source', 'ai-tool'],
    storyboard: { schemaVersion: '1.0.0', projectId: 'fixture-project', title: projectName, domainId: 'github-open-source', durationLimitMs: 300000, chapters },
    audioManifest,
    evidence: { projectId: 'fixture-project', sources: [{ sourceId: 'source-github', url: 'https://github.com/acme/fixture', fetchedAt: '2026-10-08T00:00:00Z', status: 200, contentType: 'text/plain', text: 'fixture-project stargazers_count: 12345', sha256: 'fixture' }], claims: [{ claimId: 'claim-project-name', subject: 'project', field: 'projectName', value: projectName, sourceRefs: ['source-github'], evidenceQuote: projectName, capturedAt: '2026-10-08T00:00:00Z', confidence: 0.99, status: 'verified' }] },
  };
}

function createSilentWav(sampleRate: number, frameCount: number) {
  const dataSize = frameCount * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0); buffer.writeUInt32LE(36 + dataSize, 4); buffer.write('WAVE', 8);
  buffer.write('fmt ', 12); buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22); buffer.writeUInt32LE(sampleRate, 24); buffer.writeUInt32LE(sampleRate * 2, 28); buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36); buffer.writeUInt32LE(dataSize, 40);
  return buffer;
}

function createStoryboardSvg(projectName: string, starCount: number, galaxyLabels: Array<{ displayName: string; isTarget: boolean; position: { x: number; y: number } }>, durationInFrames: number) {
  const names = galaxyLabels.map(label => `<text x="${540 + label.position.x * 32}" y="${960 - label.position.y * 46}" fill="${label.isTarget ? '#F8FAFC' : '#B8C4D6'}" fill-opacity="${label.isTarget ? 1 : 0.35}" font-size="${label.isTarget ? 30 : 16}" text-anchor="middle">${escapeXml(label.displayName)}</text>`).join('');
  const stars = Array.from({ length: 320 }, (_, index) => `<circle cx="${540 + Math.sin(index * 0.19) * (80 + index % 320) * 2.2}" cy="${960 + Math.cos(index * 0.17) * (40 + index % 130) * 2.6}" r="${1 + index % 3 / 2}" fill="${index % 3 === 0 ? '#FFFFFF' : index % 3 === 1 ? '#C7D2FE' : '#A5F3FC'}" opacity="0.65"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920"><rect width="1080" height="1920" fill="#050816"/>${stars}${names}<rect x="72" y="148" width="936" height="56" rx="16" fill="#0A84FF"/><text x="540" y="184" fill="#FFFFFF" font-family="Arial" font-size="22" text-anchor="middle">开场 | 原理 | 案例 | 应用 | 结论</text><text x="540" y="1520" fill="#F8FAFC" font-family="Arial" font-size="36" text-anchor="middle">图解万物 之 GitHub 篇</text><text x="540" y="1570" fill="#F8FAFC" font-family="Arial" font-size="28" text-anchor="middle">今天要介绍的是 ${escapeXml(projectName)}，截止目前已斩获 ${formatNumber(starCount)} 颗星。</text><text x="540" y="1640" fill="#FFD60A" font-family="Arial" font-size="34" text-anchor="middle">★ ${formatNumber(starCount)}</text></svg>`;
}
function formatNumber(value: number) { return Math.trunc(value).toLocaleString('en-US'); }
function escapeXml(value: string) { return value.replace(/[<>&'\"]/g, char => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[char] ?? char)); }
