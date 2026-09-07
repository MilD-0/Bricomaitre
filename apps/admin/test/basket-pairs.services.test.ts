import { getDb, getPool } from '@bric/db/client';
import { orderLineItems, orders, products } from '@bric/db/schema';
import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import { loadBasketPairs } from '../lib/analytics/catalog-commerce-data';
import { resolveAnalyticsFilters } from '../lib/analytics/date-range';

afterAll(async () => {
  await getPool().end();
});

const filters = resolveAnalyticsFilters({
  view: 'catalog',
  range: 'custom',
  startDate: '2089-09-01',
  endDate: '2089-09-03',
});

async function insertBasket(
  db: Pick<ReturnType<typeof getDb>, 'insert'>,
  createdAt: string,
  lines: Array<
    Pick<typeof orderLineItems.$inferInsert, 'titleSnapshot' | 'rawValue' | 'productId'> & {
      quantity?: number;
    }
  >,
) {
  const [order] = await db
    .insert(orders)
    .values({ phoneNumber1: '0550123456', createdAt: new Date(createdAt) })
    .returning({ id: orders.id });
  if (lines.length) {
    await db.insert(orderLineItems).values(
      lines.map((line, index) => ({
        ...line,
        orderId: order!.id,
        contentId: `line-${index}`,
        quantity: line.quantity ?? 1,
        originalUnitPrice: '10',
        effectiveUnitPrice: '10',
        lineTotal: String(10 * (line.quantity ?? 1)),
      })),
    );
  }
}

it('counts each eligible title pair once per order across duplicate products, snapshots and Algiers date boundaries', async () => {
  const rollback = new Error('basket fixture rollback');
  await expect(
    getDb().transaction(async (db) => {
      const marker = randomUUID();
      const catalog = await db
        .insert(products)
        .values([0, 1].map((id) => ({ title: 'Alpha', slug: `${marker}-${id}`, price: '10' })))
        .returning({ id: products.id });
      const alpha = { titleSnapshot: 'Alpha', rawValue: 'alpha', productId: catalog[0]!.id };
      const otherAlpha = { ...alpha, productId: catalog[1]!.id };
      const beta = { titleSnapshot: 'Beta', rawValue: 'legacy-beta' };
      const gamma = { titleSnapshot: 'Gamma', rawValue: 'legacy-gamma' };

      await insertBasket(db, '2089-08-31T23:00:00Z', [
        { ...alpha, quantity: 3 },
        { ...alpha, rawValue: 'another-snapshot-of-alpha' },
        otherAlpha,
        beta,
        beta,
        gamma,
      ]);
      await insertBasket(db, '2089-09-03T22:59:59.999Z', [alpha, gamma]);
      await insertBasket(db, '2089-09-02T12:00:00Z', [beta, otherAlpha]);
      await insertBasket(db, '2089-08-31T22:59:59.999Z', [alpha, gamma]);
      await insertBasket(db, '2089-09-03T23:00:00Z', [alpha, gamma]);
      await insertBasket(db, '2089-09-02T12:00:00Z', [
        { ...alpha, titleSnapshot: 'Excluded left' },
        { ...alpha, titleSnapshot: 'Excluded right', rawValue: 'another-raw-value' },
        { titleSnapshot: 'Excluded legacy', rawValue: String(alpha.productId) },
      ]);
      await insertBasket(db, '2089-09-02T12:00:00Z', []);

      expect(await loadBasketPairs(db, filters)).toEqual([
        { left: 'Alpha', right: 'Beta', orders: 2 },
        { left: 'Alpha', right: 'Gamma', orders: 2 },
        { left: 'Alpha', right: 'Alpha', orders: 1 },
        { left: 'Beta', right: 'Gamma', orders: 1 },
      ]);
      expect(
        await loadBasketPairs(db, { ...filters, startDate: '2090-01-01', endDate: '2090-01-01' }),
      ).toEqual([]);
      throw rollback;
    }),
  ).rejects.toBe(rollback);
});

it('returns the twenty most frequent pairs with both title tie-breaks independent of insertion order', async () => {
  const rollback = new Error('basket ranking fixture rollback');
  await expect(
    getDb().transaction(async (db) => {
      for (let index = 21; index >= 0; index -= 1) {
        await insertBasket(db, '2089-09-02T12:00:00Z', [
          { titleSnapshot: `Product ${String(index).padStart(2, '0')}`, rawValue: 'first' },
          { titleSnapshot: 'Anchor', rawValue: 'second' },
        ]);
      }
      await insertBasket(db, '2089-09-02T12:00:00Z', [
        { titleSnapshot: 'Product 21', rawValue: 'first' },
        { titleSnapshot: 'Anchor', rawValue: 'second' },
      ]);
      expect(await loadBasketPairs(db, filters)).toEqual([
        { left: 'Anchor', right: 'Product 21', orders: 2 },
        ...Array.from({ length: 19 }, (_, index) => ({
          left: 'Anchor',
          right: `Product ${String(index).padStart(2, '0')}`,
          orders: 1,
        })),
      ]);
      throw rollback;
    }),
  ).rejects.toBe(rollback);
});
