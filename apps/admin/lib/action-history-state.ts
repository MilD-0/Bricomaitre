import { isDeepStrictEqual } from 'node:util';
import { and, asc, eq, getTableColumns, inArray, ne, type InferInsertModel } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import type { getDb } from '@bric/db/client';
import {
  featuredProductGroups,
  featuredProductGroupProducts,
  featuredProductGroupBrands,
  featuredProductGroupCategories,
  landingPages,
  orderLineItems,
  orders,
  orderStatusHistory,
  productPromoCodes,
  productSlugHistory,
  products,
} from '@bric/db/schema';
import type { Transaction } from './action-history';

type Reader = ReturnType<typeof getDb> | Transaction;
type Snapshot = Record<string, unknown>;

export class ActionHistoryConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ActionHistoryConflictError';
  }
}
export class ActionHistoryEntityNotFoundError extends ActionHistoryConflictError {
  constructor(
    readonly entityType: string,
    readonly entityId: number,
  ) {
    super(`${entityType} ${entityId} was not found.`);
    this.name = 'ActionHistoryEntityNotFoundError';
  }
}

export function snapshotValues<T extends PgTable>(
  table: T,
  snapshot: Snapshot,
): InferInsertModel<T> {
  return Object.fromEntries(
    Object.entries(getTableColumns(table)).flatMap(([key, column]) => {
      const value = snapshot[key];
      if (value === undefined) return [];
      return [
        [key, column.dataType === 'date' && typeof value === 'string' ? new Date(value) : value],
      ];
    }),
  ) as InferInsertModel<T>;
}

function equal(left: unknown, right: unknown) {
  return isDeepStrictEqual(
    left === undefined ? undefined : JSON.parse(JSON.stringify(left)),
    right === undefined ? undefined : JSON.parse(JSON.stringify(right)),
  );
}
export function snapshotChanges(target: Snapshot, expected?: Snapshot) {
  return Object.fromEntries(
    Object.entries(target).filter(
      ([key, value]) => key !== 'updatedAt' && (!expected || !equal(value, expected[key])),
    ),
  );
}
export function assertChangedFieldsCurrent(
  current: Snapshot,
  target: Snapshot,
  expected: Snapshot,
) {
  for (const key of Object.keys(snapshotChanges(target, expected))) {
    // Alias history accumulates intentionally across renames, including Undo.
    if (
      key === 'slugHistory' ||
      key === 'stockHistoryVersion' ||
      key === 'aggregateVersion' ||
      key === 'stockAllocations' ||
      key === 'landingPageSlugs'
    )
      continue;
    if (!equal(current[key], expected[key])) {
      throw new ActionHistoryConflictError(
        `The current ${key} changed after this action. Refresh before recovering it.`,
      );
    }
  }
}
function records(snapshot: Snapshot, key: string): Snapshot[] {
  if (!Array.isArray(snapshot[key]))
    throw new ActionHistoryConflictError(
      `This older action has no ${key} snapshot and cannot be safely recovered.`,
    );
  return snapshot[key] as Snapshot[];
}

