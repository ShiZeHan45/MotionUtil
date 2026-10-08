import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { resolveFfmpegPath } from '../src/ffmpeg-path.ts';

test('prefers an explicit existing FFmpeg path', () => {
  withTempProject(root => {
    const configured = join(root, 'custom', 'ffmpeg.exe');
    const bundled = join(root, 'node_modules', '@remotion', 'compositor-win32-x64-msvc', 'ffmpeg.exe');
    mkdirSync(join(root, 'custom'), { recursive: true });
    mkdirSync(join(root, 'node_modules', '@remotion', 'compositor-win32-x64-msvc'), { recursive: true });
    writeFileSync(configured, '');
    writeFileSync(bundled, '');
    process.env.MVP_FFMPEG_PATH = configured;

    assert.equal(resolveFfmpegPath(root), configured);
  });
});

test('finds FFmpeg in the new project pnpm Remotion package cache', () => {
  withTempProject(root => {
    const bundled = join(root, 'node_modules', '.pnpm', '@remotion+compositor-win32-x64-msvc@4.0.534', 'node_modules', '@remotion', 'compositor-win32-x64-msvc', 'ffmpeg.exe');
    mkdirSync(join(bundled, '..'), { recursive: true });
    writeFileSync(bundled, '');

    assert.equal(resolveFfmpegPath(root), bundled);
  });
});

test('uses PATH lookup when no project or configured binary exists', () => {
  withTempProject(root => {
    assert.equal(resolveFfmpegPath(root), 'ffmpeg');
  });
});

function withTempProject(run: (root: string) => void) {
  const previous = process.env.MVP_FFMPEG_PATH;
  delete process.env.MVP_FFMPEG_PATH;
  const root = mkdtempSync(join(tmpdir(), 'mvp-ffmpeg-'));
  try {
    run(root);
  } finally {
    if (previous === undefined) delete process.env.MVP_FFMPEG_PATH;
    else process.env.MVP_FFMPEG_PATH = previous;
    rmSync(root, { recursive: true, force: true });
  }
}
