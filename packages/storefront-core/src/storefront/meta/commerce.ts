import { orderLineItems, products } from '@bric/db/schema';
import { and, eq, inArray, isNull, or } from 'drizzle-orm';
import { parseNumericAmount } from '../../orders-support';
import { resolveOrderPromo } from '../promos';
import { type Database, type Executor, type MetaCommerceLine } from './contract';

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function buildProductConditions(productIds: number[], mongoIds: string[], slugs: string[] = []) {
  const conditions = [];
  if (productIds.length > 0) conditions.push(inArray(products.id, productIds));
  if (mongoIds.length > 0) conditions.push(inArray(products.mongoId, mongoIds));
  if (slugs.length > 0) conditions.push(inArray(products.slug, slugs));
  return conditions.length === 1 ? conditions[0] : or(...conditions);
}

export async function resolveMetaCommerceLines(
  db: Executor,
  input: {
    items: Array<{ productId: number; quantity: number }>;
    promoCode?: string | null;
    now?: Date;
  },
) {
  const quantities = new Map<number, number>();
  for (const item of input.items) {
    if (!Number.isInteger(item.productId) || item.productId <= 0) continue;
    const quantity = Math.max(1, Math.min(50, Math.trunc(item.quantity)));
    quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + quantity);
  }
  const productIds = [...quantities.keys()];
  if (productIds.length === 0) return [];

  const rows = await db
    .select({
      id: products.id,
      title: products.title,
      price: products.price,
      purchasePrice: products.purchasePrice,
      images: products.images,
    })
    .from(products)
    .where(and(eq(products.active, true), inArray(products.id, productIds)));

  const expandedCart = productIds.flatMap((productId) =>
    Array.from({ length: quantities.get(productId) ?? 1 }, () => String(productId)),
  );
  const promo = await resolveOrderPromo(db as Database, {
    cartProducts: expandedCart,
    promoCode: input.promoCode,
    now: input.now,
  });

  return rows
    .map((row): MetaCommerceLine => {
      const quantity = quantities.get(row.id) ?? 1;
      const originalUnitPrice = parseNumericAmount(row.price);
      const originalLineTotal = originalUnitPrice * quantity;
      const discountAmount = promo?.productId === row.id ? promo.discountAmount : 0;
      const lineTotal = roundCurrency(Math.max(0, originalLineTotal - discountAmount));
      return {
        productId: row.id,
        contentId: String(row.id),
        rawValue: String(row.id),
        title: row.title,
        originalUnitPrice,
        effectiveUnitPrice: roundCurrency(lineTotal / quantity),
        unitPurchasePrice:
          row.purchasePrice == null ? null : roundCurrency(parseNumericAmount(row.purchasePrice)),
        quantity,
        discountAmount: roundCurrency(discountAmount),
        lineTotal,
        thumbnailUrl: row.images[0] ?? null,
      };
    })
    .sort((a, b) => a.productId - b.productId);
}

