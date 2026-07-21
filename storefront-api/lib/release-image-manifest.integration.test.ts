import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const digestReader = resolve(workspaceRoot, 'ops/scripts/read-buildx-digest.mjs');
const manifestAssembler = resolve(
  workspaceRoot,
  'ops/scripts/assemble-release-image-manifest.mjs',
);
const digest = `sha256:${'a'.repeat(64)}`;
const imageRef = (name: string) => `ghcr.io/mild-0/bricomaitre2/${name}@${digest}`;
const temporaryDirectories: string[] = [];

function makeTemporaryDirectory() {
  const directory = mkdtempSync(resolve(tmpdir(), 'bric-release-manifest-'));
  temporaryDirectories.push(directory);
  return directory;
}

function runNode(script: string, args: string[]) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: workspaceRoot,
    encoding: 'utf8',
  });
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('Buildx metadata digest reader', () => {
  it('reads both single-build and named Bake target metadata', () => {
    const directory = makeTemporaryDirectory();
    const single = resolve(directory, 'single.json');
    const bake = resolve(directory, 'bake.json');
    writeFileSync(single, JSON.stringify({ 'containerimage.digest': digest }));
    writeFileSync(bake, JSON.stringify({
      'admin-web': { 'containerimage.descriptor': { digest } },
    }));

    expect(runNode(digestReader, [single])).toMatchObject({ status: 0, stdout: `${digest}\n` });
    expect(runNode(digestReader, [bake, 'admin-web'])).toMatchObject({
      status: 0,
      stdout: `${digest}\n`,
    });
  });

  it('rejects missing Bake targets and malformed digests', () => {
    const directory = makeTemporaryDirectory();
    const metadata = resolve(directory, 'metadata.json');
    writeFileSync(metadata, JSON.stringify({ target: { 'containerimage.digest': 'latest' } }));

    const missing = runNode(digestReader, [metadata, 'missing']);
    const malformed = runNode(digestReader, [metadata, 'target']);
    expect(missing.status).toBe(1);
    expect(missing.stderr).toContain('Bake target missing');
    expect(malformed.status).toBe(1);
    expect(malformed.stderr).toContain('unable to find image digest');
  });
});

describe('release image manifest assembler', () => {
  const validParts = [
    [
      `BRIC_IMAGE_STOREFRONT_API=${imageRef('storefront-api-web')}`,
      `BRIC_IMAGE_STOREFRONT_META_WORKER=${imageRef('storefront-api-meta-worker')}`,
    ],
    [
      `BRIC_IMAGE_ADMIN_WEB=${imageRef('admin-web')}`,
      `BRIC_IMAGE_ADMIN_WORKER=${imageRef('admin-worker')}`,
      `BRIC_IMAGE_ADMIN_MIGRATIONS=${imageRef('admin-migrations')}`,
    ],
    [
      `BRIC_IMAGE_STOREFRONT_WEB=${imageRef('storefront-web')}`,
      'BRIC_STOREFRONT_APP=storefront-new',
      'BRIC_STOREFRONT_STATIC_PAGES=123',
    ],
  ];

  function writeParts(parts = validParts) {
    const directory = makeTemporaryDirectory();
    const output = resolve(directory, 'manifest.env');
    const inputs = parts.map((lines, index) => {
      const path = resolve(directory, `part-${index}.env`);
      writeFileSync(path, `${lines.join('\n')}\n`);
      return path;
    });
    return { output, inputs };
  }

  it('assembles the complete immutable release contract in canonical order', () => {
    const { output, inputs } = writeParts();
    const result = runNode(manifestAssembler, [output, ...inputs]);

    expect(result.status).toBe(0);
    const manifest = readFileSync(output, 'utf8');
    expect(manifest.split('\n').filter(Boolean)).toHaveLength(8);
    expect(manifest).toContain(`BRIC_IMAGE_STOREFRONT_API=${imageRef('storefront-api-web')}`);
    expect(manifest).toContain('BRIC_STOREFRONT_APP=storefront-new');
    expect(manifest).toContain('BRIC_STOREFRONT_STATIC_PAGES=123');
  });

  it.each([
    {
      name: 'missing values',
      parts: validParts.slice(0, 2),
      error: 'release image manifest is missing',
    },
    {
      name: 'duplicate values',
      parts: [...validParts, [validParts[0][0]]],
      error: 'duplicate release image manifest key',
    },
    {
      name: 'mutable image refs',
      parts: validParts.map((part, index) => index === 0
        ? [`BRIC_IMAGE_STOREFRONT_API=ghcr.io/mild-0/bricomaitre2/storefront-api-web:main`, part[1]]
        : part),
      error: 'must be an immutable Bricomaitre GHCR digest ref',
    },
    {
      name: 'wrong storefront release identity',
      parts: validParts.map((part, index) => index === 2
        ? part.map((line) => line === 'BRIC_STOREFRONT_APP=storefront-new'
          ? 'BRIC_STOREFRONT_APP=storefront'
          : line)
        : part),
      error: 'BRIC_STOREFRONT_APP must identify storefront-new',
    },
  ])('rejects $name', ({ parts, error }) => {
    const { output, inputs } = writeParts(parts);
    const result = runNode(manifestAssembler, [output, ...inputs]);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(error);
  });
});
