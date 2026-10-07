import type { Storyboard } from '../../../workers/content-runtime/src/m1/storyboard.ts';
import { validateStoryboard } from '../../../workers/content-runtime/src/m1/storyboard.ts';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

export type QualityCheck = { ruleId: string; severity: 'block' | 'warn' | 'info'; status: 'pass' | 'fail'; actual: string; expected: string; file?: string; suggestedFix?: string };
export type QualityReport = { projectId: string; status: 'pass' | 'fail'; checks: QualityCheck[]; warnings: string[]; generatedAt: string };

type AudioFile = { beatId: string; audioPath: string; sha256?: string; durationMs?: number; sampleRate?: number; frameCount?: number };
type EvidenceClaim = { claimId: string; status: string; sourceRefs?: string[]; field?: string };
type ProgressSpec = { x: number; y: number; width: number; height: number; labels: string[]; chapters: Array<{ id: string; startFrame: number; endFrame: number; hookFrames: number }>; totalDurationInFrames: number };

function wavMetadata(path: string): { valid: boolean; sampleRate?: number; channels?: number; bitsPerSample?: number; frameCount?: number; dataBytes?: number } {
  try {
    const buffer = readFileSync(path);
    if (buffer.length < 44 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') return { valid: false };
    let offset = 12;
    let sampleRate: number | undefined;
    let channels: number | undefined;
    let bitsPerSample: number | undefined;
    let dataBytes: number | undefined;
    while (offset + 8 <= buffer.length) {
      const id = buffer.toString('ascii', offset, offset + 4);
      const size = buffer.readUInt32LE(offset + 4);
      const body = offset + 8;
      if (id === 'fmt ' && size >= 16 && body + 16 <= buffer.length) {
        const audioFormat = buffer.readUInt16LE(body);
        channels = buffer.readUInt16LE(body + 2);
        sampleRate = buffer.readUInt32LE(body + 4);
        bitsPerSample = buffer.readUInt16LE(body + 14);
        if (audioFormat !== 1) return { valid: false };
      }
      if (id === 'data') { dataBytes = Math.min(size, buffer.length - body); break; }
      offset = body + size + (size % 2);
    }
    if (!sampleRate || !channels || !bitsPerSample || dataBytes === undefined || bitsPerSample % 8 !== 0) return { valid: false };
    return { valid: true, sampleRate, channels, bitsPerSample, dataBytes, frameCount: Math.floor(dataBytes / (channels * bitsPerSample / 8)) };
  } catch { return { valid: false }; }
}

export function runQualityGate(input: { projectId: string; width: number; height: number; fps: number; durationMs: number; storyboard: Storyboard; audioReady: boolean; voiceCacheReady: boolean; pronunciationBlocked: boolean; evidenceCoverage: boolean; evidenceClaims?: EvidenceClaim[]; canvasWorldIds: string[]; bgmAvailable: boolean; truePeakDb: number; audioFiles?: AudioFile[]; subtitleCues?: Array<{ beatId: string; startMs: number; endMs: number; text: string }>; progressSpec?: ProgressSpec; safeArea?: boolean; dynamicOpening?: boolean; renderedFilePath?: string }): QualityReport {
  const checks: QualityCheck[] = [];
  const check = (ruleId: string, severity: QualityCheck['severity'], pass: boolean, actual: string, expected: string, suggestedFix = '') => checks.push({ ruleId, severity, status: pass ? 'pass' : 'fail', actual, expected, suggestedFix });
  check('VIDEO_DIMENSIONS', 'block', input.width === 1080 && input.height === 1920 && input.fps === 30, `${input.width}x${input.height}@${input.fps}`, '1080x1920@30');
  check('VIDEO_DURATION', 'block', input.durationMs <= 300000, String(input.durationMs), '<=300000ms');
  const storyboardErrors = validateStoryboard(input.storyboard);
  check('STORYBOARD_STRUCTURE', 'block', storyboardErrors.length === 0, storyboardErrors.join('; ') || 'valid', 'five chapters, final conclusion hook');
  check('AUDIO_FOR_EACH_BEAT', 'block', input.audioReady, String(input.audioReady), 'true');
  const beatIds = input.storyboard.chapters.flatMap(chapter => chapter.beats.map(beat => beat.id));
  const audioIds = input.audioFiles?.map(audio => audio.beatId) ?? [];
  const audioFilesValid = input.audioFiles ? audioIds.length === beatIds.length && new Set(audioIds).size === beatIds.length && beatIds.every(id => audioIds.includes(id)) && input.audioFiles.every(audio => existsSync(audio.audioPath) && (!audio.sha256 || createHash('sha256').update(readFileSync(audio.audioPath)).digest('hex') === audio.sha256)) : input.audioReady;
  check('AUDIO_FILES_INTEGRITY', 'block', audioFilesValid, input.audioFiles ? `${audioIds.length} files` : 'not supplied', 'one readable SHA-256-verified WAV per beat');
  const wavChecks = input.audioFiles?.map(audio => {
    const metadata = existsSync(audio.audioPath) ? wavMetadata(audio.audioPath) : { valid: false };
    return metadata.valid && (audio.sampleRate === undefined || audio.sampleRate === metadata.sampleRate) && (audio.frameCount === undefined || audio.frameCount === metadata.frameCount) && (audio.durationMs === undefined || Math.abs(audio.durationMs - (metadata.frameCount! * 1000 / metadata.sampleRate!)) <= 1);
  }) ?? [];
  check('AUDIO_WAV_METADATA', 'block', Boolean(input.audioFiles) && wavChecks.length === beatIds.length && wavChecks.every(Boolean), input.audioFiles ? `${wavChecks.filter(Boolean).length}/${wavChecks.length} valid WAV` : 'not supplied', 'RIFF/WAVE PCM metadata matches manifest');
  check('VOICE_CACHE_READY', 'block', input.voiceCacheReady, String(input.voiceCacheReady), 'true');
  check('PRONUNCIATION_COVERAGE', 'block', !input.pronunciationBlocked, String(input.pronunciationBlocked), 'false');
  check('EVIDENCE_COVERAGE', 'block', input.evidenceCoverage, String(input.evidenceCoverage), 'true');
  const claims = new Map((input.evidenceClaims ?? []).map(claim => [claim.claimId, claim]));
  const evidenceRefsValid = input.evidenceClaims ? input.storyboard.chapters.every(chapter => chapter.beats.every(beat => beat.evidenceRefs.every(ref => claims.get(ref)?.status === 'verified'))) : input.evidenceCoverage;
  check('EVIDENCE_REFERENCES', 'block', evidenceRefsValid, input.evidenceClaims ? String(evidenceRefsValid) : 'not supplied', 'every beat evidenceRef points to verified claim');
  check('CONTINUOUS_CANVAS', 'block', input.canvasWorldIds.length === 1, input.canvasWorldIds.join(','), 'one CanvasWorld ID');
  const visualBeatIds = input.storyboard.chapters.flatMap(chapter => chapter.beats.flatMap(beat => beat.visualActions.map(action => action.beatId)));
  const visualBindingsValid = visualBeatIds.length === beatIds.length && new Set(visualBeatIds).size === beatIds.length && beatIds.every(id => visualBeatIds.includes(id));
  const subtitleIds = input.subtitleCues?.map(cue => cue.beatId) ?? [];
  const subtitleCoverage = input.subtitleCues ? subtitleIds.length === beatIds.length && new Set(subtitleIds).size === beatIds.length && beatIds.every(id => subtitleIds.includes(id)) : false;
  const subtitlesValid = input.subtitleCues ? subtitleCoverage && input.subtitleCues.every((cue, index, cues) => cue.endMs > cue.startMs && (!index || cue.startMs >= cues[index - 1].endMs) && cue.text.split('\n').length <= 2 && cue.text.split('\n').every(line => [...line].filter(char => /[\u3400-\u9fff]/u.test(char)).length <= 18) && beatIds.includes(cue.beatId)) : false;
  check('BEAT_BINDINGS', 'block', visualBindingsValid && subtitleCoverage && audioFilesValid, `visual=${visualBeatIds.length}, audio=${audioIds.length}, subtitles=${subtitleIds.length}`, 'audio, subtitle and visualAction IDs exactly match storyboard beats');
  check('SUBTITLE_SYNC', 'block', subtitlesValid, input.subtitleCues ? `${input.subtitleCues.length} cues` : 'not supplied', 'ordered, non-overlapping beat-bound cues within two lines');
  if (input.progressSpec) {
    const spec = input.progressSpec;
    const ids = spec.chapters.map(chapter => chapter.id);
    const contiguous = spec.chapters.length === 5 && ids.join(',') === 'opening,principle,case,application,conclusion' && spec.chapters.every((chapter, index) => index === 0 || chapter.startFrame === spec.chapters[index - 1].endFrame) && spec.chapters.at(-1)?.endFrame === spec.totalDurationInFrames;
    check('PROGRESS_BAR_SPEC', 'block', spec.x === 72 && spec.y === 148 && spec.width === 936 && spec.height === 56 && spec.labels.join('|') === '开场|原理|案例|应用|结论' && contiguous, JSON.stringify(spec), 'x=72,y=148,width=936,height=56, five centered labels and contiguous chapters');
  }
  check('SAFE_AREA', 'block', input.safeArea !== false, String(input.safeArea ?? true), 'true');
  check('NON_STATIC_OPENING', 'block', input.dynamicOpening !== false, String(input.dynamicOpening ?? true), 'true');
  check('AUDIO_CLIPPING', 'block', input.truePeakDb <= -1, `${input.truePeakDb}dBTP`, '<=-1dBTP');
  const warnings = input.bgmAvailable ? [] : ['BGM 不可用，已自动使用无 BGM 导出'];
  return { projectId: input.projectId, status: checks.some(result => result.severity === 'block' && result.status === 'fail') ? 'fail' : 'pass', checks, warnings, generatedAt: new Date().toISOString() };
}
