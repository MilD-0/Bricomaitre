import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

const workspaceRoot = resolve(import.meta.dirname, '../..');
const signer = resolve(workspaceRoot, 'ops/scripts/sign-bake-images.sh');
const temporaryDirectories: string[] = [];

function runSigner(
  mode:
    | 'transient-once'
    | 'always-transient'
    | 'signing-error'
    | 'already-signed'
    | 'equivalent-entry'
    | 'hang',
  options: { maxAttempts?: string; timeoutSeconds?: string } = {},
) {
  const directory = mkdtempSync(join(tmpdir(), 'bric-release-sign-'));
  temporaryDirectories.push(directory);
  const cosignCountFile = join(directory, 'cosign-calls');
  const oidcCountFile = join(directory, 'oidc-calls');
  const metadataFile = join(directory, 'metadata.json');
  const outputFile = join(directory, 'images.env');
  const digest = `sha256:${'a'.repeat(64)}`;

  writeFileSync(
    join(directory, 'curl'),
    `#!/usr/bin/env bash
set -euo pipefail
count=0
if [[ -f "$FAKE_OIDC_COUNT_FILE" ]]; then
  count="$(cat "$FAKE_OIDC_COUNT_FILE")"
fi
printf '%s\n' "$((count + 1))" > "$FAKE_OIDC_COUNT_FILE"
printf '{"value":"synthetic-oidc-token"}\n'
`,
    { mode: 0o755 },
  );
  writeFileSync(
    join(directory, 'cosign'),
    `#!/usr/bin/env bash
set -euo pipefail
if [[ "\${1:-}" == verify ]]; then
  case "$FAKE_COSIGN_MODE" in
    already-signed)
      exit 0
      ;;
    equivalent-entry)
      [[ -f "$FAKE_COSIGN_COUNT_FILE" ]]
      exit
      ;;
    *)
      exit 1
      ;;
  esac
fi
count=0
if [[ -f "$FAKE_COSIGN_COUNT_FILE" ]]; then
  count="$(cat "$FAKE_COSIGN_COUNT_FILE")"
fi
count="$((count + 1))"
printf '%s\n' "$count" > "$FAKE_COSIGN_COUNT_FILE"
case "$FAKE_COSIGN_MODE" in
  transient-once)
    if ((count == 1)); then
      echo 'tuf refresh failed: unexpected EOF' >&2
      exit 1
    fi
    ;;
  always-transient)
    echo 'TLS handshake timeout' >&2
    exit 1
    ;;
  signing-error)
    echo 'signature policy rejected the identity' >&2
    exit 17
    ;;
  equivalent-entry)
    echo 'createLogEntryConflict: an equivalent entry already exists in the transparency log' >&2
    exit 1
    ;;
  hang)
    sleep 10
    ;;
esac
echo 'synthetic signing succeeded'
`,
    { mode: 0o755 },
  );
  writeFileSync(metadataFile, JSON.stringify({ 'admin-web': { 'containerimage.digest': digest } }));

  const result = spawnSync(
    'bash',
    [signer, metadataFile, outputFile, 'BRIC_IMAGE_ADMIN:admin-web:admin-web'],
    {
      cwd: workspaceRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${directory}:${process.env.PATH ?? ''}`,
        IMAGE_NAMESPACE: 'ghcr.io/mild-0/bricomaitre',
        ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'synthetic-request-token',
        ACTIONS_ID_TOKEN_REQUEST_URL: 'https://oidc.invalid/token?job=1',
        FAKE_COSIGN_MODE: mode,
        FAKE_COSIGN_COUNT_FILE: cosignCountFile,
        FAKE_OIDC_COUNT_FILE: oidcCountFile,
        BRIC_SIGN_MAX_ATTEMPTS: options.maxAttempts ?? '3',
        BRIC_SIGN_RETRY_DELAY_SECONDS: '0',
        BRIC_SIGN_TIMEOUT_SECONDS: options.timeoutSeconds ?? '5',
      },
    },
  );

  return {
    ...result,
    cosignCalls: Number(
      readFileSync(cosignCountFile, { encoding: 'utf8', flag: 'a+' }).trim() || '0',
    ),
    oidcCalls: Number(readFileSync(oidcCountFile, { encoding: 'utf8', flag: 'a+' }).trim() || '0'),
    output: readFileSync(outputFile, 'utf8'),
    digest,
  };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('release image signing retries', () => {
  it('retries a transient TUF failure with a fresh OIDC token', () => {
    const result = runSigner('transient-once');

    expect(result.status).toBe(0);
    expect(result.cosignCalls).toBe(2);
    expect(result.oidcCalls).toBe(2);
    expect(result.stderr).toContain('transient network error; retrying');
    expect(result.output).toContain(
      `BRIC_IMAGE_ADMIN=ghcr.io/mild-0/bricomaitre/admin-web@${result.digest}`,
    );
  });

  it('does not retry a deterministic signing failure', () => {
    const result = runSigner('signing-error');

    expect(result.status).toBe(17);
    expect(result.cosignCalls).toBe(1);
    expect(result.oidcCalls).toBe(1);
    expect(result.stderr).toContain('non-network error; not retrying');
  });

  it('bounds repeated transient signing failures', () => {
    const result = runSigner('always-transient');

    expect(result.status).toBe(1);
    expect(result.cosignCalls).toBe(3);
    expect(result.oidcCalls).toBe(3);
    expect(result.stderr).toContain('exhausted 3 transient-network attempts');
  });

  it('reuses a valid existing signature without requesting another identity', () => {
    const result = runSigner('already-signed');

    expect(result.status).toBe(0);
    expect(result.cosignCalls).toBe(0);
    expect(result.oidcCalls).toBe(0);
    expect(result.stdout).toContain('already has a valid release signature; reusing it');
  });

  it('accepts a duplicate Rekor entry only after verifying the published signature', () => {
    const result = runSigner('equivalent-entry');

    expect(result.status).toBe(0);
    expect(result.cosignCalls).toBe(1);
    expect(result.oidcCalls).toBe(1);
    expect(result.stdout).toContain('before Rekor returned its duplicate-entry response');
  });

  it('terminates a stalled signing request', () => {
    const result = runSigner('hang', { maxAttempts: '1', timeoutSeconds: '1' });

    expect(result.status).toBe(124);
    expect(result.cosignCalls).toBe(1);
    expect(result.oidcCalls).toBe(1);
    expect(result.stderr).toContain('timed out after 1s');
  });
});
