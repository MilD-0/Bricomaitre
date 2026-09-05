#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { copyFile, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const demoRoot = resolve(repositoryRoot, 'ops/demo');
const dataRoot = resolve(demoRoot, 'data');
const cacheRoot = resolve(demoRoot, '.cache/sources');
const lock = JSON.parse(await readFile(resolve(dataRoot, 'sources.lock.json'), 'utf8'));

const sourceFiles = {
  esciProducts: 'esci-products.parquet',
  esciExamples: 'esci-examples.parquet',
  sqidImages: 'sqid-images.parquet',
  sqidSupplementalImages: 'sqid-supplemental-images.parquet',
  aboImages: 'abo-images.parquet',
  algeriaWilayas: 'algeria-wilayas.json',
  algeriaCommunes: 'algeria-communes.json',
};

async function sha256(path) {
  const hash = createHash('sha256');
  await pipeline(createReadStream(path), hash);
  return hash.digest('hex');
}

async function download(name, source) {
  const destination = resolve(cacheRoot, source.local ?? sourceFiles[name]);
  try {
    const info = await stat(destination);
    if (info.size === source.bytes && (await sha256(destination)) === source.sha256) {
      process.stdout.write(`Using ${name} from the verified cache.\n`);
      return destination;
    }
  } catch {}

  const partial = `${destination}.partial`;
  let lastError;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    await rm(partial, { force: true });
    try {
      const response = await fetch(source.url, { redirect: 'follow' });
      if (!response.ok || !response.body) {
        throw new Error(`HTTP ${response.status}`);
      }
      await pipeline(response.body, createWriteStream(partial));
      const info = await stat(partial);
      const digest = await sha256(partial);
      if (info.size !== source.bytes || digest !== source.sha256) {
        throw new Error(`expected ${source.bytes}/${source.sha256}, got ${info.size}/${digest}`);
      }
      await rename(partial, destination);
      process.stdout.write(`Downloaded and verified ${name}.\n`);
      return destination;
    } catch (error) {
      lastError = error;
      process.stderr.write(`Download attempt ${attempt}/5 failed for ${name}: ${error.message}\n`);
      await new Promise((resolveDelay) => setTimeout(resolveDelay, attempt * 750));
    }
  }
  throw new Error(`Could not download ${name}: ${lastError?.message ?? 'unknown error'}`);
}

await mkdir(cacheRoot, { recursive: true });
for (const [name, source] of Object.entries(lock.sources)) {
  if (source.files) {
    for (const [index, file] of source.files.entries()) {
      await download(`${name}[${index}]`, {
        ...file,
        url: `https://huggingface.co/datasets/hyper3labs/amazon-berkeley-objects/resolve/${source.revision}/${file.path}`,
      });
    }
  } else {
    await download(name, source);
  }
}

const result = spawnSync(
  'docker',
  [
    'run',
    '--rm',
    '--network=none',
    '--user',
    `${process.getuid()}:${process.getgid()}`,
    '--volume',
    `${cacheRoot}:/sources:ro`,
    '--volume',
    `${dataRoot}:/output`,
    '--volume',
    `${resolve(dataRoot, 'extract-catalog.sql')}:/extract-catalog.sql:ro`,
    lock.tools.duckdbImage,
    '/duckdb',
    '-no-stdin',
    '-init',
    '/extract-catalog.sql',
  ],
  { encoding: 'utf8' },
);
if (result.status !== 0) {
  process.stderr.write(result.stdout);
  process.stderr.write(result.stderr);
  process.exit(result.status ?? 1);
}

await copyFile(
  resolve(cacheRoot, sourceFiles.algeriaWilayas),
  resolve(dataRoot, 'algeria-wilayas.json'),
);
await copyFile(
  resolve(cacheRoot, sourceFiles.algeriaCommunes),
  resolve(dataRoot, 'algeria-communes.json'),
);

const generatedFiles = [
  'catalog-source.csv',
  'catalog-stats.csv',
  'image-manifest.tsv',
  'algeria-wilayas.csv',
  'algeria-communes.csv',
  'algeria-wilayas.json',
  'algeria-communes.json',
];
const manifest = { schemaVersion: 1, files: {} };
for (const file of generatedFiles) {
  const path = resolve(dataRoot, file);
  manifest.files[file] = { bytes: (await stat(path)).size, sha256: await sha256(path) };
}
await writeFile(
  resolve(dataRoot, 'generated-manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
);

process.stdout.write('Wrote and verified the normalized demo source snapshots.\n');
