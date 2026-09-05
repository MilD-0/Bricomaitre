#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const demoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dataRoot = resolve(demoRoot, 'data');
const manifest = JSON.parse(await readFile(resolve(dataRoot, 'generated-manifest.json'), 'utf8'));

async function sha256(path) {
  const hash = createHash('sha256');
  await pipeline(createReadStream(path), hash);
  return hash.digest('hex');
}

if (manifest.schemaVersion !== 1 || typeof manifest.files !== 'object') {
  throw new Error('Unsupported normalized demo data manifest.');
}

for (const [file, expected] of Object.entries(manifest.files)) {
  const path = resolve(dataRoot, file);
  const info = await stat(path);
  const digest = await sha256(path);
  if (info.size !== expected.bytes || digest !== expected.sha256) {
    throw new Error(`${file} does not match generated-manifest.json; run pnpm demo:data:refresh`);
  }
}

process.stdout.write(
  `Verified ${Object.keys(manifest.files).length} normalized demo data files.\n`,
);
