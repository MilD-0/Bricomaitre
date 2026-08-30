import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const backupScript = resolve(workspaceRoot, 'ops/scripts/backup-postgres.sh');
const pruneScript = resolve(workspaceRoot, 'ops/scripts/prune-postgres-backups.sh');
const privacyScript = resolve(workspaceRoot, 'ops/scripts/validate-s3-backup-privacy.sh');
const restoreScript = resolve(workspaceRoot, 'ops/scripts/verify-postgres-backup-restore.sh');
const backupAwsCredentialsScript = resolve(
  workspaceRoot,
  'ops/scripts/use-backup-aws-credentials.sh',
);

describe('production Postgres backup retention', () => {
  it('creates database dumps and their directory with owner-only permissions', () => {
    const backupDir = mkdtempSync(join(tmpdir(), 'bric-private-backups-'));
    const fakeBin = mkdtempSync(join(tmpdir(), 'bric-docker-'));
    const fakeDocker = join(fakeBin, 'docker');
    writeFileSync(
      fakeDocker,
      '#!/usr/bin/env bash\nif [[ "$1" == "ps" ]]; then\n  echo container-id\nelse\n  printf "%s\\n" "-- synthetic SQL dump --"\nfi\n',
      { mode: 0o755 },
    );

    try {
      const result = spawnSync('bash', [backupScript], {
        encoding: 'utf8',
        env: {
          ...process.env,
          BACKUP_DIR: backupDir,
          PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
        },
      });
      const [backupName] = readdirSync(backupDir);

      expect(result.status).toBe(0);
      expect(backupName).toMatch(/^postgres-\d{8}-\d{6}\.sql\.gz$/);
      expect(statSync(backupDir).mode & 0o777).toBe(0o700);
      expect(statSync(join(backupDir, backupName)).mode & 0o777).toBe(0o600);
    } finally {
      rmSync(backupDir, { recursive: true, force: true });
      rmSync(fakeBin, { recursive: true, force: true });
    }
  });

  it('does not publish a partial dump when pg_dump fails', () => {
    const backupDir = mkdtempSync(join(tmpdir(), 'bric-failed-backup-'));
    const fakeBin = mkdtempSync(join(tmpdir(), 'bric-failed-docker-'));
    const fakeDocker = join(fakeBin, 'docker');
    writeFileSync(
      fakeDocker,
      '#!/usr/bin/env bash\nif [[ "$1" == "ps" ]]; then\n  echo container-id\nelse\n  printf "%s\\n" "-- truncated SQL --"\n  exit 7\nfi\n',
      { mode: 0o755 },
    );

    try {
      const result = spawnSync('bash', [backupScript], {
        encoding: 'utf8',
        env: {
          ...process.env,
          BACKUP_DIR: backupDir,
          PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
        },
      });

      expect(result.status).not.toBe(0);
      expect(readdirSync(backupDir)).toEqual([]);
    } finally {
      rmSync(backupDir, { recursive: true, force: true });
      rmSync(fakeBin, { recursive: true, force: true });
    }
  });

  it('restores a dump into an isolated disposable Postgres and checks core relations', () => {
    const testDirectory = mkdtempSync(join(tmpdir(), 'bric-restore-proof-'));
    const fakeBin = mkdtempSync(join(tmpdir(), 'bric-restore-docker-'));
    const backup = join(testDirectory, 'postgres-20260826-031503.sql.gz');
    const dockerLog = join(testDirectory, 'docker.log');
    const dockerInput = join(testDirectory, 'docker-input.log');
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
        '  if [[ "$payload" == *"pg_database_size"* ]]; then printf \'DO\\n7654321\\n\'; fi',
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
          DOCKER_INPUT: dockerInput,
          DOCKER_LOG: dockerLog,
          PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
        },
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('postgres backup restore verified');
      expect(result.stdout).toContain('restored_bytes=7654321');
      expect(readFileSync(dockerLog, 'utf8')).toContain('--network none');
      expect(readFileSync(dockerLog, 'utf8')).toContain('volume rm');
      expect(readFileSync(dockerInput, 'utf8')).toContain('CREATE TABLE restored_evidence');
      expect(readFileSync(dockerInput, 'utf8')).toContain("to_regclass('public.products')");
    } finally {
      rmSync(testDirectory, { recursive: true, force: true });
      rmSync(fakeBin, { recursive: true, force: true });
    }
  });

  it('validates bucket privacy before creating, uploading, or pruning a backup', () => {
    const uploadScript = readFileSync(
      resolve(workspaceRoot, 'ops/scripts/backup-postgres-to-s3.sh'),
      'utf8',
    );
    const privacyIndex = uploadScript.indexOf('validate-s3-backup-privacy.sh');
    const backupIndex = uploadScript.indexOf('backup-postgres.sh');
    const uploadIndex = uploadScript.indexOf('aws s3 cp');
    const pruneIndex = uploadScript.indexOf('prune-postgres-backups.sh');

    expect(privacyIndex).toBeGreaterThan(-1);
    expect(uploadScript.indexOf('use-backup-aws-credentials.sh')).toBeLessThan(privacyIndex);
    expect(backupIndex).toBeGreaterThan(privacyIndex);
    expect(uploadIndex).toBeGreaterThan(-1);
    expect(uploadScript).toContain('--only-show-errors');
    expect(pruneIndex).toBeGreaterThan(uploadIndex);
  });

  it('maps a dedicated backup key into the AWS CLI environment', () => {
    const result = spawnSync(
      'bash',
      [
        '-c',
        `source "$1" && printf '%s|%s|%s|%s' "$AWS_ACCESS_KEY_ID" "$AWS_SECRET_ACCESS_KEY" "${'${AWS_SESSION_TOKEN:-}'}" "${'${AWS_PROFILE:-}'}"`,
        'bash',
        backupAwsCredentialsScript,
      ],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          AWS_ACCESS_KEY_ID: 'application-key',
          AWS_SECRET_ACCESS_KEY: 'application-secret',
          AWS_PROFILE: 'application-profile',
          BACKUP_AWS_ACCESS_KEY_ID: 'backup-key',
          BACKUP_AWS_SECRET_ACCESS_KEY: 'backup-secret',
          BACKUP_AWS_SESSION_TOKEN: 'backup-session',
          BACKUP_AWS_PROFILE: '',
        },
      },
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toBe('backup-key|backup-secret|backup-session|');
  });

  it('fails closed when backup jobs would reuse the application AWS key', () => {
    const result = spawnSync('bash', ['-c', 'source "$1"', 'bash', backupAwsCredentialsScript], {
      encoding: 'utf8',
      env: {
        ...process.env,
        AWS_ACCESS_KEY_ID: 'shared-key',
        AWS_SECRET_ACCESS_KEY: 'shared-secret',
        BACKUP_AWS_ACCESS_KEY_ID: 'shared-key',
        BACKUP_AWS_SECRET_ACCESS_KEY: 'shared-secret',
        BACKUP_AWS_PROFILE: '',
      },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('must not reuse the application AWS access key');
  });

  it('supports a dedicated backup profile without inheriting static app credentials', () => {
    const result = spawnSync(
      'bash',
      [
        '-c',
        `source "$1" && printf '%s|%s|%s' "${'${AWS_PROFILE:-}'}" "${'${AWS_ACCESS_KEY_ID:-}'}" "${'${AWS_SECRET_ACCESS_KEY:-}'}"`,
        'bash',
        backupAwsCredentialsScript,
      ],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          AWS_ACCESS_KEY_ID: 'application-key',
          AWS_SECRET_ACCESS_KEY: 'application-secret',
          AWS_PROFILE: 'application-profile',
          BACKUP_AWS_ACCESS_KEY_ID: '',
          BACKUP_AWS_SECRET_ACCESS_KEY: '',
          BACKUP_AWS_SESSION_TOKEN: '',
          BACKUP_AWS_PROFILE: 'backup-writer',
        },
      },
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toBe('backup-writer||');
  });

  it.each([
    {
      label: 'all privacy controls are active',
      publicAccessBlock: 'True\tTrue\tTrue\tTrue',
      policyIsPublic: 'False',
      expectedStatus: 0,
    },
    {
      label: 'one public-access block is disabled',
      publicAccessBlock: 'True\tTrue\tFalse\tTrue',
      policyIsPublic: 'False',
      expectedStatus: 1,
    },
    {
      label: 'the bucket policy is public',
      publicAccessBlock: 'True\tTrue\tTrue\tTrue',
      policyIsPublic: 'True',
      expectedStatus: 1,
    },
  ])('fails closed when $label', ({ publicAccessBlock, policyIsPublic, expectedStatus }) => {
    const fakeBin = mkdtempSync(join(tmpdir(), 'bric-aws-'));
    const fakeAws = join(fakeBin, 'aws');
    writeFileSync(
      fakeAws,
      `#!/usr/bin/env bash\nif [[ "$*" == *"get-public-access-block"* ]]; then\n  printf '%s\\n' '${publicAccessBlock}'\nelif [[ "$*" == *"get-bucket-policy-status"* ]]; then\n  printf '%s\\n' '${policyIsPublic}'\nelse\n  exit 2\nfi\n`,
      { mode: 0o755 },
    );

    try {
      const result = spawnSync('bash', [privacyScript], {
        encoding: 'utf8',
        env: {
          ...process.env,
          AWS_REGION: 'eu-west-3',
          BACKUP_S3_URI: 's3://private-backups/postgres/prod',
          PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
        },
      });

      expect(result.status).toBe(expectedStatus);
      if (expectedStatus === 0) {
        expect(result.stdout).toContain('privacy verified');
      } else {
        expect(result.stderr).toContain('refusing backup upload');
      }
    } finally {
      rmSync(fakeBin, { recursive: true, force: true });
    }
  });

  it('removes only expired local Postgres dumps', () => {
    const backupDir = mkdtempSync(join(tmpdir(), 'bric-backups-'));
    const expiredBackup = join(backupDir, 'postgres-20260101-000000.sql.gz');
    const recentBackup = join(backupDir, 'postgres-20260815-000000.sql.gz');
    const unrelatedFile = join(backupDir, 'redis-20260101-000000.rdb');

    try {
      for (const path of [expiredBackup, recentBackup, unrelatedFile]) writeFileSync(path, 'test');
      const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
      utimesSync(expiredBackup, tenDaysAgo, tenDaysAgo);
      utimesSync(unrelatedFile, tenDaysAgo, tenDaysAgo);
      utimesSync(recentBackup, twoDaysAgo, twoDaysAgo);

      const result = spawnSync('bash', [pruneScript], {
        encoding: 'utf8',
        env: { ...process.env, BACKUP_DIR: backupDir, BACKUP_LOCAL_KEEP_DAYS: '7' },
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('pruned 1 local postgres backup(s)');
      expect(existsSync(expiredBackup)).toBe(false);
      expect(existsSync(recentBackup)).toBe(true);
      expect(existsSync(unrelatedFile)).toBe(true);
    } finally {
      rmSync(backupDir, { recursive: true, force: true });
    }
  });

  it('rejects an unsafe retention value before deleting anything', () => {
    const backupDir = mkdtempSync(join(tmpdir(), 'bric-backups-'));
    const backup = join(backupDir, 'postgres-20260101-000000.sql.gz');
    writeFileSync(backup, 'test');

    try {
      const result = spawnSync('bash', [pruneScript], {
        encoding: 'utf8',
        env: { ...process.env, BACKUP_DIR: backupDir, BACKUP_LOCAL_KEEP_DAYS: '0' },
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain('must be a positive integer');
      expect(existsSync(backup)).toBe(true);
    } finally {
      rmSync(backupDir, { recursive: true, force: true });
    }
  });
});
