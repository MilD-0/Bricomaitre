import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const workspaceRoot = resolve(import.meta.dirname, '../..');
const scanner = resolve(workspaceRoot, 'ops/scripts/scan-secrets.sh');
const reportVerifier = resolve(workspaceRoot, 'ops/scripts/verify-gitleaks-report.mjs');
const temporaryDirectories: string[] = [];

function createRepository() {
  const repository = mkdtempSync(join(tmpdir(), 'bric-secret-scan-'));
  temporaryDirectories.push(repository);
  execFileSync('git', ['init', '--quiet'], { cwd: repository });
  writeFileSync(join(repository, 'tracked.txt'), 'committed content\n');
  execFileSync('git', ['add', 'tracked.txt'], { cwd: repository });
  execFileSync('git', ['commit', '--quiet', '-m', 'fixture'], {
    cwd: repository,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Secret Scan Test',
      GIT_AUTHOR_EMAIL: 'secret-scan@example.com',
      GIT_COMMITTER_NAME: 'Secret Scan Test',
      GIT_COMMITTER_EMAIL: 'secret-scan@example.com',
    },
  });
  writeFileSync(join(repository, 'tracked.txt'), 'uncommitted working-tree content\n');
  return repository;
}

function createFakeGitleaks() {
  const directory = mkdtempSync(join(tmpdir(), 'bric-fake-gitleaks-'));
  temporaryDirectories.push(directory);
  const binary = join(directory, 'gitleaks');
  writeFileSync(
    binary,
    `#!/usr/bin/env bash
set -euo pipefail
if [[ "\${1:-}" == 'version' ]]; then
  echo '8.30.1'
  exit 0
fi
source_path=''
report_path=''
is_directory_scan='false'
log_opts=''
while (($#)); do
  case "$1" in
    --source)
      source_path="$2"
      shift 2
      ;;
    --report-path)
      report_path="$2"
      shift 2
      ;;
    --no-git)
      is_directory_scan='true'
      shift
      ;;
    --log-opts)
      log_opts="$2"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done
printf '%s|%s|%s\n' "$is_directory_scan" "$source_path" "$log_opts" >> "$FAKE_GITLEAKS_CALLS"
if [[ "$source_path" == */canary.env ]]; then
  exit "\${FAKE_GITLEAKS_CANARY_STATUS:-23}"
fi
if [[ -n "\${FAKE_GITLEAKS_EXPECT_CONTENT:-}" ]] &&
  ! grep -R -Fq -- "$FAKE_GITLEAKS_EXPECT_CONTENT" "$source_path"; then
  exit 71
fi
printf '[]\n' > "$report_path"
exit "\${FAKE_GITLEAKS_SCAN_STATUS:-0}"
`,
    { mode: 0o755 },
  );
  return { binary, calls: join(directory, 'calls.log') };
}

