#!/usr/bin/env node
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const [, , entryArg, outfileArg] = process.argv;

if (!entryArg || !outfileArg) {
  console.error('Usage: node ops/scripts/build-worker.mjs <entry> <outfile>');
  process.exit(1);
}

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const entryPoint = resolve(rootDir, entryArg);
const outfile = resolve(rootDir, outfileArg);
const format = outfile.endsWith('.cjs') ? 'cjs' : 'esm';

function loadEsbuild() {
  const requireFromEntry = createRequire(entryPoint);

  try {
    return requireFromEntry('esbuild');
  } catch (error) {
    if (error?.code !== 'MODULE_NOT_FOUND') {
      throw error;
    }
  }

  const pnpmStore = resolve(rootDir, 'node_modules/.pnpm');
  if (existsSync(pnpmStore)) {
    const candidates = readdirSync(pnpmStore)
      .filter((name) => name.startsWith('esbuild@'))
      .sort()
      .reverse();

    for (const candidate of candidates) {
      const candidateRequire = createRequire(
        resolve(pnpmStore, candidate, 'node_modules/esbuild/package.json'),
      );

      try {
        return candidateRequire('esbuild');
      } catch {
        // Continue to the next installed pnpm variant.
      }
    }
  }

  throw new Error('Unable to resolve esbuild. Run pnpm install before bundling workers.');
}

const { build } = loadEsbuild();

await build({
  bundle: true,
  entryPoints: [entryPoint],
  // node-cron publishes distinct ESM and CommonJS entry points. Bundling its
  // ESM entry into a CommonJS worker rewrites import.meta.url to undefined,
  // which only fails when the generated bundle is executed. Keep it external
  // so Node resolves the package's supported CommonJS export at runtime.
  external: ['@sentry/profiling-node', 'bufferutil', 'node-cron', 'utf-8-validate'],
  format,
  keepNames: true,
  logLevel: 'info',
  minify: true,
  outfile,
  platform: 'node',
  sourcemap: false,
  target: 'node20',
});

if (format === 'cjs') {
  const outputStart = readFileSync(outfile, 'utf8').slice(0, 512);
  if (/^\s*import\s+\{?\s*createRequire/.test(outputStart)) {
    throw new Error(`CommonJS bundle ${outfileArg} contains an ESM createRequire banner.`);
  }
}
