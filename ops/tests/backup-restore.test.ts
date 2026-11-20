import { existsSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const restoreScript = resolve(workspaceRoot, 'ops/scripts/verify-postgres-backup-restore.sh');

function writeCheckinRecorder(fakeBin: string) {
  writeFileSync(
    join(fakeBin, 'curl'),
    `#!/usr/bin/env bash
[[ "$*" == *"--header Content-Type: application/json"* ]] || exit 4
[[ "${'${!#}'}" == "$BACKUP_RESTORE_CHECKIN_URL" ]] || exit 5
for argument in "$@"; do
  if [[ "$argument" == \\{* ]]; then printf '%s\\n' "$argument" >>"$CHECKIN_LOG"; fi
done
exit "${'${CHECKIN_EXIT_STATUS:-0}'}"
`,
    { mode: 0o755 },
  );
}

function readCheckins(path: string) {
  return readFileSync(path, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
}

describe('isolated Postgres backup restoration', () => {
  it.each([
    ['bricadmin_admin', 'bricadmin_storefront'],
    ['custom-admin', "storefront's role"],
  ])('restores ownership and grants for %s and %s in isolation', (adminRole, storefrontRole) => {
    const testDirectory = mkdtempSync(join(tmpdir(), 'bric-restore-proof-'));
    const fakeBin = mkdtempSync(join(tmpdir(), 'bric-restore-docker-'));
    const backup = join(testDirectory, 'postgres-20260826-031503.sql.gz');
    const dockerLog = join(testDirectory, 'docker.log');
    const dockerInput = join(testDirectory, 'docker-input.log');
    const checkinLog = join(testDirectory, 'checkin.log');
    const fakeDocker = join(fakeBin, 'docker');
    writeFileSync(backup, gzipSync('CREATE TABLE restored_evidence (id integer);'));
    writeFileSync(
      fakeDocker,
      [
        '#!/usr/bin/env bash',
        'printf \'%s\\n\' "$*" >>"$DOCKER_LOG"',
        'if [[ "$1" == "exec" && "$*" == *"pg_isready"* ]]; then exit 0; fi',
        'if [[ "$1" == "exec" && "$*" == *"psql"* ]]; then',
        '  payload="$(cat)"',
        '  printf \'%s\\n\' "$payload" >>"$DOCKER_INPUT"',
        '  if [[ "$payload" == *"CREATE ROLE %I NOLOGIN"* ]]; then touch "$DOCKER_INPUT.roles"; fi',
        '  if [[ "$payload" == *"CREATE TABLE restored_evidence"* && ! -f "$DOCKER_INPUT.roles" ]]; then exit 3; fi',
        '  if [[ "$payload" == *"pg_database_size"* ]]; then printf \'DO\\n7654321|1|1\\n\'; fi',
        'fi',
        'exit 0',
      ].join('\n'),
      { mode: 0o755 },
    );
    writeCheckinRecorder(fakeBin);

    try {
      const result = spawnSync('bash', [restoreScript, backup], {
        encoding: 'utf8',
        env: {
          ...process.env,
          BRIC_INFRA_ENV_FILE: join(testDirectory, 'missing-infra.env'),
          BRIC_REQUIRE_RESTORE_CHECKIN: 'true',
          BACKUP_RESTORE_CHECKIN_URL: 'https://checkin.example/restore',
          CHECKIN_LOG: checkinLog,
          DOCKER_INPUT: dockerInput,
          DOCKER_LOG: dockerLog,
          POSTGRES_ADMIN_USER: adminRole,
          POSTGRES_STOREFRONT_USER: storefrontRole,
          PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
        },
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('postgres backup restore verified');
      expect(result.stdout).toContain('restored_bytes=7654321');
      expect(result.stdout).toContain('products=1 orders=1');
      expect(readFileSync(dockerLog, 'utf8')).toContain('--network none');
      expect(readFileSync(dockerLog, 'utf8')).toContain('volume rm');
      expect(readFileSync(dockerLog, 'utf8')).toContain(`--set=admin_role=${adminRole}`);
      expect(readFileSync(dockerLog, 'utf8')).toContain(`--set=storefront_role=${storefrontRole}`);
      expect(readFileSync(dockerInput, 'utf8')).toContain('CREATE ROLE %I NOLOGIN');
      expect(readFileSync(dockerInput, 'utf8')).toContain('CREATE TABLE restored_evidence');
      expect(readFileSync(dockerInput, 'utf8')).toContain("to_regclass('public.products')");
      const checkins = readCheckins(checkinLog);
      expect(checkins.map((checkin) => checkin.status)).toEqual(['in_progress', 'ok']);
      expect(checkins[0].check_in_id).toMatch(/^[0-9a-f-]{36}$/);
      expect(checkins[1].check_in_id).toBe(checkins[0].check_in_id);
      const cron = readFileSync(resolve(workspaceRoot, 'ops/host/bricomaitre-backups.cron'), 'utf8')
        .split('\n')
        .find((line) => line.includes('verify-postgres-backup-restore.sh'))!;
      expect(checkins[0].monitor_config).toEqual({
        schedule: { type: 'crontab', value: cron.split(/\s+/).slice(0, 5).join(' ') },
        timezone: 'Etc/UTC',
        checkin_margin: 60,
        max_runtime: 30,
        failure_issue_threshold: 1,
        recovery_threshold: 1,
      });
    } finally {
      rmSync(testDirectory, { recursive: true, force: true });
      rmSync(fakeBin, { recursive: true, force: true });
    }
  });

  it('refuses to start a restore when Sentry cannot record its start', () => {
    const directory = mkdtempSync(join(tmpdir(), 'bric-monitor-unavailable-'));
    const dockerLog = join(directory, 'docker.log');
    const checkinLog = join(directory, 'checkin.log');
    writeCheckinRecorder(directory);
    writeFileSync(join(directory, 'docker'), '#!/bin/sh\necho called >>"$DOCKER_LOG"\n', {
      mode: 0o755,
    });
    try {
      const result = spawnSync('bash', [restoreScript], {
        encoding: 'utf8',
        env: {
          ...process.env,
          BRIC_INFRA_ENV_FILE: join(directory, 'missing.env'),
          BACKUP_RESTORE_CHECKIN_URL: 'https://checkin.example/restore',
          CHECKIN_EXIT_STATUS: '22',
          CHECKIN_LOG: checkinLog,
          DOCKER_LOG: dockerLog,
          PATH: `${directory}:${process.env.PATH ?? ''}`,
        },
      });
      expect(result.status).toBe(22);
      expect(existsSync(dockerLog)).toBe(false);
      expect(readCheckins(checkinLog).map((checkin) => checkin.status)).toEqual(['in_progress']);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects a stale restore candidate before starting a disposable database', () => {
    const testDirectory = mkdtempSync(join(tmpdir(), 'bric-stale-restore-'));
    const backup = join(testDirectory, 'postgres-20260820-031503.sql.gz');
    writeFileSync(backup, gzipSync('SELECT 1;'));
    const staleTime = new Date(Date.now() - 48 * 60 * 60 * 1_000);
    utimesSync(backup, staleTime, staleTime);

    try {
      const result = spawnSync('bash', [restoreScript, backup], {
        encoding: 'utf8',
        env: {
          ...process.env,
          BRIC_INFRA_ENV_FILE: join(testDirectory, 'missing-infra.env'),
          BACKUP_RESTORE_MAX_AGE_HOURS: '24',
        },
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('outside the 24-hour freshness window');
    } finally {
      rmSync(testDirectory, { recursive: true, force: true });
    }
  });

  it('requires an external check-in endpoint for a scheduled restore drill', () => {
    const result = spawnSync('bash', [restoreScript], {
      encoding: 'utf8',
      env: {
        ...process.env,
        BRIC_INFRA_ENV_FILE: join(tmpdir(), 'missing-bric-infra.env'),
        BRIC_REQUIRE_RESTORE_CHECKIN: 'true',
        BACKUP_RESTORE_CHECKIN_URL: '',
      },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('BACKUP_RESTORE_CHECKIN_URL is required');
  });

  it('rejects a structurally valid restore without the required business-data floor', () => {
    const testDirectory = mkdtempSync(join(tmpdir(), 'bric-empty-restore-'));
    const fakeBin = mkdtempSync(join(tmpdir(), 'bric-empty-restore-docker-'));
    const backup = join(testDirectory, 'postgres-20260826-031503.sql.gz');
    const fakeDocker = join(fakeBin, 'docker');
    const checkinLog = join(testDirectory, 'checkin.log');
    writeCheckinRecorder(fakeBin);
    writeFileSync(backup, gzipSync('CREATE TABLE restored_evidence (id integer);'));
    writeFileSync(
      fakeDocker,
      [
        '#!/usr/bin/env bash',
        'if [[ "$1" == "exec" && "$*" == *"psql"* ]]; then',
        '  payload="$(cat)"',
        '  if [[ "$payload" == *"pg_database_size"* ]]; then printf \'DO\\n7654321|0|0\\n\'; fi',
        'fi',
        'exit 0',
      ].join('\n'),
      { mode: 0o755 },
    );

    try {
      const result = spawnSync('bash', [restoreScript, backup], {
        encoding: 'utf8',
        env: {
          ...process.env,
          BRIC_INFRA_ENV_FILE: join(testDirectory, 'missing-infra.env'),
          BACKUP_RESTORE_MIN_PRODUCTS: '1',
          BACKUP_RESTORE_MIN_ORDERS: '1',
          BACKUP_RESTORE_CHECKIN_URL: 'https://checkin.example/restore',
          CHECKIN_LOG: checkinLog,
          PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
        },
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain(
        'restored business data is below the required floor: products=0/1 orders=0/1',
      );
      const checkins = readCheckins(checkinLog);
      expect(checkins.map((checkin) => checkin.status)).toEqual(['in_progress', 'error']);
      expect(checkins[1].check_in_id).toBe(checkins[0].check_in_id);
    } finally {
      rmSync(testDirectory, { recursive: true, force: true });
      rmSync(fakeBin, { recursive: true, force: true });
    }
  });
});
