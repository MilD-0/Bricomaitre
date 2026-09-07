import { getDb } from '@bric/db/client';
import { brands, products } from '@bric/db/schema';
import { getRedis } from '@bric/runtime/redis';
import { asc, count } from 'drizzle-orm';
import { loadOrderRecordsByIds } from '../admin-orders-data';
import {
  type OrderExportPayload,
  type ProductCatalogFeedPayload,
  type ProductExportPayload,
} from '../background-job-contract';
import { readEcotrackCatalog } from '../ecotrack';
import {
  uploadExportArtifact,
  uploadPrivateExportArtifact,
  uploadStableArtifact,
} from '../export-artifacts';
import {
  buildMetaCatalogExportFileName,
  buildMetaCatalogExportRows,
  buildMetaCatalogWorkbook,
  toCsvBuffer,
  toXlsxBuffer,
} from '../meta-catalog';
import {
  buildOrderExportFileName,
  buildOrderExportRows,
  buildOrderExportWorkbook,
  filterRecentConfirmedOrders,
  type EcotrackCatalogExportData,
} from '../order-export';
import { ORDER_STATUS } from '../orders';
import {
  CATALOG_FEED_COMPLETED_REVISION,
  CATALOG_FEED_REQUESTED_REVISION,
  filterCatalogFeedProducts,
  PRODUCT_CATALOG_FEED_FILE_NAME,
  PRODUCT_CATALOG_FEED_OBJECT_KEY,
} from './enqueue';

export async function runProductExportJob(
  payload: ProductExportPayload,
  helpers: {
    updateProgress: (progress: { phase: string; current: number; total: number }) => Promise<void>;
    updateSummary: (summary: Record<string, unknown>) => Promise<void>;
    setDownloadUrl: (url: string) => Promise<void>;
    throwIfCancelled: () => Promise<void>;
  },
) {
  const db = getDb();
  const batchSize = Math.max(Number(process.env.PRODUCT_EXPORT_BATCH_SIZE ?? 250), 1);
  const batchDelayMs = Math.max(Number(process.env.PRODUCT_EXPORT_BATCH_DELAY_MS ?? 100), 0);

  await helpers.updateProgress({ phase: 'counting', current: 0, total: 0 });
  const [brandRows, [{ value: totalProducts }]] = await Promise.all([
    db.select({ id: brands.id, name: brands.name }).from(brands),
    db.select({ value: count() }).from(products),
  ]);

  const brandNameById = new Map(brandRows.map((brand) => [brand.id, brand.name]));
  const productRows: Array<typeof products.$inferSelect> = [];
  await helpers.updateProgress({ phase: 'loading', current: 0, total: totalProducts });

  for (let offset = 0; offset < totalProducts; offset += batchSize) {
    await helpers.throwIfCancelled();
    const batch = await db
      .select()
      .from(products)
      .orderBy(asc(products.id))
      .limit(batchSize)
      .offset(offset);
    productRows.push(...batch);
    await helpers.updateProgress({
      phase: 'loading',
      current: Math.min(offset + batch.length, totalProducts),
      total: totalProducts,
    });

    if (batchDelayMs > 0 && offset + batch.length < totalProducts) {
      await new Promise((resolve) => setTimeout(resolve, batchDelayMs));
    }
  }

  await helpers.throwIfCancelled();
  await helpers.updateProgress({
    phase: 'packaging',
    current: totalProducts,
    total: totalProducts,
  });

  const workbook = buildMetaCatalogWorkbook(buildMetaCatalogExportRows(productRows, brandNameById));
  const fileName = buildMetaCatalogExportFileName();
  const downloadUrl = await uploadExportArtifact({
    prefix: 'exports/products',
    fileName,
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    body: toXlsxBuffer(workbook),
  });

  await helpers.setDownloadUrl(downloadUrl);
  await helpers.updateSummary({ fileName, totalProducts });

  return {
    fileName,
    totalProducts,
  };
}