function runScanner(
  mode: 'worktree' | 'history',
  repository: string,
  fake: ReturnType<typeof createFakeGitleaks>,
  overrides: NodeJS.ProcessEnv = {},
) {
  return spawnSync('bash', [scanner, mode, repository], {
    cwd: workspaceRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      BRIC_GITLEAKS_BIN: fake.binary,
      FAKE_GITLEAKS_CALLS: fake.calls,
      ...overrides,
    },
  });
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('repository secret scanning', () => {
  it('pins and integrity-checks the last verified working Gitleaks release', () => {
    const config = readFileSync(resolve(workspaceRoot, '.gitleaks.toml'), 'utf8');
    const installer = readFileSync(
      resolve(workspaceRoot, 'ops/scripts/install-gitleaks.sh'),
      'utf8',
    );

    expect(config).toContain('minVersion = "8.30.1"');
    expect(installer).toContain("gitleaks_version='8.30.1'");
    expect(installer).toContain(
      "archive_sha256='551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb'",
    );
    expect(installer).toContain(
      "archive_sha256='e4a487ee7ccd7d3a7f7ec08657610aa3606637dab924210b3aee62570fb4b080'",
    );
    expect(installer).toContain(
      "binary_sha256='88f91962aa2f93ac6ab281d553b9e125f5197bbbce38f9f2437f7299c32e5509'",
    );
    expect(installer).toContain(
      "binary_sha256='00e91bbe655bd7c47753e8cfe61cb76ea1a5d7e7702fe161ee40102b46b3823b'",
    );
    expect(installer).toContain('sha256sum -c --status');
  });

  it('fails closed when the scanner does not detect its synthetic canary', () => {
    const repository = createRepository();
    const fake = createFakeGitleaks();
    const result = runScanner('worktree', repository, fake, {
      FAKE_GITLEAKS_CANARY_STATUS: '0',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Gitleaks canary failed: expected leak exit 23, received 0.');
    expect(readFileSync(fake.calls, 'utf8').trim().split('\n')).toHaveLength(1);
  });

  it('scans the current tracked content rather than only the committed index', () => {
    const repository = createRepository();
    const fake = createFakeGitleaks();
    const result = runScanner('worktree', repository, fake, {
      FAKE_GITLEAKS_EXPECT_CONTENT: 'uncommitted working-tree content',
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Gitleaks canary and worktree secret scan passed.');
    const calls = readFileSync(fake.calls, 'utf8').trim().split('\n');
    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatch(/^true[|].+[/]canary[.]env[|]$/);
    expect(calls[1]).toMatch(/^true[|].+[/]worktree[|]$/);
  });

  it('runs the history scan only from a complete checkout', () => {
    const repository = createRepository();
    const fake = createFakeGitleaks();
    const result = runScanner('history', repository, fake);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Gitleaks canary and history secret scan passed.');
    const calls = readFileSync(fake.calls, 'utf8').trim().split('\n');
    expect(calls).toHaveLength(2);
    const headCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: repository,
      encoding: 'utf8',
    }).trim();
    expect(calls[1]).toBe(`false|${repository}|${headCommit}`);
  });

  it('allows only UUIDv4 findings in the exact AI fixture paths', () => {
    const directory = mkdtempSync(join(tmpdir(), 'bric-gitleaks-report-'));
    temporaryDirectories.push(directory);
    const report = join(directory, 'report.json');
    const fixtureUuid = '182ffc13-33e5-43b7-a064-e4c437b0ea67';
    writeFileSync(
      report,
      JSON.stringify([
        {
          RuleID: 'generic-api-key',
          Secret: fixtureUuid,
          File: '/tmp/release/apps/admin/tests/browser/admin-ai-assistant.spec.ts',
          StartLine: 28,
        },
      ]),
    );

    const result = spawnSync(process.execPath, [reportVerifier, report], {
      cwd: workspaceRoot,
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Accepted 1 deterministic UUIDv4 finding');
  });

  it('reports unexpected finding metadata without printing the secret', () => {
    const directory = mkdtempSync(join(tmpdir(), 'bric-gitleaks-report-'));
    temporaryDirectories.push(directory);
    const report = join(directory, 'report.json');
    const syntheticSecret = 'synthetic-value-that-must-stay-private';
    writeFileSync(
      report,
      JSON.stringify([
        {
          RuleID: 'generic-api-key',
          Secret: syntheticSecret,
          File: 'apps/admin/lib/runtime.ts',
          StartLine: 12,
        },
      ]),
    );

    const result = spawnSync(process.execPath, [reportVerifier, report], {
      cwd: workspaceRoot,
      encoding: 'utf8',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('- generic-api-key at "apps/admin/lib/runtime.ts":12');
    expect(result.stderr).not.toContain(syntheticSecret);
  });

  it('wires the current-file and full-history gate into a non-shallow CI checkout', () => {
    const rootPackage = JSON.parse(
      readFileSync(resolve(workspaceRoot, 'package.json'), 'utf8'),
    ) as {
      scripts?: Record<string, string>;
    };
    const ci = readFileSync(resolve(workspaceRoot, '.github/workflows/ci.yml'), 'utf8');
    const staticQuality = ci.slice(
      ci.indexOf('  static-quality:'),
      ci.indexOf('\n  service-contracts:'),
    );
    const scannerSource = readFileSync(scanner, 'utf8');

    expect(rootPackage.scripts?.['secrets:check']).toBe('bash ops/scripts/scan-secrets.sh all');
    expect(staticQuality).toContain('fetch-depth: 0');
    expect(staticQuality).toContain('run: pnpm secrets:check');
    expect(scannerSource).toContain('git -C "$scan_source" ls-files --cached --others');
    expect(scannerSource).toContain('rev-parse --is-shallow-repository');
    expect(scannerSource).toContain('--log-opts "$head_commit"');
    expect(scannerSource.match(/--redact/g)).toHaveLength(1);
    expect(scannerSource).toContain('node "$report_verifier" "$report_path"');
  });
});
