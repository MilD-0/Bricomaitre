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
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const backupScript = resolve(workspaceRoot, 'ops/scripts/backup-postgres.sh');
const pruneScript = resolve(workspaceRoot, 'ops/scripts/prune-postgres-backups.sh');
const privacyScript = resolve(workspaceRoot, 'ops/scripts/validate-s3-backup-privacy.sh');

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
    expect(backupIndex).toBeGreaterThan(privacyIndex);
    expect(uploadIndex).toBeGreaterThan(-1);
    expect(uploadScript).toContain('--only-show-errors');
    expect(pruneIndex).toBeGreaterThan(uploadIndex);
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
