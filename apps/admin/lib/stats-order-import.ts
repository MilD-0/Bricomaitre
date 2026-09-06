import { count, desc, eq, inArray, or, sql } from 'drizzle-orm';

import { getDb } from '@bric/db/client';
import {
  brands,
  categories,
  importBatches,
  orders,
  processedOrderProducts,
  processedOrders,
  products,
  type UnmatchedImportRow,
} from '@bric/db/schema';
import {
  buildCartProductLookup,
  collectCartProductReferenceBuckets,
  getCartProductLookupKey,
} from './order-product-references';
import {
  parseStatsSpreadsheet,
  type StatsSpreadsheetRow as SpreadsheetRow,
} from './stats-spreadsheet';
import { numberOrZero, toDateInput } from './stats-values';

function isNumericOrderReference(value: string) {
  return /^\d+$/.test(value.trim());
}

export type ImportHistoryItem = {
  id: number;
  batchId: string;
  fileName: string;
  importedAt: string;
  totalRows: number;
  matchedOrders: number;
  skippedRows?: number;
  unmatchedCount: number;
  unmatchedReferences: string[];
  unmatchedDetails: UnmatchedImportRow[];
  dateRangeStart: string | null;
  dateRangeEnd: string | null;
};

export type ImportHistoryPage = {
  items: ImportHistoryItem[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
};

export type StatsImportResult = {
  batchId: string;
  newOrders: number;
  duplicateOrders: number;
  unmatchedReferences: string[];
};

export const IMPORT_HISTORY_PAGE_SIZE = 10;

function mapImportHistoryRow(row: typeof importBatches.$inferSelect): ImportHistoryItem {
  const unmatchedCount = row.unmatchedReferences.length;

  return {
    id: row.id,
    batchId: row.batchId,
    fileName: row.fileName,
    importedAt: row.importedAt.toISOString(),
    totalRows: row.totalRows,
    matchedOrders: row.matchedOrders,
    skippedRows: Math.max(0, row.totalRows - row.matchedOrders - unmatchedCount),
    unmatchedCount,
    unmatchedReferences: row.unmatchedReferences,
    unmatchedDetails: row.unmatchedDetails,
    dateRangeStart: row.dateRangeStart,
    dateRangeEnd: row.dateRangeEnd,
  };
}

export async function listImportHistoryPage({
  page,
  pageSize,
}: {
  page: number;
  pageSize: number;
}): Promise<ImportHistoryPage> {
  const db = getDb();
  const requestedPage = Math.max(1, page);
  const normalizedPageSize = Math.min(50, Math.max(1, pageSize));
  const [{ totalItems = 0 } = { totalItems: 0 }] = await db
    .select({ totalItems: count() })
    .from(importBatches);
  const totalPages = Math.max(1, Math.ceil(totalItems / normalizedPageSize));
  const normalizedPage = Math.min(requestedPage, totalPages);
  const rows = await db
    .select()
    .from(importBatches)
    .orderBy(desc(importBatches.importedAt))
    .limit(normalizedPageSize)
    .offset((normalizedPage - 1) * normalizedPageSize);

  return {
    items: rows.map(mapImportHistoryRow),
    page: normalizedPage,
    pageSize: normalizedPageSize,
    totalItems,
    totalPages,
  };
}

export async function importStatsSpreadsheet(
  buffer: Buffer,
  fileName: string,
): Promise<StatsImportResult> {
  const db = getDb();
  const rows = parseStatsSpreadsheet(buffer).filter((row) => row.reference || row.tracking);
  const batchId = crypto.randomUUID();

  const references = [...new Set(rows.map((row) => row.reference).filter(Boolean))];
  const trackings = [...new Set(rows.map((row) => row.tracking).filter(Boolean))];
  const numericReferences = references
    .filter(isNumericOrderReference)
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isFinite(value));

  const [candidateOrders, existingRows] = await Promise.all([
    numericReferences.length > 0
      ? db.select().from(orders).where(inArray(orders.id, numericReferences))
      : Promise.resolve([]),
    trackings.length > 0
      ? db
          .select({ tracking: processedOrders.tracking })
          .from(processedOrders)
          .where(inArray(processedOrders.tracking, trackings))
      : Promise.resolve([]),
  ]);

  const cartProductReferences = collectCartProductReferenceBuckets(candidateOrders);

  const productRows =
    cartProductReferences.productIds.length === 0 &&
    cartProductReferences.mongoIds.length === 0 &&
    cartProductReferences.slugs.length === 0
      ? []
      : await db
          .select({
            id: products.id,
            mongoId: products.mongoId,
            slug: products.slug,
            title: products.title,
            sku: products.sku,
            price: sql<number>`coalesce(${products.price}, 0)::double precision`,
            cost: sql<number>`coalesce(${products.purchasePrice}, 0)::double precision`,
            brandId: products.brandId,
            brandName: brands.name,
            categoryId: products.categoryId,
            categoryName: categories.name,
          })
          .from(products)
          .leftJoin(brands, eq(products.brandId, brands.id))
          .leftJoin(categories, eq(products.categoryId, categories.id))
          .where(
            or(
              ...(cartProductReferences.productIds.length > 0
                ? [inArray(products.id, cartProductReferences.productIds)]
                : []),
              ...(cartProductReferences.mongoIds.length > 0
                ? [inArray(products.mongoId, cartProductReferences.mongoIds)]
                : []),
              ...(cartProductReferences.slugs.length > 0
                ? [inArray(products.slug, cartProductReferences.slugs)]
                : []),
            ),
          );

  const orderById = new Map(candidateOrders.map((order) => [String(order.id), order]));
  const productLookup = buildCartProductLookup(productRows);
  const existingTrackings = new Set(existingRows.map((row) => row.tracking));

  let duplicateOrders = 0;
  const unmatchedReferences: string[] = [];
  const unmatchedDetails: UnmatchedImportRow[] = [];
  const processedOrderValues: Array<typeof processedOrders.$inferInsert> = [];
  const processedProductValuesByTracking = new Map<
    string,
    Array<typeof processedOrderProducts.$inferInsert>
  >();

  for (const row of rows) {
    if (!row.tracking || existingTrackings.has(row.tracking)) {
      duplicateOrders += 1;
      continue;
    }

    const matchedOrder = isNumericOrderReference(row.reference)
      ? orderById.get(row.reference.trim())
      : null;

    if (!matchedOrder) {
      unmatchedReferences.push(row.reference || row.tracking);
      unmatchedDetails.push({
        reference: row.reference,
        tracking: row.tracking,
        customerName: row.destinataire,
        phone: row.telephone,
        wilaya: row.wilaya,
        commune: row.commune,
        amountCollected: amountCollectedFromRow(row),
        products: row.produits,
        note: row.remarque,
      });
      continue;
    }

    const matchedProducts = matchedOrder.cartProducts
      .map((value) => getCartProductLookupKey(value))
      .filter((value): value is string => Boolean(value))
      .map((lookupKey) => productLookup.get(lookupKey))
      .filter((value): value is NonNullable<typeof value> => Boolean(value));

    const productCost = matchedProducts.reduce(
      (sum, product) => sum + numberOrZero(product.cost),
      0,
    );
    const totalFees =
      row.totalFraisService > 0
        ? row.totalFraisService
        : row.fraisLivraison +
          row.fraisPoids +
          row.fraisExtra +
          row.fraisSMS +
          row.fraisStockage +
          row.commissionRecouvrement;
    const amountCollected = row.encaisse > 0 ? row.encaisse : row.montant;
    const netRevenue = row.netRecouvret > 0 ? row.netRecouvret : amountCollected - totalFees;
    const profit = netRevenue - productCost;

    processedOrderValues.push({
      orderId: String(matchedOrder.id),
      tracking: row.tracking,
      customerName:
        row.destinataire ||
        [matchedOrder.firstName, matchedOrder.lastName].filter(Boolean).join(' '),
      wilaya: row.wilaya || String(matchedOrder.state || ''),
      commune: row.commune || matchedOrder.city || '',
      deliveryType: row.typePrestation || row.type || String(matchedOrder.delivery || ''),
      amountCollected: amountCollected.toFixed(2),
      totalFees: totalFees.toFixed(2),
      netRevenue: netRevenue.toFixed(2),
      productCost: productCost.toFixed(2),
      profit: profit.toFixed(2),
      feeLivraison: row.fraisLivraison.toFixed(2),
      feePoids: row.fraisPoids.toFixed(2),
      feeExtra: row.fraisExtra.toFixed(2),
      feeSms: row.fraisSMS.toFixed(2),
      feeStockage: row.fraisStockage.toFixed(2),
      feeCommission: row.commissionRecouvrement.toFixed(2),
      deliveredAt: row.encaisseLe,
      orderCreatedAt: matchedOrder.createdAt,
      encaissedAt: row.encaisseLe ?? row.creeLe,
      importBatchId: batchId,
    });

    processedProductValuesByTracking.set(
      row.tracking,
      matchedProducts.map((product) => ({
        processedOrderId: 0,
        productId: String(product.id),
        title: product.title,
        price: numberOrZero(product.price).toFixed(2),
        cost: numberOrZero(product.cost).toFixed(2),
        sku: product.sku,
        categoryId: product.categoryId ? String(product.categoryId) : null,
        categoryName: product.categoryName,
        brandId: product.brandId ? String(product.brandId) : null,
        brandName: product.brandName,
      })),
    );

    existingTrackings.add(row.tracking);
  }

  const importedAt = new Date();
  const importedRangeValues = processedOrderValues
    .map((row) => row.encaissedAt ?? row.orderCreatedAt)
    .filter((value): value is Date => value instanceof Date);
  const dateRangeStart =
    importedRangeValues.length > 0
      ? toDateInput(new Date(Math.min(...importedRangeValues.map((value) => value.getTime()))))
      : null;
  const dateRangeEnd =
    importedRangeValues.length > 0
      ? toDateInput(new Date(Math.max(...importedRangeValues.map((value) => value.getTime()))))
      : null;

  await db.transaction(async (tx) => {
    await tx.insert(importBatches).values({
      batchId,
      fileName,
      importedAt,
      totalRows: rows.length,
      matchedOrders: processedOrderValues.length,
      unmatchedReferences,
      unmatchedDetails,
      dateRangeStart,
      dateRangeEnd,
    });

    if (processedOrderValues.length === 0) {
      return;
    }

    const insertedOrders = await tx
      .insert(processedOrders)
      .values(processedOrderValues)
      .returning({ id: processedOrders.id, tracking: processedOrders.tracking });

    const childRows = insertedOrders.flatMap((insertedOrder) =>
      (processedProductValuesByTracking.get(insertedOrder.tracking) ?? []).map((row) => ({
        ...row,
        processedOrderId: insertedOrder.id,
      })),
    );

    if (childRows.length > 0) {
      await tx.insert(processedOrderProducts).values(childRows);
    }
  });

  return {
    batchId,
    newOrders: processedOrderValues.length,
    duplicateOrders,
    unmatchedReferences,
  };
}

