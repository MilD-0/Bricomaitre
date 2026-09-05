#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const demoRoot = resolve(repositoryRoot, 'ops/demo');
const dataRoot = resolve(demoRoot, 'data');
const imageRoot = resolve(demoRoot, '.cache/images/catalog');
const originalRoot = resolve(demoRoot, '.cache/images/originals');
const statePath = resolve(demoRoot, '.cache/images/state.json');
const manifestPath = resolve(dataRoot, 'image-manifest.tsv');
const concurrency = Math.max(
  1,
  Math.min(32, Number(process.env.BRIC_DEMO_IMAGE_CONCURRENCY ?? 16)),
);
const maxSourceBytes = 12 * 1024 * 1024;

async function sha256(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function downloadImage({ productKey, imagePosition, sourceUrl }) {
  const productImageRoot = resolve(imageRoot, productKey);
  const productOriginalRoot = resolve(originalRoot, productKey);
  const destination = resolve(productImageRoot, `${imagePosition}.webp`);
  const original = resolve(productOriginalRoot, `${imagePosition}.source`);
  await mkdir(productImageRoot, { recursive: true });
  await mkdir(productOriginalRoot, { recursive: true });
  if ((await exists(destination)) && (await exists(original))) {
    return { productKey, imagePosition, state: 'cached' };
  }

  let input;
  if (await exists(original)) {
    input = await readFile(original);
  } else {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const abort = new AbortController();
      const timeout = setTimeout(() => abort.abort(), 25_000);
      try {
        const response = await fetch(sourceUrl, {
          redirect: 'follow',
          signal: abort.signal,
          headers: { 'user-agent': 'BricomaitreDemoData/1.0' },
        });
        if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
        const declaredLength = Number(response.headers.get('content-length') ?? 0);
        if (declaredLength > maxSourceBytes) throw new Error('source image exceeds the size limit');
        const chunks = [];
        let bytes = 0;
        for await (const chunk of response.body) {
          bytes += chunk.byteLength;
          if (bytes > maxSourceBytes) throw new Error('source image exceeds the size limit');
          chunks.push(chunk);
        }
        input = Buffer.concat(chunks);
        await writeFile(`${original}.partial`, input, { mode: 0o644 });
        await rename(`${original}.partial`, original);
        break;
      } catch (error) {
        if (attempt === 3) throw error;
        await new Promise((resolveDelay) => setTimeout(resolveDelay, attempt * 500));
      } finally {
        clearTimeout(timeout);
      }
    }
  }
  const output = await sharp(input, { failOn: 'warning', limitInputPixels: 40_000_000 })
    .rotate()
    .resize(900, 900, { fit: 'contain', background: '#ffffff', withoutEnlargement: true })
    .webp({ quality: 80, effort: 4 })
    .toBuffer();
  const temporary = `${destination}.partial`;
  await writeFile(temporary, output, { mode: 0o644 });
  await rename(temporary, destination);
  return { productKey, imagePosition, state: 'downloaded' };
}

const rows = (await readFile(manifestPath, 'utf8'))
  .trim()
  .split('\n')
  .map((line) => {
    const [productKey, imagePosition, sourceUrl] = line.split('\t');
    return { productKey, imagePosition, sourceUrl };
  });

await mkdir(imageRoot, { recursive: true });
await mkdir(originalRoot, { recursive: true });
let cursor = 0;
const counts = { cached: 0, downloaded: 0, failed: 0 };
const failures = [];

async function worker() {
  while (cursor < rows.length) {
    const row = rows[cursor++];
    try {
      const result = await downloadImage(row);
      counts[result.state] += 1;
    } catch (error) {
      counts.failed += 1;
      failures.push({
        productKey: row.productKey,
        imagePosition: row.imagePosition,
        reason: String(error?.message ?? error),
      });
    }
    const complete = counts.cached + counts.downloaded + counts.failed;
    if (
      (complete % 250 === 0 || complete === rows.length) &&
      (counts.downloaded > 0 || counts.failed > 0)
    ) {
      process.stdout.write(
        `Prepared ${complete}/${rows.length} images (${counts.failed} failed).\n`,
      );
    }
  }
}

await Promise.all(Array.from({ length: concurrency }, () => worker()));

const imageManifestDigest = await sha256(manifestPath);
await mkdir(dirname(statePath), { recursive: true });
await writeFile(
  statePath,
  `${JSON.stringify(
    {
      schemaVersion: 1,
      imageManifestSha256: imageManifestDigest,
      imageCount: rows.length,
      downloadedOrCached: rows.length - failures.length,
      failureCount: failures.length,
      failures,
    },
    null,
    2,
  )}\n`,
);

if (failures.length > 0) {
  throw new Error(
    `${failures.length} catalog images failed; replace their products before seeding`,
  );
}

const selectedProducts = new Set(rows.map((row) => row.productKey));
for (const root of [imageRoot, originalRoot]) {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || !selectedProducts.has(entry.name)) {
      await rm(resolve(root, entry.name), { recursive: true, force: true });
    }
  }
}
process.stdout.write(
  `Catalog images are ready: ${rows.length} source originals and WebP copies.\n`,
);
