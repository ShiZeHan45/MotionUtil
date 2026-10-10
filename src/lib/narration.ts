import { createHash } from "node:crypto";
import path from "node:path";
import type { NarrationSegment, ProjectScript, RenderProject } from "../types";
import { config } from "./config";
import { readJson, writeJson } from "./io";

export const TARGET_VIDEO_DURATION_MS = 180_000;
export const MAX_VIDEO_DURATION_MS = 200_000;
const ESTIMATE_MARGIN = 1.05;
const DEFAULT_CHARACTERS_PER_SECOND = 5.2;

export type SpokenSegment = NarrationSegment & { spokenText: string };
export type NarrationTiming = {
  model: string;
  voice: string;
  speed: number;
  pauseMs: number;
  substitutions: Array<[string, string]>;
  charactersPerSecond: number;
  calibrationPath: string;
  samples: number[];
};

// This is the exact timeline sent to Kokoro, including concept beats and pronunciation overrides.
export function spokenTimeline(script: ProjectScript, substitutions: Array<[string, string]> = []): SpokenSegment[] {
  return script.narrationSegments.flatMap((segment) => {
    const segments = segment.scene === "concept" && script.conceptStoryboard?.beats.length
      ? script.conceptStoryboard.beats.map((beat) => ({ scene: "concept" as const, beatId: beat.id, text: beat.text, spokenText: beat.spokenText ?? beat.text }))
      : [{ ...segment, spokenText: segment.spokenText ?? segment.text }];
    return segments.map((item) => {
      let spokenText = item.spokenText;
      for (const [source, replacement] of substitutions) {
        const escaped = source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        spokenText = spokenText.replace(new RegExp(escaped, "gi"), replacement);
      }
      return { ...item, spokenText };
    });
  });
}

function characterCount(segments: SpokenSegment[]): number {
  return segments.reduce((total, segment) => total + [...segment.spokenText.replace(/\s/g, "")].length, 0);
}

function conservativeRate(samples: number[], speed: number): number {
  if (!samples.length) return DEFAULT_CHARACTERS_PER_SECOND * speed;
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) * 0.25)]!;
}

export async function loadNarrationTiming(): Promise<NarrationTiming> {
  if (!Number.isFinite(config.kokoroSpeed) || config.kokoroSpeed <= 0) throw new Error("KOKORO_SPEED 必须是大于 0 的数字");
  if (!Number.isFinite(config.kokoroPauseMs) || config.kokoroPauseMs < 0) throw new Error("KOKORO_PAUSE_MS 必须是非负数字");
  let pronunciation: Record<string, string> = {};
  try {
    pronunciation = await readJson<Record<string, string>>(path.resolve("config", "pronunciation.json"));
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
  }
  const substitutions = Object.entries(pronunciation).filter(([source]) => source.length > 0).sort(([a], [b]) => b.length - a.length);
  const key = createHash("sha256").update(JSON.stringify({ model: config.kokoroModel, voice: config.kokoroVoice, speed: config.kokoroSpeed, substitutions })).digest("hex");
  const calibrationPath = path.resolve(".cache", "narration-timing", `${key}.json`);
  let samples: number[] = [];
  try {
    const saved = await readJson<{ samples: number[] }>(calibrationPath);
    if (Array.isArray(saved.samples)) samples = saved.samples.filter((rate) => Number.isFinite(rate) && rate > 0).slice(-20);
  } catch (error) {
    if (!(error instanceof SyntaxError) && (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT")) throw error;
  }
  return {
    model: config.kokoroModel, voice: config.kokoroVoice, speed: config.kokoroSpeed,
    pauseMs: config.kokoroPauseMs, substitutions, calibrationPath, samples,
    charactersPerSecond: conservativeRate(samples, config.kokoroSpeed),
  };
}

export function estimateNarration(script: ProjectScript, timing: NarrationTiming) {
  const segments = spokenTimeline(script, timing.substitutions);
  const spokenCharacters = characterCount(segments);
  const pauseMs = Math.max(0, segments.length - 1) * timing.pauseMs;
  return {
    spokenCharacters, segmentCount: segments.length, pauseMs,
    durationMs: Math.ceil(spokenCharacters / timing.charactersPerSecond * 1_000 * ESTIMATE_MARGIN + pauseMs),
  };
}

export function narrationCharacterBudget(timing: NarrationTiming, segmentCount: number, durationMs = TARGET_VIDEO_DURATION_MS): number {
  const pauseMs = Math.max(0, segmentCount - 1) * timing.pauseMs;
  return Math.max(1, Math.floor((durationMs - pauseMs) / 1_000 * timing.charactersPerSecond / ESTIMATE_MARGIN));
}

export async function recordNarrationTiming(projects: RenderProject[], timing: NarrationTiming): Promise<void> {
  for (const project of projects) {
    const durationMs = project.narrationSegments.reduce((total, segment) => total + segment.durationMs, 0);
    const pauseMs = Math.max(0, project.narrationSegments.length - 1) * timing.pauseMs;
    const characters = characterCount(project.narrationSegments);
    if (characters > 0 && durationMs > pauseMs) timing.samples.push(characters / ((durationMs - pauseMs) / 1_000));
  }
  timing.samples = timing.samples.slice(-20);
  timing.charactersPerSecond = conservativeRate(timing.samples, timing.speed);
  await writeJson(timing.calibrationPath, {
    model: timing.model, voice: timing.voice, speed: timing.speed,
    samples: timing.samples, updatedAt: new Date().toISOString(),
  });
}