export async function deleteImportBatch(batchId: string) {
  const db = getDb();

  const deletedRows = await db.transaction(async (tx) => {
    const deletedOrders = await tx
      .delete(processedOrders)
      .where(eq(processedOrders.importBatchId, batchId))
      .returning({ id: processedOrders.id });

    const deletedBatch = await tx
      .delete(importBatches)
      .where(eq(importBatches.batchId, batchId))
      .returning({ id: importBatches.id });

    return {
      deletedOrders: deletedOrders.length,
      deletedBatch: deletedBatch[0] ?? null,
    };
  });

  return deletedRows;
}

export async function dismissUnmatchedReference(batchId: string, reference: string) {
  const db = getDb();
  const batch = await db
    .select()
    .from(importBatches)
    .where(eq(importBatches.batchId, batchId))
    .limit(1);
  const row = batch[0];

  if (!row) {
    return null;
  }

  const nextReferences = row.unmatchedReferences.filter((item) => item !== reference);
  const nextDetails = row.unmatchedDetails.filter(
    (item) => item.reference !== reference && item.tracking !== reference,
  );

  await db
    .update(importBatches)
    .set({
      unmatchedReferences: nextReferences,
      unmatchedDetails: nextDetails,
      updatedAt: new Date(),
    })
    .where(eq(importBatches.batchId, batchId));

  return {
    batchId,
    reference,
    removed:
      row.unmatchedReferences.length !== nextReferences.length ||
      row.unmatchedDetails.length !== nextDetails.length,
  };
}

function amountCollectedFromRow(row: SpreadsheetRow) {
  return row.encaisse > 0 ? row.encaisse : row.montant;
}
