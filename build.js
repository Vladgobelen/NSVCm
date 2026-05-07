import * as esbuild from 'esbuild';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readdirSync, existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

function getEntryPoints(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter(f => f.isFile() && f.name.endsWith('.ts'))
    .map(f => join(dir, f.name));
}

const sharedDir = join(__dirname, 'src/shared');
const entryPoints = getEntryPoints(sharedDir);

if (entryPoints.length === 0) {
  console.log('No entry points found');
  process.exit(0);
}

await esbuild.build({
  entryPoints,
  outdir: join(__dirname, 'dist/shared'),
  format: 'esm',
  target: 'es2020',
  bundle: false,
  sourcemap: false,
  keepNames: true,
});

console.log(`Client build complete: ${entryPoints.length} files`);
