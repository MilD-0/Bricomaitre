import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';

import { getDb } from '@bric/db/client';
import { processedOrderProducts, processedOrders } from '@bric/db/schema';
import { mutateEntityWithHistory, type ActionActor } from './action-history';

const manualOrderProductSchema = z.object({
  productId: z.string().trim().min(1),
  title: z.string().trim().min(1),
  sku: z.string().trim().nullable().optional(),
  price: z.number().nonnegative().default(0),
  cost: z.number().nonnegative().default(0),
  categoryId: z.string().trim().nullable().optional(),
  categoryName: z.string().trim().nullable().optional(),
  brandId: z.string().trim().nullable().optional(),
  brandName: z.string().trim().nullable().optional(),
  quantity: z.number().int().positive().default(1),
});

export const manualOrderInputSchema = z.object({
  tracking: z.string().trim().min(1),
  customerName: z.string().trim().optional().default(''),
  wilaya: z.string().trim().optional().default(''),
  commune: z.string().trim().optional().default(''),
  amountCollected: z.number().nonnegative(),
  deliveryType: z.string().trim().optional().default(''),
  deliveredAt: z.string().trim().nullable().optional(),
  encaissedAt: z.string().trim().nullable().optional(),
  createdAt: z.string().trim().nullable().optional(),
  products: z.array(manualOrderProductSchema).default([]),
  feeBreakdown: z.object({
    livraison: z.number().nonnegative().default(0),
    poids: z.number().nonnegative().default(0),
    extra: z.number().nonnegative().default(0),
    sms: z.number().nonnegative().default(0),
    stockage: z.number().nonnegative().default(0),
    commission: z.number().nonnegative().default(0),
  }),
});

export const manualOrderListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
});

export type ManualOrderInput = z.infer<typeof manualOrderInputSchema>;

export class ManualOrderConflictError extends Error {
  constructor(message = 'A processed order with this tracking already exists') {
    super(message);
    this.name = 'ManualOrderConflictError';
  }
}

function numberOrZero(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function createManualOrder(input: ManualOrderInput, actor?: ActionActor) {
  const db = getDb();
  const value = manualOrderInputSchema.parse(input);
  const existing = await db
    .select({ id: processedOrders.id })
    .from(processedOrders)
    .where(eq(processedOrders.tracking, value.tracking))
    .limit(1);

  if (existing[0]) {
    throw new ManualOrderConflictError();
  }

  const totalProductCost = value.products.reduce(
    (sum, product) => sum + product.cost * product.quantity,
    0,
  );
  const totalFees =
    value.feeBreakdown.livraison +
    value.feeBreakdown.poids +
    value.feeBreakdown.extra +
    value.feeBreakdown.sms +
    value.feeBreakdown.stockage +
    value.feeBreakdown.commission;
  const netRevenue = value.amountCollected - totalFees;
  const profit = netRevenue - totalProductCost;
  const orderId = `MANUAL-${crypto.randomUUID().slice(0, 8)}`;

  return mutateEntityWithHistory<{ id: number; tracking: string }>(db, {
    entityType: 'statsManualOrders',
    operation: 'create',
    actor,
    resolveEntityId: (result) => result.id,
    execute: async (tx) => {
      const [order] = await tx
        .insert(processedOrders)
        .values({
          orderId,
          tracking: value.tracking,
          customerName: value.customerName,
          wilaya: value.wilaya,
          commune: value.commune,
          deliveryType: value.deliveryType,
          amountCollected: value.amountCollected.toFixed(2),
          totalFees: totalFees.toFixed(2),
          netRevenue: netRevenue.toFixed(2),
          productCost: totalProductCost.toFixed(2),
          profit: profit.toFixed(2),
          feeLivraison: value.feeBreakdown.livraison.toFixed(2),
          feePoids: value.feeBreakdown.poids.toFixed(2),
          feeExtra: value.feeBreakdown.extra.toFixed(2),
          feeSms: value.feeBreakdown.sms.toFixed(2),
          feeStockage: value.feeBreakdown.stockage.toFixed(2),
          feeCommission: value.feeBreakdown.commission.toFixed(2),
          deliveredAt: value.deliveredAt ? new Date(value.deliveredAt) : null,
          encaissedAt: value.encaissedAt
            ? new Date(value.encaissedAt)
            : value.deliveredAt
              ? new Date(value.deliveredAt)
              : null,
          orderCreatedAt: value.createdAt ? new Date(value.createdAt) : new Date(),
          importBatchId: 'MANUAL',
        })
        .returning({ id: processedOrders.id, tracking: processedOrders.tracking });

      const childRows = value.products.flatMap((product) =>
        Array.from({ length: product.quantity }, () => ({
          processedOrderId: order.id,
          productId: product.productId,
          title: product.title,
          price: product.price.toFixed(2),
          cost: product.cost.toFixed(2),
          sku: product.sku ?? null,
          categoryId: product.categoryId ?? null,
          categoryName: product.categoryName ?? null,
          brandId: product.brandId ?? null,
          brandName: product.brandName ?? null,
        })),
      );

      if (childRows.length > 0) {
        await tx.insert(processedOrderProducts).values(childRows);
      }

      return order;
    },
  }).catch((error: unknown) => {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
      throw new ManualOrderConflictError();
    }
    throw error;
  });
}

