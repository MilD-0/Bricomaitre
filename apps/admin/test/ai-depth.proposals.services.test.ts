import { getDb, getPool } from '@bric/db/client';
import { aiProposals, aiRuns, products } from '@bric/db/schema';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { runAiContentJob } from '../lib/background-jobs';

vi.mock('@bric/ai-core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@bric/ai-core')>()),
  createProductContentGenerator: () => ({
    generate: async ({ fields }: { fields: string[] }) => ({
      changes: Object.fromEntries(fields.map((field) => [field, 'Generated copy'])),
      reasoning: 'Catalog facts',
      usage: {},
      model: 'test-content',
    }),
  }),
}));

afterAll(async () => {
  await getPool().end();
});

describe('durable AI evidence', () => {
  it('regenerates stale and disjoint-field content while retaining a usable pending proposal', async () => {
    const db = getDb(),
      marker = randomUUID(),
      version = new Date('2026-01-02T00:00:00Z');
    const rows = await db
      .insert(products)
      .values(
        ['stale', 'disjoint', 'reusable'].map((label) => ({
          title: label,
          slug: `${marker}-${label}`,
          price: '100',
          updatedAt: version,
        })),
      )
      .returning();
    const [run] = await db
      .insert(aiRuns)
      .values({
        surface: 'admin',
        task: 'product_content_proposal',
        model: 'test',
        promptVersion: 'test',
        status: 'completed',
      })
      .returning();
    const owner = `${marker}@example.invalid`;
    try {
      await db.insert(aiProposals).values(
        rows.map((row, index) => ({
          runId: run!.id,
          proposalType: 'product_content',
          entityType: 'products',
          entityId: row.id,
          status: 'proposed' as const,
          sourceUpdatedAt: index === 0 ? new Date('2026-01-01T00:00:00Z') : version,
          payload: {
            changes:
              index === 1
                ? { descriptionAr: 'Existing Arabic description' }
                : { titleAr: 'Existing Arabic title' },
          },
          expiresAt: new Date(Date.now() + 86400000),
        })),
      );
      vi.stubEnv('AI_CONTENT_MODEL', 'test-content');
      const result = await runAiContentJob(
        {
          __jobMeta: { id: marker, ownerKey: owner, queueName: 'test', activeScope: 'owner' },
          productIds: rows.map((row) => row.id),
          fields: ['titleAr'],
          onlyMissing: false,
          autoApply: false,
          actor: { email: owner },
        },
        {
          throwIfCancelled: async () => {},
          updateProgress: async () => {},
          updateSummary: async () => {},
        },
      );
      expect(result).toMatchObject({ proposed: 2, alreadyProposed: 1, failed: 0, complete: true });
    } finally {
      vi.unstubAllEnvs();
      for (const row of rows) await db.delete(aiProposals).where(eq(aiProposals.entityId, row.id));
      await db.delete(aiRuns).where(eq(aiRuns.actorId, owner));
      await db.delete(aiRuns).where(eq(aiRuns.id, run!.id));
      for (const row of rows) await db.delete(products).where(eq(products.id, row.id));
    }
  });
});
