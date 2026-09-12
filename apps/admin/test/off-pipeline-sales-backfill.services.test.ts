import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';

import { getDb, getPool } from '@bric/db/client';
import {
  actionLogs,
  adminMutationIdempotency,
  offPipelineSales,
  processedOrders,
} from '@bric/db/schema';
import { applyHistoryAction } from '../lib/action-history';
import { deleteOffPipelineSale } from '../lib/off-pipeline-sales';
import { backfillLegacyManualOrders } from '../lib/off-pipeline-sales-backfill';

afterAll(async () => {
  await getPool().end();
});

it('recovers old migration provenance, repairs existing double counts, and preserves direct sales', async () => {
  const db = getDb();
  const tracking = randomUUID();
  const pendingTracking = randomUUID();
  const rows = await db
    .insert(offPipelineSales)
    .values(
      [
        {
          reference: `legacy-manual:${tracking}`,
          note: 'Migrated from retired manual record MANUAL-123.',
        },
        {
          reference: `legacy-manual:${pendingTracking}`,
          note: 'Migrated from retired manual record MANUAL-456.',
        },
        { reference: `legacy-manual:${tracking}`, note: 'A separate direct sale' },
      ].map((fields) => ({
        ...fields,
        description: 'Legacy off-pipeline sale',
        recognizedOn: '2026-09-01',
        amountCollected: '18000',
      })),
    )
    .returning();
  await db
    .insert(processedOrders)
    .values({ orderId: '123', tracking, importBatchId: tracking, amountCollected: '18000' });
  try {
    await backfillLegacyManualOrders(db);
    await backfillLegacyManualOrders(db);
    const remaining = await db
      .select()
      .from(offPipelineSales)
      .where(
        inArray(
          offPipelineSales.id,
          rows.map((row) => row.id),
        ),
      );
    expect(remaining).toHaveLength(2);
    expect(remaining.find((row) => row.id === rows[1]!.id)?.legacyTracking).toBe(pendingTracking);
    expect(remaining.find((row) => row.id === rows[2]!.id)?.legacyTracking).toBeNull();
  } finally {
    await db.delete(offPipelineSales).where(
      inArray(
        offPipelineSales.id,
        rows.map((row) => row.id),
      ),
    );
    await db.delete(processedOrders).where(eq(processedOrders.tracking, tracking));
  }
});

it('refuses to restore a deleted migrated sale after its carrier settlement arrives', async () => {
  const db = getDb();
  const tracking = randomUUID();
  const [sale] = await db
    .insert(offPipelineSales)
    .values({
      legacyTracking: tracking,
      description: 'Migrated sale',
      recognizedOn: '2026-09-01',
      amountCollected: '18000',
    })
    .returning();
  try {
    await deleteOffPipelineSale({ id: sale!.id, requestId: tracking }, { email: tracking }, db);
    const [action] = await db.select().from(actionLogs).where(eq(actionLogs.createdBy, tracking));
    await db
      .insert(processedOrders)
      .values({ orderId: '123', tracking, importBatchId: tracking, amountCollected: '18000' });
    await expect(
      applyHistoryAction(db, { actionLogId: action!.id, direction: 'undo' }),
    ).rejects.toThrow('already represented by a carrier settlement');
    expect(
      await db.select().from(offPipelineSales).where(eq(offPipelineSales.id, sale!.id)),
    ).toEqual([]);
  } finally {
    await db.delete(actionLogs).where(eq(actionLogs.createdBy, tracking));
    await db
      .delete(adminMutationIdempotency)
      .where(eq(adminMutationIdempotency.requestId, tracking));
    await db.delete(offPipelineSales).where(eq(offPipelineSales.id, sale!.id));
    await db.delete(processedOrders).where(eq(processedOrders.tracking, tracking));
  }
});
