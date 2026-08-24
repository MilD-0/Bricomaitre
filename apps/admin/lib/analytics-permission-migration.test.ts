import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('analytics permission migration', () => {
  it('adds the enum before backfilling roles that held ops access', () => {
    const cwd = process.cwd();
    const journal = JSON.parse(
      readFileSync(resolve(cwd, 'drizzle/migrations/meta/_journal.json'), 'utf8'),
    ) as { entries: Array<{ tag: string }> };
    const enumIndex = journal.entries.findIndex((entry) => entry.tag === '0076_confused_frog_thor');
    const backfillIndex = journal.entries.findIndex(
      (entry) => entry.tag === '0077_backfill-analytics-manage',
    );

    expect(enumIndex).toBeGreaterThan(-1);
    expect(backfillIndex).toBe(enumIndex + 1);
    expect(
      readFileSync(resolve(cwd, 'drizzle/migrations/0076_confused_frog_thor.sql'), 'utf8'),
    ).toContain("ADD VALUE 'analytics_manage'");
    const backfill = readFileSync(
      resolve(cwd, 'drizzle/migrations/0077_backfill-analytics-manage.sql'),
      'utf8',
    );
    expect(backfill).toContain('WHERE "permission" = \'ops_view\'');
    expect(backfill).toContain('ON CONFLICT ("role_id", "permission") DO NOTHING');
  });

  it('removes obsolete AI assignments before contracting the enum', () => {
    const cwd = process.cwd();
    const journal = JSON.parse(
      readFileSync(resolve(cwd, 'drizzle/migrations/meta/_journal.json'), 'utf8'),
    ) as { entries: Array<{ tag: string }> };
    const cleanupIndex = journal.entries.findIndex(
      (entry) => entry.tag === '0078_remove-ai-permission-assignments',
    );
    const enumIndex = journal.entries.findIndex((entry) => entry.tag === '0079_jazzy_doomsday');
    expect(cleanupIndex).toBeGreaterThan(-1);
    expect(enumIndex).toBe(cleanupIndex + 1);

    const cleanup = readFileSync(
      resolve(cwd, 'drizzle/migrations/0078_remove-ai-permission-assignments.sql'),
      'utf8',
    );
    expect(cleanup).toContain('DELETE FROM "admin"."role_definition_permissions"');
    expect(cleanup).toContain("'ai_use'");
    const contraction = readFileSync(
      resolve(cwd, 'drizzle/migrations/0079_jazzy_doomsday.sql'),
      'utf8',
    );
    expect(contraction).toContain('DROP TYPE "admin"."admin_role_permission"');
    expect(contraction).not.toContain("'ai_use'");
    expect(contraction).toContain("'analytics_manage'");
  });
});