export async function listManualOrders(input?: z.input<typeof manualOrderListQuerySchema>) {
  const query = manualOrderListQuerySchema.parse(input ?? {});
  const db = getDb();
  const [{ value: totalItems }] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(processedOrders)
    .where(eq(processedOrders.importBatchId, 'MANUAL'));

  const totalPages = Math.max(1, Math.ceil(totalItems / query.limit));
  const page = Math.min(query.page, totalPages);
  const rows = await db
    .select({
      id: processedOrders.id,
      tracking: processedOrders.tracking,
      customerName: processedOrders.customerName,
      wilaya: processedOrders.wilaya,
      amountCollected: processedOrders.amountCollected,
      netRevenue: processedOrders.netRevenue,
      profit: processedOrders.profit,
      createdAt: processedOrders.orderCreatedAt,
    })
    .from(processedOrders)
    .where(eq(processedOrders.importBatchId, 'MANUAL'))
    .orderBy(desc(processedOrders.orderCreatedAt))
    .limit(query.limit)
    .offset((page - 1) * query.limit);

  const orderIds = rows.map((row) => row.id);
  const productRows =
    orderIds.length === 0
      ? []
      : await db
          .select({
            processedOrderId: processedOrderProducts.processedOrderId,
            title: processedOrderProducts.title,
          })
          .from(processedOrderProducts)
          .where(inArray(processedOrderProducts.processedOrderId, orderIds));

  const productsByOrder = new Map<number, Map<string, number>>();
  for (const row of productRows) {
    const bucket = productsByOrder.get(row.processedOrderId) ?? new Map<string, number>();
    bucket.set(row.title ?? 'Product', (bucket.get(row.title ?? 'Product') ?? 0) + 1);
    productsByOrder.set(row.processedOrderId, bucket);
  }

  return {
    data: rows.map((row) => ({
      id: String(row.id),
      tracking: row.tracking,
      customerName: row.customerName,
      wilaya: row.wilaya,
      amountCollected: numberOrZero(row.amountCollected),
      netRevenue: numberOrZero(row.netRevenue),
      profit: numberOrZero(row.profit),
      createdAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
      products: Array.from(productsByOrder.get(row.id)?.entries() ?? []).map(
        ([title, quantity]) => ({ title, quantity }),
      ),
    })),
    pagination: {
      page,
      limit: query.limit,
      totalItems,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };
}

export async function deleteManualOrder(id: string, actor?: ActionActor) {
  const db = getDb();
  const numericId = Number.parseInt(id, 10);
  if (!Number.isSafeInteger(numericId) || numericId <= 0) {
    return null;
  }

  const current = await db
    .select({ id: processedOrders.id })
    .from(processedOrders)
    .where(and(eq(processedOrders.id, numericId), eq(processedOrders.importBatchId, 'MANUAL')))
    .limit(1);

  if (!current[0]) {
    return null;
  }

  const deleted = await mutateEntityWithHistory(db, {
    entityType: 'statsManualOrders',
    entityId: numericId,
    operation: 'delete',
    actor,
    execute: (tx) =>
      tx
        .delete(processedOrders)
        .where(and(eq(processedOrders.id, numericId), eq(processedOrders.importBatchId, 'MANUAL')))
        .returning({ id: processedOrders.id }),
  });

  return deleted[0] ?? null;
}
