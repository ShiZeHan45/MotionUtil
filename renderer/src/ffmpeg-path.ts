import { existsSync, readdirSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';

/** Resolve the media runtime without copying binaries from the retired project. */
export function resolveFfmpegPath(projectRoot = resolve(process.cwd())): string {
  const configured = process.env.MVP_FFMPEG_PATH?.trim();
  if (configured) {
    const configuredPath = resolveCandidate(configured);
    if (configuredPath) return configuredPath;
  }

  const directCandidates = [
    join(projectRoot, 'node_modules', '@remotion', 'compositor-win32-x64-msvc', 'ffmpeg.exe'),
    join(projectRoot, 'node_modules', '@remotion', 'compositor-win32-x64-msvc', 'ffmpeg'),
  ];
  for (const candidate of directCandidates) if (existsSync(candidate)) return candidate;

  const pnpmRoot = join(projectRoot, 'node_modules', '.pnpm');
  if (existsSync(pnpmRoot)) {
    const packageDirectories = readdirSync(pnpmRoot, { withFileTypes: true })
      .filter(entry => entry.isDirectory() && entry.name.startsWith('@remotion+compositor-win32-x64-msvc@'))
      .sort((a, b) => b.name.localeCompare(a.name));
    for (const packageDirectory of packageDirectories) {
      const packageRoot = join(pnpmRoot, packageDirectory.name, 'node_modules', '@remotion', 'compositor-win32-x64-msvc');
      for (const name of ['ffmpeg.exe', 'ffmpeg']) {
        const candidate = join(packageRoot, name);
        if (existsSync(candidate)) return candidate;
      }
    }
  }

  return 'ffmpeg';
}

function resolveCandidate(value: string): string | undefined {
  const candidate = isAbsolute(value) ? value : resolve(value);
  if (existsSync(candidate)) return candidate;
  if (existsSync(candidate + '.exe')) return candidate + '.exe';
  if (existsSync(join(candidate, 'ffmpeg.exe'))) return join(candidate, 'ffmpeg.exe');
  if (existsSync(join(candidate, 'ffmpeg'))) return join(candidate, 'ffmpeg');
  return undefined;
}
