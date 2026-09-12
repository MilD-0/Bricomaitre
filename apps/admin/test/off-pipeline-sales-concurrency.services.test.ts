import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, expect, it, vi } from 'vitest';

import { getDb, getPool } from '@bric/db/client';
import { actionLogs, adminMutationIdempotency, offPipelineSales } from '@bric/db/schema';
import { updateOffPipelineSale } from '../lib/off-pipeline-sales';

afterAll(async () => {
  await getPool().end();
});

it('merges a correction with the committed values after waiting for a row lock', async () => {
  const db = getDb();
  const requestId = randomUUID();
  const [sale] = await db
    .insert(offPipelineSales)
    .values({
      description: 'Concurrent correction',
      recognizedOn: '2026-09-01',
      amountCollected: '18000',
      fees: '500',
      productCost: '11000',
    })
    .returning();
  const blocker = await getPool().connect();
  let correction: ReturnType<typeof updateOffPipelineSale> | undefined;
  try {
    await blocker.query('BEGIN');
    const {
      rows: [{ pid }],
    } = await blocker.query('select pg_backend_pid() as pid');
    await blocker.query('select id from admin.off_pipeline_sales where id = $1 for update', [
      sale!.id,
    ]);
    correction = updateOffPipelineSale(
      { id: sale!.id, requestId, changes: { note: 'Corrected note' } },
      { email: requestId },
      db,
    );
    await vi.waitFor(
      async () => {
        const { rows } = await getPool().query(
          'select pid from pg_stat_activity where $1 = any(pg_blocking_pids(pid))',
          [pid],
        );
        expect(rows.length).toBeGreaterThan(0);
      },
      { timeout: 5000 },
    );
    await blocker.query('update admin.off_pipeline_sales set fees = 750 where id = $1', [sale!.id]);
    await blocker.query('COMMIT');
    expect(await correction).toMatchObject({
      status: 'updated',
      previous: { feesDzd: 750 },
      current: { feesDzd: 750, note: 'Corrected note', realizedProfitDzd: 6250 },
    });
  } finally {
    await blocker.query('ROLLBACK');
    blocker.release();
    await correction?.catch(() => undefined);
    await db.delete(actionLogs).where(eq(actionLogs.createdBy, requestId));
    await db
      .delete(adminMutationIdempotency)
      .where(inArray(adminMutationIdempotency.requestId, [requestId]));
    await db.delete(offPipelineSales).where(eq(offPipelineSales.id, sale!.id));
  }
});