export async function runProductCatalogFeedRefreshJob(
  payload: ProductCatalogFeedPayload,
  helpers: {
    updateProgress: (progress: { phase: string; current: number; total: number }) => Promise<void>;
    updateSummary: (summary: Record<string, unknown>) => Promise<void>;
    setDownloadUrl: (url: string) => Promise<void>;
    throwIfCancelled: () => Promise<void>;
  },
) {
  const redis = getRedis();
  const completedRevision = Number((await redis.get(CATALOG_FEED_COMPLETED_REVISION)) ?? 0);
  if (payload.revision !== undefined && completedRevision >= payload.revision) {
    return { revision: payload.revision, coalesced: true as const };
  }
  const throughRevision = Number((await redis.get(CATALOG_FEED_REQUESTED_REVISION)) ?? 0);
  const db = getDb();
  const batchSize = Math.max(Number(process.env.PRODUCT_EXPORT_BATCH_SIZE ?? 250), 1);

  await helpers.updateProgress({ phase: 'counting', current: 0, total: 0 });
  const [brandRows, [{ value: totalProducts }]] = await Promise.all([
    db.select({ id: brands.id, name: brands.name }).from(brands),
    db.select({ value: count() }).from(products),
  ]);

  const brandNameById = new Map(brandRows.map((brand) => [brand.id, brand.name]));
  const productRows: Array<typeof products.$inferSelect> = [];
  await helpers.updateProgress({ phase: 'loading', current: 0, total: totalProducts });

  for (let offset = 0; offset < totalProducts; offset += batchSize) {
    await helpers.throwIfCancelled();
    const batch = await db
      .select()
      .from(products)
      .orderBy(asc(products.id))
      .limit(batchSize)
      .offset(offset);
    productRows.push(...batch);
    await helpers.updateProgress({
      phase: 'loading',
      current: Math.min(offset + batch.length, totalProducts),
      total: totalProducts,
    });
  }

  await helpers.throwIfCancelled();
  const rows = buildMetaCatalogExportRows(filterCatalogFeedProducts(productRows), brandNameById);
  const downloadUrl = await uploadStableArtifact({
    key: PRODUCT_CATALOG_FEED_OBJECT_KEY,
    contentType: 'text/csv; charset=utf-8',
    body: toCsvBuffer(rows),
  });

  await helpers.setDownloadUrl(downloadUrl);
  await helpers.updateProgress({
    phase: 'packaging',
    current: totalProducts,
    total: totalProducts,
  });
  const summary = {
    fileName: PRODUCT_CATALOG_FEED_FILE_NAME,
    totalProducts: rows.length,
    sourceProductCount: totalProducts,
    trigger: payload.trigger,
    updatedAt: new Date().toISOString(),
    revision: throughRevision,
    coalesced: false as const,
  };
  await helpers.updateSummary(summary);
  await redis.set(CATALOG_FEED_COMPLETED_REVISION, String(throughRevision));
  return summary;
}

export async function runOrderExportJob(
  payload: OrderExportPayload,
  helpers: {
    updateProgress: (progress: { phase: string; current: number; total: number }) => Promise<void>;
    updateSummary: (summary: Record<string, unknown>) => Promise<void>;
    setDownloadUrl: (url: string) => Promise<void>;
    throwIfCancelled: () => Promise<void>;
  },
) {
  await helpers.updateProgress({ phase: 'loading', current: 0, total: payload.orderIds.length });
  const selectedOrders = await loadOrderRecordsByIds([...payload.orderIds].sort((a, b) => a - b));
  const exportOrders =
    payload.mode === 'confirmed'
      ? filterRecentConfirmedOrders(
          selectedOrders.filter((order) => order.inHouseStatus === ORDER_STATUS.CONFIRMED),
        )
      : selectedOrders;
  await helpers.throwIfCancelled();

  const catalog = await readEcotrackCatalog(getDb());
  const exportRows = buildOrderExportRows(
    exportOrders,
    catalog satisfies EcotrackCatalogExportData,
  );
  await helpers.updateProgress({
    phase: 'exporting',
    current: exportRows.length,
    total: exportRows.length,
  });

  const fileName = buildOrderExportFileName(payload.mode);
  const workbook = buildOrderExportWorkbook(exportRows);
  const artifact = await uploadPrivateExportArtifact({
    prefix: 'exports/orders',
    fileName,
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    body: toXlsxBuffer(workbook),
  });

  await helpers.setDownloadUrl(
    `/api/orders/export/download?jobId=${encodeURIComponent(payload.__jobMeta.id)}`,
  );
  const summary = {
    fileName,
    mode: payload.mode,
    totalOrders: exportOrders.length,
    artifactKey: artifact.key,
    artifactExpiresAt: artifact.expiresAt.toISOString(),
  };
  await helpers.updateSummary(summary);
  return summary;
}
