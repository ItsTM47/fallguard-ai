import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const targets = [
  path.join(projectRoot, 'dist'),
  path.join(projectRoot, '.DS_Store')
];

const withMlflowRuns = process.argv.includes('--mlruns');
if (withMlflowRuns) {
  targets.push(path.join(projectRoot, 'mlruns'));
}

for (const target of targets) {
  if (!fs.existsSync(target)) continue;
  fs.rmSync(target, { recursive: true, force: true });
  console.log(`[clean] removed ${path.relative(projectRoot, target)}`);
}

console.log('[clean] done');
