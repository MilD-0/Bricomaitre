import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

const workspaceRoot = resolve(import.meta.dirname, '../..');
const configurator = resolve(workspaceRoot, 'ops/scripts/configure-postgres-autovacuum.sh');
const migrations = resolve(workspaceRoot, 'ops/scripts/run-admin-migrations.sh');
const temporaryDirectories: string[] = [];

function runConfigurator(
  mode: 'verified' | 'unverified' | 'missing-container',
  runMigrations = false,
) {
  const directory = mkdtempSync(join(tmpdir(), 'bric-postgres-autovacuum-'));
  temporaryDirectories.push(directory);
  const dockerLog = join(directory, 'docker.log');
  const sqlLog = join(directory, 'autovacuum.sql');
  const fakeDocker = join(directory, 'docker');

  writeFileSync(
    fakeDocker,
    `#!/usr/bin/env bash
set -euo pipefail
printf '%s|%s\n' "\${ADMIN_DB_TASK:-}" "$*" >> "$FAKE_DOCKER_LOG"
if [[ "\${1:-}" == compose ]]; then
  if [[ "$FAKE_POSTGRES_MODE" != missing-container ]]; then
    printf 'synthetic-postgres-container\n'
  fi
  exit 0
fi
if [[ "\${1:-}" == exec ]]; then
  cat > "$FAKE_SQL_LOG"
  if [[ "$FAKE_POSTGRES_MODE" == verified ]]; then
    printf 't\n'
  else
    printf 'f\n'
  fi
  exit 0
fi
echo 'unexpected docker command' >&2
exit 64
`,
    { mode: 0o755 },
  );

  const result = spawnSync('bash', [runMigrations ? migrations : configurator], {
    cwd: workspaceRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${directory}:${process.env.PATH ?? ''}`,
      BRIC_INFRA_ENV_FILE: join(directory, 'missing-infra.env'),
      BRIC_IMAGE_STATE_FILE: join(directory, 'missing-images.env'),
      BRIC_DEPLOY_STATE_FILE: join(directory, 'missing-deploy-state.env'),
      FAKE_DOCKER_LOG: dockerLog,
      FAKE_SQL_LOG: sqlLog,
      FAKE_POSTGRES_MODE: mode,
    },
  });

  return { dockerLog, result, sqlLog };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('PostgreSQL high-churn autovacuum configuration', () => {
  it('applies and verifies bounded thresholds for all high-churn tables', () => {
    const test = runConfigurator('verified');

    expect(test.result.status).toBe(0);
    expect(test.result.stdout).toContain('autovacuum settings are configured and verified');
    const sql = readFileSync(test.sqlLog, 'utf8');
    expect(sql).toContain('ALTER TABLE admin.action_logs SET');
    expect(sql).not.toContain('ALTER TABLE public.action_logs SET');
    expect(sql).toContain('ALTER TABLE public.analytics_events SET');
    expect(sql).toContain('ALTER TABLE public.meta_event_outbox SET');
    expect(sql).toContain("('admin', 'action_logs')");
    expect(sql).toContain("('public', 'analytics_events')");
    expect(sql).toContain("('public', 'meta_event_outbox')");
    expect(sql).toContain('autovacuum_vacuum_scale_factor = 0.02');
    expect(sql).toContain('autovacuum_analyze_scale_factor = 0.01');
    expect(sql).toContain("SET LOCAL lock_timeout = '5s'");
    expect(readFileSync(test.dockerLog, 'utf8')).toContain(
      'exec -i synthetic-postgres-container psql --username bricadmin --dbname bricadmin --port 5432',
    );
  });

  it('fails when the post-apply catalog verification does not match', () => {
    const test = runConfigurator('unverified');

    expect(test.result.status).toBe(1);
    expect(test.result.stderr).toContain('did not pass post-apply verification');
  });

  it('fails without a running PostgreSQL container', () => {
    const test = runConfigurator('missing-container');

    expect(test.result.status).toBe(1);
    expect(test.result.stderr).toContain('PostgreSQL container is not running');
  });

  it('runs verify, migrate, verify with missing-image acquisition before configuring autovacuum', () => {
    const test = runConfigurator('verified', true);
    expect(test.result.status, test.result.stderr).toBe(0);
    const commands = readFileSync(test.dockerLog, 'utf8').trim().split('\n');
    expect(commands.filter((command) => command.includes(' pull '))).toHaveLength(0);
    const tasks = commands.filter((command) => command.includes(' run --rm --no-deps '));
    expect(tasks.every((command) => command.includes('--pull missing'))).toBe(true);
    expect(tasks.map((command) => command.split('|')[0])).toEqual(['verify', 'migrate', 'verify']);
    expect(commands.indexOf(tasks[2]!)).toBeLessThan(
      commands.findIndex((command) => command.includes('exec -i')),
    );
  });
});
