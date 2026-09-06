import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const verifier = resolve(workspaceRoot, 'ops/scripts/verify-migration-rollback-safety.py');
const temporaryDirectories: string[] = [];

function release(migrations: Record<string, string>, exceptions: unknown[] = []) {
  const root = mkdtempSync(join(tmpdir(), 'bric-migration-release-'));
  const migrationDirectory = join(root, 'apps/admin/drizzle/migrations');
  mkdirSync(migrationDirectory, { recursive: true });
  mkdirSync(join(root, 'ops'), { recursive: true });
  for (const [name, sql] of Object.entries(migrations)) {
    writeFileSync(join(migrationDirectory, name), sql);
  }
  writeFileSync(
    join(root, 'ops/migration-rollback-exceptions.json'),
    JSON.stringify({ version: 1, exceptions }),
  );
  temporaryDirectories.push(root);
  return root;
}

function run(previous: string, candidate: string) {
  return spawnSync('python3', [verifier, previous, candidate], { encoding: 'utf8' });
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('migration rollback-safety verification', () => {
  it('accepts append-only additive migrations', () => {
    const previous = release({ '0000_base.sql': 'CREATE TABLE products (id integer);' });
    const candidate = release({
      '0000_base.sql': 'CREATE TABLE products (id integer);',
      '0001_additive.sql': 'ALTER TABLE products ADD COLUMN title text;',
    });

    const result = run(previous, candidate);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('1 historical and 1 new migration');
  });

  it('rejects edits to an already-released migration', () => {
    const previous = release({ '0000_base.sql': 'SELECT 1;' });
    const candidate = release({ '0000_base.sql': 'SELECT 2;' });

    const result = run(previous, candidate);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'historical migration was edited, removed, or reordered: 0000_base.sql',
    );
  });

  it('rejects destructive DDL before the database is changed', () => {
    const previous = release({ '0000_base.sql': 'SELECT 1;' });
    const candidate = release({
      '0000_base.sql': 'SELECT 1;',
      '0001_contract.sql': 'ALTER TABLE products DROP COLUMN legacy_title;',
    });

    const result = run(previous, candidate);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('rollback-incompatible DDL (drop a column)');
  });

  it.each([
    [
      'a check constraint',
      'ALTER TABLE products ADD CONSTRAINT positive_price CHECK (price >= 0);',
      'add a table constraint',
    ],
    ['a unique constraint', 'ALTER TABLE products ADD UNIQUE (slug);', 'add a table constraint'],
    [
      'a foreign-key constraint',
      'ALTER TABLE products ADD FOREIGN KEY (category_id) REFERENCES categories(id);',
      'add a table constraint',
    ],
    [
      'a required column',
      'ALTER TABLE products ADD COLUMN external_id text NOT NULL;',
      'add a required column',
    ],
    [
      'a nullability tightening',
      'ALTER TABLE products ALTER COLUMN title SET NOT NULL;',
      'tighten column nullability',
    ],
    [
      'a unique index',
      'CREATE UNIQUE INDEX products_slug_unique ON products (slug);',
      'create a unique index',
    ],
  ])('rejects %s that can break the previous runtime', (_label, sql, finding) => {
    const previous = release({ '0000_base.sql': 'SELECT 1;' });
    const candidate = release({
      '0000_base.sql': 'SELECT 1;',
      '0001_constraint.sql': sql,
    });

    const result = run(previous, candidate);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`rollback-incompatible DDL (${finding})`);
  });

  it('requires an exact migration hash and review reason for an exception', () => {
    const sql = 'DROP TABLE retired_release_only_table;';
    const digest = createHash('sha256').update(sql).digest('hex');
    const previous = release({ '0000_base.sql': 'SELECT 1;' });
    const candidate = release({ '0000_base.sql': 'SELECT 1;', '0001_contract.sql': sql }, [
      {
        migration: '0001_contract.sql',
        sha256: digest,
        reason: 'The immediately previous runtime never referenced this retired table.',
      },
    ]);

    const result = run(previous, candidate);

    expect(result.status).toBe(0);
    expect(result.stderr).toContain('reviewed rollback-safety exception');
  });

  it('rejects an exception after its migration becomes historical', () => {
    const sql = 'ALTER TABLE products ADD CONSTRAINT positive_price CHECK (price >= 0);';
    const digest = createHash('sha256').update(sql).digest('hex');
    const exception = {
      migration: '0001_constraint.sql',
      sha256: digest,
      reason: 'The previous runtime validates every affected value before writing.',
    };
    const previous = release({
      '0000_base.sql': 'SELECT 1;',
      '0001_constraint.sql': sql,
    });
    const candidate = release(
      {
        '0000_base.sql': 'SELECT 1;',
        '0001_constraint.sql': sql,
      },
      [exception],
    );

    const result = run(previous, candidate);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      `unused or stale rollback-safety exception: 0001_constraint.sql ${digest}`,
    );
  });

  it('bridges the source-free current production release through its pinned baseline', () => {
    const previous = mkdtempSync(join(tmpdir(), 'bric-migration-legacy-release-'));
    const candidate = mkdtempSync(join(tmpdir(), 'bric-migration-state-release-'));
    const source = mkdtempSync(join(tmpdir(), 'bric-migration-source-release-'));
    temporaryDirectories.push(previous, candidate, source);
    cpSync(
      join(workspaceRoot, 'apps/admin/drizzle/migrations'),
      join(source, 'apps/admin/drizzle/migrations'),
      { recursive: true },
    );
    mkdirSync(join(source, 'ops'), { recursive: true });
    writeFileSync(
      join(source, 'ops/migration-rollback-exceptions.json'),
      JSON.stringify({
        version: 1,
        exceptions: [
          ...JSON.parse(
            readFileSync(join(workspaceRoot, 'ops/migration-rollback-exceptions.json'), 'utf8'),
          ).exceptions,
          {
            migration: '0088_petite_enchantress.sql',
            sha256: '26f02b2b0c6a8e6e763499ec85526ab72209da603dd26d58b7f0bcc62bc9f815',
            reason:
              'The previous runtime validates every affected value before writing to these domains.',
          },
          {
            migration: '0089_gigantic_frightful_four.sql',
            sha256: 'bf3692f8f7b53e1f8561867a558659bd95708d310d6e7d236c0a84402eb719d1',
            reason:
              'The previous runtime canonicalizes availability from stock state before every product write.',
          },
          {
            migration: '0090_sparkling_toad_men.sql',
            sha256: '7d33cf90f58514cf3791fdc82b23664285a6f2118c4e756e5d460a7055285aea',
            reason:
              'The previous runtime validates these order invariants before every affected write.',
          },
          {
            migration: '0091_deep_blonde_phantom.sql',
            sha256: 'a630e598efd176ff20e58cb66725419e6375f6bd633550638eeaff39da91b663',
            reason: 'The unique index belongs to a new table that the previous runtime never uses.',
          },
          {
            migration: '0092_clumsy_deadpool.sql',
            sha256: '9de21c5d770f7545b17bc78525544ceb521e8209481cf0496b1d837c6acbe283',
            reason: 'The required column has a default that preserves previous-runtime inserts.',
          },
          {
            migration: '0095_unique_fat_cobra.sql',
            sha256: '83ef7627724be8af731da1a4d3920f072fa89bc528f27570d46da977b8df0372',
            reason:
              'The admin config exposes only Google OAuth, existing provider/account identities are collision-free, and the migration default preserves writes from the previous runtime during rollout.',
          },
        ],
      }),
    );
    writeFileSync(
      join(previous, '.bric-release.env'),
      'BRIC_RELEASE_COMMIT=ab11790b49df28cdf99bde05052993962ad879f2\n',
    );
    writeFileSync(
      join(candidate, '.bric-release.env'),
      'BRIC_RELEASE_COMMIT=ab11790b49df28cdf99bde05052993962ad879f2\n',
    );
    const build = spawnSync(
      'python3',
      [
        verifier,
        '--build-state',
        source,
        'ab11790b49df28cdf99bde05052993962ad879f2',
        join(candidate, '.bric-migrations.json'),
      ],
      { encoding: 'utf8' },
    );

    expect(build.status).toBe(0);
    const result = run(previous, candidate);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('88 historical and ');
  });
});
