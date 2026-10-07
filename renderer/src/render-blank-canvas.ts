import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createComposition } from './composition.ts';

const composition = createComposition();
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const artifacts = resolve(root, 'artifacts');
await mkdir(artifacts, { recursive: true });
await writeFile(resolve(artifacts, 'blank-canvas.composition.json'), `${JSON.stringify(composition, null, 2)}\n`, 'utf8');
await writeFile(resolve(artifacts, 'blank-canvas.svg'), `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920"><rect width="1080" height="1920" fill="#F7F8FA"/><path d="M72 148H1008" stroke="#E4E7EC" stroke-width="4"/><circle cx="540" cy="960" r="120" fill="#007AFF" fill-opacity=".12" stroke="#007AFF" stroke-width="4"/><text x="540" y="960" text-anchor="middle" dominant-baseline="middle" font-family="Arial" font-size="42" fill="#1D2939">CanvasWorld · M0</text></svg>\n`, 'utf8');
console.log(JSON.stringify({ ok: true, composition: composition.id, width: composition.width, height: composition.height, fps: composition.fps, output: artifacts }));
