import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const directories: string[] = [];
afterEach(() => directories.splice(0).forEach((path) => rmSync(path, { recursive: true })));

describe.each([
  { name: 'osv-scanner', version: '2.5.1', output: 'osv-scanner version: 2.5.1' },
  { name: 'cosign', version: 'v3.0.6', output: 'GitVersion: v3.0.6' },
])('$name version verification', ({ name, version, output }) => {
  it.each([
    { kind: 'valid version with substantial trailing output', valid: true, exitCode: 0, status: 0 },
    { kind: 'wrong version', valid: false, exitCode: 0, status: 1 },
    { kind: 'failed command that still prints the version', valid: true, exitCode: 1, status: 1 },
  ])('$kind', ({ valid, exitCode, status }) => {
    const cache = mkdtempSync(join(tmpdir(), 'bric-tool-version-test-'));
    directories.push(cache);
    const binaryDirectory = join(cache, name, version);
    const shimDirectory = join(cache, 'bin');
    mkdirSync(binaryDirectory, { recursive: true });
    mkdirSync(shimDirectory);
    // Model an already checksum-verified cache; this test exercises the
    // version command's exit status and stdout pipe, not download integrity.
    writeFileSync(join(shimDirectory, 'sha256sum'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    writeFileSync(
      join(binaryDirectory, name),
      `#!${process.execPath}
const { writeSync } = require('node:fs');
writeSync(1, ${JSON.stringify(`${valid ? output : 'wrong version'}\n`)});
for (let i = 0; i < 32; i++) writeSync(1, 'd'.repeat(16384));
process.exit(${exitCode});
`,
      { mode: 0o755 },
    );
    const result = spawnSync('bash', [join(root, 'ops/scripts', `install-${name}.sh`)], {
      env: {
        ...process.env,
        BRIC_CI_CACHE_DIR: cache,
        PATH: `${shimDirectory}:${process.env.PATH}`,
        GITHUB_PATH: '',
      },
      encoding: 'utf8',
      timeout: 10_000,
    });
    expect(result.status, result.stderr).toBe(status);
  });
});
