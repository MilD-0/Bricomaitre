import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

const workspaceRoot = resolve(import.meta.dirname, '../..');
const blueGreenScript = resolve(workspaceRoot, 'ops/scripts/blue-green.sh');
const digest = `sha256:${'a'.repeat(64)}`;
const canonicalImage = `ghcr.io/mild-0/bricomaitre/admin-web@${digest}`;
const legacyImage = `ghcr.io/mild-0/bricomaitre2/admin-web@${digest}`;
const temporaryDirectories: string[] = [];

function verifyImage(image: string, profile: 'public' | 'legacy') {
  const directory = mkdtempSync(join(tmpdir(), 'bric-repository-identity-'));
  temporaryDirectories.push(directory);
  const cosignArguments = join(directory, 'cosign-arguments');

  writeFileSync(
    join(directory, 'cosign'),
    `#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" > "$FAKE_COSIGN_ARGUMENTS"
`,
    { mode: 0o755 },
  );

  const result = spawnSync(
    'bash',
    [
      '-c',
      'set -euo pipefail; source "$1"; verify_image_ref_format "$2" "$3"; verify_signed_image "$2" "$3"',
      'bash',
      blueGreenScript,
      image,
      profile,
    ],
    {
      cwd: workspaceRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${directory}:${process.env.PATH ?? ''}`,
        BRIC_INFRA_ENV_FILE: join(directory, 'missing-infra.env'),
        FAKE_COSIGN_ARGUMENTS: cosignArguments,
      },
    },
  );

  return {
    ...result,
    cosignArguments: existsSync(cosignArguments) ? readFileSync(cosignArguments, 'utf8') : '',
  };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('canonical repository identity transition', () => {
  it('accepts canonical images only with the canonical workflow identity', () => {
    const result = verifyImage(canonicalImage, 'public');

    expect(result.status).toBe(0);
    expect(result.cosignArguments).toContain(
      '--certificate-identity https://github.com/MilD-0/Bricomaitre/.github/workflows/deploy.yml@refs/heads/main',
    );
    expect(result.cosignArguments).not.toContain('Bricomaitre2');
  });

  it('rejects legacy images from a new deployment candidate', () => {
    const result = verifyImage(legacyImage, 'public');

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('invalid image ref');
    expect(result.cosignArguments).toBe('');
  });

  it('accepts the former namespace and identity only for legacy rollback', () => {
    const result = verifyImage(legacyImage, 'legacy');

    expect(result.status).toBe(0);
    expect(result.cosignArguments).toContain(
      '--certificate-identity https://github.com/MilD-0/Bricomaitre2/.github/workflows/deploy.yml@refs/heads/main',
    );
  });

  it('does not let the legacy rollback profile accept arbitrary repositories', () => {
    const result = verifyImage(`ghcr.io/mild-0/unrelated/admin-web@${digest}`, 'legacy');

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('invalid image ref');
    expect(result.cosignArguments).toBe('');
  });
});
