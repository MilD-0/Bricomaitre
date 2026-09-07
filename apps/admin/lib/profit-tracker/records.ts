import { getDb } from '@bric/db/client';
import {
  profitTrackerDays,
  profitTrackerOperatingCosts,
  profitTrackerSettings,
} from '@bric/db/schema';
import { asc, eq } from 'drizzle-orm';
import { nullableNumeric, numeric } from '../analytics/query-values';
import {
  type ProfitTrackerDayInput,
  type ProfitTrackerOperatingCost,
  type ProfitTrackerSettings,
} from '../profit-tracker-metrics';
import { DEFAULT_SETTINGS, type Database } from './contract';

export function mapSettings(row: typeof profitTrackerSettings.$inferSelect | undefined) {
  if (!row) return DEFAULT_SETTINGS;
  return {
    fxRate: numeric(row.fxRate),
    defaultReturnRate: numeric(row.defaultReturnRate),
    restFrom: row.restFrom,
  } satisfies ProfitTrackerSettings;
}

export function mapDay(row: typeof profitTrackerDays.$inferSelect): ProfitTrackerDayInput {
  return {
    date: row.day,
    spendEur: nullableNumeric(row.spendEur),
    fbPurchases: nullableNumeric(row.fbPurchases),
    cpm: nullableNumeric(row.cpm),
    ctr: nullableNumeric(row.ctr),
    linkClicks: row.linkClicks,
    landingPageViews: nullableNumeric(row.landingPageViews),
    grossProfitDzd: nullableNumeric(row.grossProfitDzd),
    returnRatePct: nullableNumeric(row.returnRatePct),
    confirmedOrders: row.confirmedOrders,
    note: row.note,
    fxRateUsed: numeric(row.fxRateUsed),
    metaSyncedAt: row.metaSyncedAt?.toISOString() ?? null,
  };
}

export function mapCost(
  row: typeof profitTrackerOperatingCosts.$inferSelect,
): ProfitTrackerOperatingCost & { id: number } {
  return {
    id: row.id,
    name: row.name,
    amountDzd: numeric(row.amountDzd),
    period: row.period === 'once' ? 'once' : 'monthly',
    startDate: row.startDate,
    endDate: row.endDate,
  };
}

export async function getProfitTrackerSettings(db: Database = getDb()) {
  const row = await db.query.profitTrackerSettings.findFirst({
    where: eq(profitTrackerSettings.id, 1),
  });
  return mapSettings(row);
}

export async function listProfitTrackerCosts(db: Database = getDb()) {
  const rows = await db
    .select()
    .from(profitTrackerOperatingCosts)
    .orderBy(asc(profitTrackerOperatingCosts.period), asc(profitTrackerOperatingCosts.name));
  return rows.map(mapCost);
}