export async function fetchOrderState(db: Reader, id: number) {
  const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!order) return null;
  const lines = await db
    .select()
    .from(orderLineItems)
    .where(eq(orderLineItems.orderId, id))
    .orderBy(asc(orderLineItems.id));
  const statusHistory = await db
    .select()
    .from(orderStatusHistory)
    .where(eq(orderStatusHistory.orderId, id))
    .orderBy(asc(orderStatusHistory.id));
  return { ...order, lines, statusHistory, aggregateVersion: 1 };
}
async function restoreOrderRelations(
  tx: Transaction,
  id: number,
  target: Snapshot,
  expected?: Snapshot,
) {
  const lines = records(target, 'lines');
  const history = records(target, 'statusHistory');
  if (!expected || !equal(target.lines, expected.lines)) {
    await tx.delete(orderLineItems).where(eq(orderLineItems.orderId, id));
    if (lines.length)
      await tx
        .insert(orderLineItems)
        .values(lines.map((row) => snapshotValues(orderLineItems, row)));
  }
  if (!expected || !equal(target.statusHistory, expected.statusHistory)) {
    const ids = history.map((row) => Number(row.id));
    const current = await tx
      .select({ id: orderStatusHistory.id })
      .from(orderStatusHistory)
      .where(eq(orderStatusHistory.orderId, id));
    const removed = current.filter((row) => !ids.includes(row.id)).map((row) => row.id);
    if (removed.length)
      await tx.delete(orderStatusHistory).where(inArray(orderStatusHistory.id, removed));
    const existing = new Set(current.map((row) => row.id));
    const missing = history.filter((row) => !existing.has(Number(row.id)));
    if (missing.length)
      await tx
        .insert(orderStatusHistory)
        .values(missing.map((row) => snapshotValues(orderStatusHistory, row)));
  }
}
export async function insertOrderState(tx: Transaction, target: Snapshot) {
  records(target, 'lines');
  records(target, 'statusHistory');
  await tx.insert(orders).values(snapshotValues(orders, target));
  await restoreOrderRelations(tx, Number(target.id), target);
}
export async function updateOrderState(
  tx: Transaction,
  id: number,
  target: Snapshot,
  expected?: Snapshot,
) {
  records(target, 'lines');
  records(target, 'statusHistory');
  await tx
    .update(orders)
    .set({ ...snapshotValues(orders, snapshotChanges(target, expected)), updatedAt: new Date() })
    .where(eq(orders.id, id));
  await restoreOrderRelations(tx, id, target, expected);
}

export async function fetchProductState(db: Reader, id: number) {
  const [product] = await db.select().from(products).where(eq(products.id, id)).limit(1);
  if (!product) return null;
  const promoCodes = await db
    .select()
    .from(productPromoCodes)
    .where(eq(productPromoCodes.productId, id))
    .orderBy(asc(productPromoCodes.id));
  const slugHistory = await db
    .select()
    .from(productSlugHistory)
    .where(eq(productSlugHistory.productId, id))
    .orderBy(asc(productSlugHistory.id));
  const landingPageSlugs = await db
    .select({ id: landingPages.id, slug: landingPages.slug })
    .from(landingPages)
    .where(eq(landingPages.productId, id))
    .orderBy(asc(landingPages.id));
  return { ...product, promoCodes, slugHistory, landingPageSlugs, aggregateVersion: 1 };
}
async function restoreProductRelations(
  tx: Transaction,
  id: number,
  target: Snapshot,
  expected?: Snapshot,
) {
  // Earlier stock-only actions did not capture merchandising state. Their
  // allocation recovery remains valid and does not rewrite those relations.
  if (!target.aggregateVersion) {
    if (
      expected &&
      Object.keys(snapshotChanges(target, expected)).every((key) =>
        [
          'inventoryQuantity',
          'inStock',
          'availabilityStatus',
          'stockAllocations',
          'stockHistoryVersion',
        ].includes(key),
      )
    )
      return;
    throw new ActionHistoryConflictError(
      'This older product action has no complete merchandising snapshot.',
    );
  }
  const promos = records(target, 'promoCodes');
  if (!expected || !equal(target.promoCodes, expected.promoCodes)) {
    await tx.delete(productPromoCodes).where(eq(productPromoCodes.productId, id));
    if (promos.length)
      await tx
        .insert(productPromoCodes)
        .values(promos.map((row) => snapshotValues(productPromoCodes, row)));
  }
  if (!expected || target.slug !== expected.slug) {
    const [collision] = await tx
      .select({ id: productSlugHistory.id })
      .from(productSlugHistory)
      .where(
        and(eq(productSlugHistory.slug, String(target.slug)), ne(productSlugHistory.productId, id)),
      )
      .limit(1);
    if (collision) throw new ActionHistoryConflictError('Another product now owns this slug.');
    await tx
      .delete(productSlugHistory)
      .where(
        and(eq(productSlugHistory.productId, id), eq(productSlugHistory.slug, String(target.slug))),
      );
    const aliases = new Set(records(target, 'slugHistory').map((row) => String(row.slug)));
    if (expected?.slug) aliases.add(String(expected.slug));
    aliases.delete(String(target.slug));
    if (aliases.size)
      await tx
        .insert(productSlugHistory)
        .values([...aliases].map((slug) => ({ productId: id, slug })))
        .onConflictDoNothing();
    const previousPages = new Map(
      (expected ? records(expected, 'landingPageSlugs') : []).map((row) => [
        Number(row.id),
        row.slug,
      ]),
    );
    for (const page of records(target, 'landingPageSlugs')) {
      if (expected && page.slug === previousPages.get(Number(page.id))) continue;
      const [saved] = await tx
        .update(landingPages)
        .set({ slug: String(page.slug), updatedAt: new Date() })
        .where(
          and(
            eq(landingPages.id, Number(page.id)),
            eq(landingPages.productId, id),
            expected
              ? eq(landingPages.slug, String(previousPages.get(Number(page.id))))
              : undefined,
          ),
        )
        .returning({ id: landingPages.id });
      if (!saved)
        throw new ActionHistoryConflictError(
          'A related landing page changed after this product edit.',
        );
    }
  }
}
export async function insertProductState(tx: Transaction, target: Snapshot) {
  await tx.insert(products).values(snapshotValues(products, target));
  await restoreProductRelations(tx, Number(target.id), target);
}
export async function updateProductState(
  tx: Transaction,
  id: number,
  target: Snapshot,
  expected?: Snapshot,
) {
  await tx
    .update(products)
    .set({ ...snapshotValues(products, snapshotChanges(target, expected)), updatedAt: new Date() })
    .where(eq(products.id, id));
  await restoreProductRelations(tx, id, target, expected);
}

