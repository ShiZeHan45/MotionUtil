import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const roots = ['workers/content-runtime/src', 'renderer/src'];
const forbidden = [/Math\.random\s*\(/, /Date\.now\s*\(/, /requestAnimationFrame\s*\(/, /fetch\s*\(/];
const errors = [];
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await walk(path);
    else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
      const source = await readFile(path, 'utf8');
      for (const pattern of forbidden) if (pattern.test(source)) errors.push(`${path}: forbidden ${pattern}`);
    }
  }
}
for (const root of roots) await walk(root);
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log(`typecheck: ${roots.join(', ')} passed deterministic source checks`);
