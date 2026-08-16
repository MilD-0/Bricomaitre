#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';

const EXPECTED_KEYS = new Set([
  'BRIC_IMAGE_STOREFRONT_API',
  'BRIC_IMAGE_STOREFRONT_META_WORKER',
  'BRIC_IMAGE_ADMIN_WEB',
  'BRIC_IMAGE_ADMIN_WORKER',
  'BRIC_IMAGE_ADMIN_MIGRATIONS',
  'BRIC_IMAGE_STOREFRONT_WEB',
  'BRIC_STOREFRONT_APP',
  'BRIC_STOREFRONT_STATIC_PAGES',
]);
const IMAGE_REF_PATTERN = /^ghcr[.]io\/mild-0\/bricomaitre2\/[a-z0-9-]+@sha256:[a-f0-9]{64}$/;

const [, , outputPath, ...inputPaths] = process.argv;

if (!outputPath || inputPaths.length === 0) {
  console.error(
    'Usage: node ops/scripts/assemble-release-image-manifest.mjs <output-file> <partial-file>...',
  );
  process.exit(2);
}

const values = new Map();

for (const inputPath of inputPaths) {
  const lines = readFileSync(inputPath, 'utf8').split(/\r?\n/);

  for (const [index, line] of lines.entries()) {
    if (!line) continue;

    const separator = line.indexOf('=');
    if (separator <= 0) {
      throw new Error(`${inputPath}:${index + 1} is not a KEY=value entry`);
    }

    const key = line.slice(0, separator);
    const value = line.slice(separator + 1);

    if (!EXPECTED_KEYS.has(key)) {
      throw new Error(`${inputPath}:${index + 1} contains unexpected key ${key}`);
    }
    if (values.has(key)) {
      throw new Error(`duplicate release image manifest key: ${key}`);
    }

    values.set(key, value);
  }
}

const missingKeys = [...EXPECTED_KEYS].filter((key) => !values.has(key));
if (missingKeys.length > 0) {
  throw new Error(`release image manifest is missing: ${missingKeys.join(', ')}`);
}

for (const [key, value] of values) {
  if (key === 'BRIC_STOREFRONT_APP') {
    if (value !== 'storefront') {
      throw new Error(`${key} must identify storefront`);
    }
  } else if (key === 'BRIC_STOREFRONT_STATIC_PAGES') {
    if (!/^\d+$/.test(value)) {
      throw new Error(`${key} must be a non-negative integer`);
    }
  } else if (!IMAGE_REF_PATTERN.test(value)) {
    throw new Error(`${key} must be an immutable Bricomaitre GHCR digest ref`);
  }
}

const manifest = [...EXPECTED_KEYS].map((key) => `${key}=${values.get(key)}`).join('\n');
writeFileSync(outputPath, `${manifest}\n`, { encoding: 'utf8', mode: 0o600 });
