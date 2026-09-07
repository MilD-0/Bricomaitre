import { and, eq, inArray, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';

import { getDb, getPool } from '@bric/db/client';
import { importBatches, orderLineItems, orders, processedOrders, products } from '@bric/db/schema';
import { getRedis } from '@bric/runtime/redis';

import { getReportingDb } from '../lib/reporting-db';
import { deleteImportBatch, importStatsSpreadsheet } from '../lib/stats-order-import';

vi.mock('../lib/server-cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/server-cache')>()),
  revalidateServerTags: vi.fn(),
}));
vi.mock('../lib/storefront-revalidate', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/storefront-revalidate')>()),
  revalidateStorefrontProducts: vi.fn(),
}));

const runId = randomUUID();

describe('real PostgreSQL and Redis contracts', () => {
  afterAll(async () => {
    await Promise.allSettled([getRedis().quit(), getPool().end(), getReportingDb().$client.end()]);
  });

  it('keeps literal historical product search semantics', async () => {
    const { orderProductSearchCondition } = await import('../lib/order-product-search');
    const rollback = new Error('reporting fixture rollback');
    await expect(
      getDb().transaction(async (tx) => {
        const [product] = await tx
          .insert(products)
          .values({
            title: 'Renamed product',
            slug: `reporting-${runId}`,
            price: '9999',
          })
          .returning();
        const createdAt = new Date('2097-06-17T12:00:00Z');
        const phone = '0550000789';
        const fixture = await tx
          .insert(orders)
          .values([
            {
              phoneNumber1: phone,
              cartProducts: [String(product.id), String(product.id)],
              inHouseStatus: 2,
              productSubtotal: '1200',
              totalAmount: '1400',
              deliveryFee: '200',
              createdAt,
            },
            {
              phoneNumber1: phone,
              cartProducts: [product.slug!],
              inHouseStatus: 3,
              price: '500',
              totalAmount: '9999',
              deliveryFee: '100',
              createdAt,
            },
            {
              phoneNumber1: phone,
              cartProducts: [String(product.id)],
              inHouseStatus: 6,
              totalAmount: '9000',
              createdAt,
            },
          ])
          .returning();
        await tx.insert(orderLineItems).values({
          orderId: fixture[0]!.id,
          productId: product.id,
          contentId: `reporting-${runId}`,
          rawValue: String(product.id),
          titleSnapshot: 'Établi 100%_solide',
          originalUnitPrice: '600',
          effectiveUnitPrice: '600',
          quantity: 2,
          lineTotal: '1200',
        });
        await tx.insert(orderLineItems).values({
          orderId: fixture[2]!.id,
          productId: product.id,
          contentId: `reporting-other-${runId}`,
          rawValue: String(product.id),
          titleSnapshot: 'Établi 100XYsolide',
          originalUnitPrice: '600',
          effectiveUnitPrice: '600',
          quantity: 1,
          lineTotal: '600',
        });
        const matched = await tx
          .select({ id: orders.id })
          .from(orders)
          .where(
            and(
              inArray(
                orders.id,
                fixture.map((row) => row.id),
              ),
              orderProductSearchCondition('etabli 100%_'),
            ),
          );
        expect(matched).toEqual([{ id: fixture[0]!.id }]);
        throw rollback;
      }),
    ).rejects.toBe(rollback);
  });

  it('bounds abandoned order searches in PostgreSQL without leaking the budget to pooled work', async () => {
    const { withOrderSearchTimeout, OrderSearchTimeoutError } = await import('../lib/order-search');
    const db = getDb();
    const before = await db.execute(sql`select current_setting('statement_timeout') as value`);
    await expect(
      withOrderSearchTimeout(db, 'slow query', async (connection) => {
        const budget = await connection.execute(
          sql`select current_setting('statement_timeout') as value`,
        );
        expect(budget.rows[0]).toEqual({ value: '10s' });
        await connection.execute(sql`set local statement_timeout = '20ms'`);
        await connection.execute(sql`select pg_sleep(0.2)`);
      }),
    ).rejects.toBeInstanceOf(OrderSearchTimeoutError);
    const after = await db.execute(sql`select current_setting('statement_timeout') as value`);
    expect(after.rows).toEqual(before.rows);
  });

  it('imports settlement rows without rebuilding dashboard snapshots synchronously', async () => {
    const db = getDb();
    const tracking = `SERVICE-${runId}`;
    const fileName = `service-stats-${runId}.xlsx`;
    const [product] = await db
      .insert(products)
      .values({
        title: 'Legacy settlement product',
        slug: `settlement-${runId}`,
        mongoId: `legacy:${runId}`,
        price: '500',
        purchasePrice: '200',
      })
      .returning();
    const [order] = await db
      .insert(orders)
      .values({
        phoneNumber1: '0550000003',
        firstName: 'Service',
        cartProducts: [product.slug!, product.mongoId!],
      })
      .returning({ id: orders.id });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        ['Référence', 'Tracking', 'Montant', 'Frais de livraison', 'Net recouvrement'],
        [String(order.id), tracking, 1500, 200, 1300],
      ]),
      'Settlement',
    );
    let batchId: string | null = null;

    try {
      const result = await importStatsSpreadsheet(
        XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer,
        fileName,
      );
      batchId = result.batchId;

      expect(result).toEqual({
        batchId: result.batchId,
        newOrders: 1,
        duplicateOrders: 0,
        unmatchedReferences: [],
      });
      await expect(
        db
          .select({ orderId: processedOrders.orderId, tracking: processedOrders.tracking })
          .from(processedOrders)
          .where(eq(processedOrders.tracking, tracking)),
      ).resolves.toEqual([{ orderId: String(order.id), tracking }]);
      const [settlement] = await db
        .select()
        .from(processedOrders)
        .where(eq(processedOrders.tracking, tracking));
      expect(settlement).toMatchObject({ productCost: '400.00', profit: '900.00' });
    } finally {
      if (batchId) {
        await deleteImportBatch(batchId);
      } else {
        const batches = await db
          .select({ batchId: importBatches.batchId })
          .from(importBatches)
          .where(eq(importBatches.fileName, fileName));
        for (const batch of batches) {
          await deleteImportBatch(batch.batchId);
        }
      }
      await db.delete(orders).where(eq(orders.id, order.id));
      await db.delete(products).where(eq(products.id, product.id));
    }
  });

  it('replays a lost expense response once, rejects changed retries, and invalidates deleted economics', async () => {
    const {
      createProfitTrackerCost,
      deleteProfitTrackerCost,
      deleteProfitTrackerDay,
      exportProfitTrackerCsv,
      updateProfitTrackerSettings,
      upsertProfitTrackerDay,
    } = await import('../lib/profit-tracker');
    const { profitTrackerOperatingCosts, profitTrackerSettings, metaAdsDailyInsights } =
      await import('@bric/db/schema');
    const { AdminMutationIdempotencyConflictError } =
      await import('../lib/admin-mutation-idempotency');
    const rollback = new Error('financial fixture rollback');
    const date = '2098-06-17';
    await expect(
      getDb().transaction(async (tx) => {
        const db = tx as unknown as ReturnType<typeof getDb>;
        await updateProfitTrackerSettings(
          { fxRate: 321, defaultReturnRate: 7, restFrom: null },
          db,
        );
        const input = {
          name: `expense-${runId}`,
          amountDzd: 3100,
          period: 'once' as const,
          startDate: date,
        };
        const requestId = randomUUID();
        const first = await createProfitTrackerCost(input, db, requestId);
        const replay = await createProfitTrackerCost(input, db, requestId);
        expect(replay).toEqual(first);
        const rows = await tx
          .select()
          .from(profitTrackerOperatingCosts)
          .where(eq(profitTrackerOperatingCosts.name, input.name));
        expect(rows).toHaveLength(1);
        await expect(
          createProfitTrackerCost({ ...input, amountDzd: 999 }, db, requestId),
        ).rejects.toBeInstanceOf(AdminMutationIdempotencyConflictError);
        await tx
          .update(profitTrackerSettings)
          .set({ updatedAt: new Date('2000-01-01') })
          .where(eq(profitTrackerSettings.id, 1));
        expect(await deleteProfitTrackerCost(first.id!, db)).toEqual(first);
        const [settings] = await tx
          .select()
          .from(profitTrackerSettings)
          .where(eq(profitTrackerSettings.id, 1));
        expect(settings!.updatedAt.getTime()).toBeGreaterThan(new Date('2000-01-01').getTime());
        expect(Number(settings!.fxRate)).toBe(321);
        expect(Number(settings!.defaultReturnRate)).toBe(7);
        await upsertProfitTrackerDay({ date, confirmedOrders: 3, note: runId }, db);
        await tx.insert(metaAdsDailyInsights).values({
          day: date,
          accountId: runId,
          accountCurrency: 'EUR',
          accountTimezone: 'Africa/Algiers',
          campaignId: runId,
          adsetId: runId,
          adId: runId,
          attributionSetting: 'test',
          actionReportTime: 'conversion',
          purchases: '2',
          syncedAt: new Date(),
        });
        const csv = await exportProfitTrackerCsv(
          { range: 'custom', startDate: date, endDate: date },
          { db },
        );
        const [header, row] = csv
          .trim()
          .split('\n')
          .map((line) => line.split(','));
        expect(row![header!.indexOf('posted_or_manual_orders')]).toBe('3');
        expect(row![header!.indexOf('posted_or_manual_orders_source')]).toBe('manual');
        expect(row![header!.indexOf('posted_or_manual_orders_to_meta_purchases_pct')]).toBe('150');
        expect(header).not.toContain('confirmation_rate_pct');
        await tx
          .update(profitTrackerSettings)
          .set({ updatedAt: new Date('2000-01-01') })
          .where(eq(profitTrackerSettings.id, 1));
        expect(await deleteProfitTrackerDay(date, db)).toBe(date);
        const [afterDay] = await tx
          .select()
          .from(profitTrackerSettings)
          .where(eq(profitTrackerSettings.id, 1));
        expect(afterDay!.updatedAt.getTime()).toBeGreaterThan(new Date('2000-01-01').getTime());
        throw rollback;
      }),
    ).rejects.toBe(rollback);
  });
});