export async function resolveOrderLineSnapshots(
  db: Executor,
  input: {
    cartProducts: string[];
    promoCode?: string | null;
    now?: Date;
    resolvedPromo?: Awaited<ReturnType<typeof resolveOrderPromo>>;
    resolvedProductPromos?: Array<{ productId: number; promoPrice: number }>;
    orderableOnly?: boolean;
  },
) {
  const numericIds = [
    ...new Set(
      input.cartProducts
        .map((value) => value.trim())
        .filter((value) => /^\d+$/.test(value))
        .map((value) => Number.parseInt(value, 10))
        .filter((value) => Number.isInteger(value) && value > 0),
    ),
  ];
  const mongoIds = [
    ...new Set(
      input.cartProducts
        .map((value) => value.trim())
        .filter((value) => /^[a-f\d]{24}$/i.test(value)),
    ),
  ];
  const slugs = [
    ...new Set(
      input.cartProducts
        .map((value) => value.trim())
        .filter(
          (value) => value.length > 0 && !/^\d+$/.test(value) && !/^[a-f\d]{24}$/i.test(value),
        ),
    ),
  ];
  if (numericIds.length === 0 && mongoIds.length === 0 && slugs.length === 0) return [];

  const condition = buildProductConditions(numericIds, mongoIds, slugs);
  if (!condition) return [];
  const rows = await db
    .select({
      id: products.id,
      mongoId: products.mongoId,
      slug: products.slug,
      title: products.title,
      price: products.price,
      purchasePrice: products.purchasePrice,
      images: products.images,
    })
    .from(products)
    .where(
      input.orderableOnly
        ? and(
            condition,
            eq(products.active, true),
            eq(products.inStock, true),
            isNull(products.archivedAt),
          )
        : condition,
    );
  const rowByReference = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    rowByReference.set(String(row.id), row);
    if (row.mongoId && mongoIds.includes(row.mongoId)) rowByReference.set(row.mongoId, row);
    if (row.slug && slugs.includes(row.slug)) rowByReference.set(row.slug, row);
  }
  const quantities = new Map<
    number,
    { row: (typeof rows)[number]; quantity: number; rawValue: string }
  >();
  for (const raw of input.cartProducts) {
    const value = raw.trim();
    const row = rowByReference.get(value);
    if (!row) continue;
    const current = quantities.get(row.id);
    quantities.set(row.id, {
      row,
      quantity: (current?.quantity ?? 0) + 1,
      rawValue: current?.rawValue ?? value,
    });
  }
  const promo =
    input.resolvedPromo === undefined
      ? await resolveOrderPromo(db as Database, {
          cartProducts: input.cartProducts,
          promoCode: input.promoCode,
          now: input.now,
        })
      : input.resolvedPromo;

  return [...quantities.values()]
    .map(({ row, quantity, rawValue }): MetaCommerceLine => {
      const originalUnitPrice = parseNumericAmount(row.price);
      const originalLineTotal = originalUnitPrice * quantity;
      const offer = input.resolvedProductPromos?.find((entry) => entry.productId === row.id);
      const discountAmount = offer
        ? Math.max(0, originalUnitPrice - offer.promoPrice) * quantity
        : promo?.productId === row.id
          ? promo.discountAmount
          : 0;
      const lineTotal = roundCurrency(Math.max(0, originalLineTotal - discountAmount));
      return {
        productId: row.id,
        contentId: String(row.id),
        rawValue,
        title: row.title,
        originalUnitPrice,
        effectiveUnitPrice: roundCurrency(lineTotal / quantity),
        unitPurchasePrice:
          row.purchasePrice == null ? null : roundCurrency(parseNumericAmount(row.purchasePrice)),
        quantity,
        discountAmount: roundCurrency(discountAmount),
        lineTotal,
        thumbnailUrl: row.images[0] ?? null,
      };
    })
    .sort((a, b) => a.productId - b.productId);
}

export async function replaceOrderLineSnapshots(
  db: Executor,
  orderId: number,
  lines: MetaCommerceLine[],
  now = new Date(),
) {
  await db.delete(orderLineItems).where(eq(orderLineItems.orderId, orderId));
  if (lines.length === 0) return;
  await db.insert(orderLineItems).values(
    lines.map((line) => ({
      orderId,
      productId: line.productId,
      contentId: line.contentId,
      rawValue: line.rawValue,
      titleSnapshot: line.title,
      originalUnitPrice: line.originalUnitPrice.toFixed(2),
      effectiveUnitPrice: line.effectiveUnitPrice.toFixed(2),
      unitPurchasePriceSnapshot:
        line.unitPurchasePrice == null ? null : line.unitPurchasePrice.toFixed(2),
      purchaseCostSource:
        line.unitPurchasePrice == null ? 'missing_at_snapshot' : 'product_catalog_snapshot',
      quantity: line.quantity,
      discountAmount: line.discountAmount.toFixed(2),
      lineTotal: line.lineTotal.toFixed(2),
      thumbnailUrl: line.thumbnailUrl,
      createdAt: now,
      updatedAt: now,
    })),
  );
}

export function buildMetaCommerceCustomData(lines: MetaCommerceLine[], orderId?: number) {
  const value = roundCurrency(lines.reduce((sum, line) => sum + line.lineTotal, 0));
  return {
    content_ids: lines.map((line) => line.contentId),
    contents: lines.map((line) => ({
      id: line.contentId,
      quantity: line.quantity,
      item_price: line.effectiveUnitPrice,
    })),
    content_type: 'product',
    currency: 'DZD',
    value,
    num_items: lines.reduce((sum, line) => sum + line.quantity, 0),
    ...(orderId ? { order_id: String(orderId) } : {}),
  };
}

export function lineRowToCommerceLine(row: typeof orderLineItems.$inferSelect): MetaCommerceLine {
  return {
    productId: row.productId ?? Number(row.contentId),
    contentId: row.contentId,
    rawValue: row.rawValue,
    title: row.titleSnapshot,
    originalUnitPrice: parseNumericAmount(row.originalUnitPrice),
    effectiveUnitPrice: parseNumericAmount(row.effectiveUnitPrice),
    unitPurchasePrice:
      row.unitPurchasePriceSnapshot == null
        ? null
        : parseNumericAmount(row.unitPurchasePriceSnapshot),
    quantity: row.quantity,
    discountAmount: parseNumericAmount(row.discountAmount),
    lineTotal: parseNumericAmount(row.lineTotal),
    thumbnailUrl: row.thumbnailUrl,
  };
}
