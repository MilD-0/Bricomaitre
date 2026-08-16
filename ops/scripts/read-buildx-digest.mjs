#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const [, , metadataPath, targetName] = process.argv;

if (!metadataPath) {
  console.error('Usage: node ops/scripts/read-buildx-digest.mjs <metadata-file> [bake-target]');
  process.exit(2);
}

const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'));
const targetMetadata = targetName ? metadata[targetName] : metadata;
const digest =
  targetMetadata?.['containerimage.digest'] ||
  targetMetadata?.['containerimage.descriptor']?.digest;

if (!/^sha256:[a-f0-9]{64}$/.test(digest || '')) {
  const targetSuffix = targetName ? ` for Bake target ${targetName}` : '';
  console.error(`unable to find image digest in ${metadataPath}${targetSuffix}`);
  process.exit(1);
}

console.log(digest);
