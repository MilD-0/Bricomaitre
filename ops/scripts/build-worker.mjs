#!/usr/bin/env node
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';
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
const emitSourceMap = process.env.BRIC_WORKER_SOURCEMAPS === '1';

const { build } = createRequire(entryPoint)('esbuild');

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
  sourcemap: emitSourceMap ? 'external' : false,
  target: 'node24',
});
