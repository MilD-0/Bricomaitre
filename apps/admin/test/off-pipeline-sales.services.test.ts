import { randomUUID } from 'node:crypto';

import { getDb, getPool } from '@bric/db/client';
import {
  actionLogs,
  adminMutationIdempotency,
  ecotrackOrderStates,
  offPipelineSales,
  orders,
  products,
} from '@bric/db/schema';
import { eq, inArray, sql } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';
import {
  createOffPipelineSale,
  deleteOffPipelineSale,
  listOffPipelineSales,
  updateOffPipelineSale,
} from '../lib/off-pipeline-sales';
import { loadRealizedDayEconomics } from '../lib/profit-tracker/sources';

const db = getDb();
const actor = { email: `off-pipeline-${randomUUID()}@example.invalid`, name: 'Test operator' };
const createRequestId = randomUUID();
const updateRequestId = randomUUID();
const deleteRequestId = randomUUID();
let createdId: number | null = null;

async function tableCount(table: typeof orders | typeof products | typeof ecotrackOrderStates) {
  const [row] = await db.select({ value: sql<number>`count(*)::int` }).from(table);
  return row!.value;
}

afterAll(async () => {
  await db.delete(actionLogs).where(eq(actionLogs.createdBy, actor.email));
  await db
    .delete(adminMutationIdempotency)
    .where(
      inArray(adminMutationIdempotency.requestId, [
        createRequestId,
        updateRequestId,
        deleteRequestId,
      ]),
    );
  if (createdId) await db.delete(offPipelineSales).where(eq(offPipelineSales.id, createdId));
  await getPool().end();
});

it('records auditable financial contribution without touching the commerce pipeline', async () => {
  const pipelineBefore = await Promise.all([
    tableCount(orders),
    tableCount(products),
    tableCount(ecotrackOrderStates),
  ]);
  const realizedBefore =
    (await loadRealizedDayEconomics(db, '2026-09-01', '2026-09-01')).find(
      (day) => day.date === '2026-09-01',
    ) ?? null;
  const input = {
    requestId: createRequestId,
    reference: actor.email,
    description: 'Direct counter sale',
    recognizedOn: '2026-09-01',
    amountCollectedDzd: 18_000,
    feesDzd: 500,
    productCostDzd: 11_000,
  };

  const created = await createOffPipelineSale(input, actor, db);
  const replayed = await createOffPipelineSale(input, actor, db);
  expect(created).toMatchObject({
    status: 'created',
    replayed: false,
    current: { netRevenueDzd: 17_500, realizedProfitDzd: 6_500 },
  });
  expect(replayed).toMatchObject({ status: 'created', replayed: true });

  const id = created.current.id;
  createdId = id;
  const updated = await updateOffPipelineSale(
    { id, requestId: updateRequestId, changes: { feesDzd: 750 } },
    actor,
    db,
  );
  expect(updated).toMatchObject({
    status: 'updated',
    current: { feesDzd: 750, realizedProfitDzd: 6_250 },
  });
  expect((await listOffPipelineSales({ search: actor.email }, db)).items).toHaveLength(1);

  const realized = (await loadRealizedDayEconomics(db, '2026-09-01', '2026-09-01')).find(
    (day) => day.date === '2026-09-01',
  )!;
  expect(realized).toMatchObject({
    settledOrders: realizedBefore?.settledOrders ?? 0,
    offPipelineSales: (realizedBefore?.offPipelineSales ?? 0) + 1,
    amountCollectedDzd: (realizedBefore?.amountCollectedDzd ?? 0) + 18_000,
    feesDzd: (realizedBefore?.feesDzd ?? 0) + 750,
    realizedProfitDzd: (realizedBefore?.realizedProfitDzd ?? 0) + 6_250,
  });
  expect(
    await Promise.all([tableCount(orders), tableCount(products), tableCount(ecotrackOrderStates)]),
  ).toEqual(pipelineBefore);

  await expect(
    deleteOffPipelineSale({ id, requestId: deleteRequestId }, actor, db),
  ).resolves.toMatchObject({ status: 'deleted' });
});