export async function fetchFeaturedGroupState(db: Reader, id: number) {
  const [group] = await db
    .select()
    .from(featuredProductGroups)
    .where(eq(featuredProductGroups.id, id))
    .limit(1);
  if (!group) return null;
  const productSelections = await db
    .select()
    .from(featuredProductGroupProducts)
    .where(eq(featuredProductGroupProducts.groupId, id))
    .orderBy(asc(featuredProductGroupProducts.productId));
  const brandSelections = await db
    .select()
    .from(featuredProductGroupBrands)
    .where(eq(featuredProductGroupBrands.groupId, id))
    .orderBy(asc(featuredProductGroupBrands.brandId));
  const categorySelections = await db
    .select()
    .from(featuredProductGroupCategories)
    .where(eq(featuredProductGroupCategories.groupId, id))
    .orderBy(asc(featuredProductGroupCategories.categoryId));
  return { ...group, productSelections, brandSelections, categorySelections, aggregateVersion: 1 };
}
async function restoreGroupRelations(
  tx: Transaction,
  id: number,
  target: Snapshot,
  expected?: Snapshot,
) {
  for (const [table, key] of [
    [featuredProductGroupProducts, 'productSelections'],
    [featuredProductGroupBrands, 'brandSelections'],
    [featuredProductGroupCategories, 'categorySelections'],
  ] as const) {
    const rows = records(target, key);
    if (expected && equal(target[key], expected[key])) continue;
    await tx.delete(table).where(eq(table.groupId, id));
    if (rows.length)
      await tx.insert(table).values(rows.map((row) => snapshotValues(table, row)) as never);
  }
}
export async function insertFeaturedGroupState(tx: Transaction, target: Snapshot) {
  await tx.insert(featuredProductGroups).values(snapshotValues(featuredProductGroups, target));
  await restoreGroupRelations(tx, Number(target.id), target);
}
export async function updateFeaturedGroupState(
  tx: Transaction,
  id: number,
  target: Snapshot,
  expected?: Snapshot,
) {
  await tx
    .update(featuredProductGroups)
    .set({
      ...snapshotValues(featuredProductGroups, snapshotChanges(target, expected)),
      updatedAt: new Date(),
    })
    .where(eq(featuredProductGroups.id, id));
  await restoreGroupRelations(tx, id, target, expected);
}
