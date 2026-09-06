import type { getDb } from '@bric/db/client';
import type { StatsFilters } from '../stats-contract';
import { buildResolvedFilters } from '../stats-live-commerce';
import {
  getMetaAdsTrackingData,
  getMetaAttributedOrderCount,
  toIsoDateString,
} from '../stats-live-traffic';

export async function loadAcquisitionDiagnostics(
  db: ReturnType<typeof getDb>,
  input: StatsFilters,
) {
  const filters = buildResolvedFilters(input);
  const [tracking, createdOrders] = await Promise.all([
    getMetaAdsTrackingData(db, filters).catch(() => null),
    getMetaAttributedOrderCount(db, filters),
  ]);
  return {
    available: tracking !== null,
    createdOrders,
    events: (tracking?.eventRows ?? []).map((row) => ({
      name: row.name,
      total: row.total,
      pixelFired: row.pixelFired,
      capiSent: row.capiSent,
      capiDelivered: row.capiDelivered,
      capiFailed: row.capiFailed,
      lastOccurredAt: toIsoDateString(row.lastOccurredAt),
    })),
  };
}
