import { getDb } from '@bric/db/client';
import {
  profitTrackerDays,
  profitTrackerOperatingCosts,
  profitTrackerSettings,
} from '@bric/db/schema';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { runIdempotentAdminMutation } from '../admin-mutation-idempotency';
import { reportingDateSchema as dateOnlySchema } from '../analytics/contract';
import { addDays } from '../analytics/date-range';
import { numeric } from '../analytics/query-values';
import {
  DEFAULT_SETTINGS,
  profitTrackerCostPatchSchema,
  profitTrackerCostSchema,
  profitTrackerDaySchema,
  profitTrackerSettingsSchema,
  type Database,
  type ProfitTrackerDayUpdate,
  type ProfitTrackerMetaRow,
  type ProfitTrackerMetaSyncRange,
} from './contract';
import { getProfitTrackerSettings, mapCost, mapDay, mapSettings } from './records';

export async function updateProfitTrackerSettings(
  input: Partial<z.infer<typeof profitTrackerSettingsSchema>>,
  db: Database = getDb(),
) {
  const patch = profitTrackerSettingsSchema.partial().strict().parse(input);
  return db.transaction(async (tx) => {
    await tx
      .insert(profitTrackerSettings)
      .values({
        id: 1,
        fxRate: String(DEFAULT_SETTINGS.fxRate),
        defaultReturnRate: String(DEFAULT_SETTINGS.defaultReturnRate),
        restFrom: null,
      })
      .onConflictDoNothing({ target: profitTrackerSettings.id });
    const [stored] = await tx
      .select()
      .from(profitTrackerSettings)
      .where(eq(profitTrackerSettings.id, 1))
      .for('update');
    const previous = mapSettings(stored);
    const value = profitTrackerSettingsSchema.parse({ ...previous, ...patch });
    const [row] = await tx
      .update(profitTrackerSettings)
      .set({
        fxRate: String(value.fxRate),
        defaultReturnRate: String(value.defaultReturnRate),
        restFrom: value.restFrom,
        updatedAt: new Date(),
      })
      .where(eq(profitTrackerSettings.id, 1))
      .returning();
    return { previous, current: mapSettings(row) };
  });
}

export async function upsertProfitTrackerDay(
  input: ProfitTrackerDayUpdate,
  db: Database = getDb(),
) {
  const value = profitTrackerDaySchema.parse(input);
  const settings = await getProfitTrackerSettings(db);
  const now = new Date();
  const provided = new Set(Object.keys(input));
  const insertValue: typeof profitTrackerDays.$inferInsert = {
    day: value.date,
    spendEur: value.spendEur == null ? null : String(value.spendEur),
    fbPurchases: value.fbPurchases == null ? null : String(value.fbPurchases),
    cpm: value.cpm == null ? null : String(value.cpm),
    ctr: value.ctr == null ? null : String(value.ctr),
    linkClicks: value.linkClicks ?? null,
    landingPageViews: value.landingPageViews == null ? null : String(value.landingPageViews),
    grossProfitDzd: value.grossProfitDzd == null ? null : String(value.grossProfitDzd),
    returnRatePct: value.returnRatePct == null ? null : String(value.returnRatePct),
    confirmedOrders: value.confirmedOrders ?? null,
    note: value.note || null,
    fxRateUsed: String(settings.fxRate),
    createdAt: now,
    updatedAt: now,
  };
  const updateValue = {
    updatedAt: now,
    ...(provided.has('spendEur') ? { spendEur: insertValue.spendEur } : {}),
    ...(provided.has('fbPurchases') ? { fbPurchases: insertValue.fbPurchases } : {}),
    ...(provided.has('cpm') ? { cpm: insertValue.cpm } : {}),
    ...(provided.has('ctr') ? { ctr: insertValue.ctr } : {}),
    ...(provided.has('linkClicks') ? { linkClicks: insertValue.linkClicks } : {}),
    ...(provided.has('landingPageViews') ? { landingPageViews: insertValue.landingPageViews } : {}),
    ...(provided.has('grossProfitDzd') ? { grossProfitDzd: insertValue.grossProfitDzd } : {}),
    ...(provided.has('returnRatePct') ? { returnRatePct: insertValue.returnRatePct } : {}),
    ...(provided.has('confirmedOrders') ? { confirmedOrders: insertValue.confirmedOrders } : {}),
    ...(provided.has('note') ? { note: insertValue.note } : {}),
  } satisfies Partial<typeof profitTrackerDays.$inferInsert>;
  const [row] = await db
    .insert(profitTrackerDays)
    .values(insertValue)
    .onConflictDoUpdate({ target: profitTrackerDays.day, set: updateValue })
    .returning();
  return mapDay(row);
}

export async function deleteProfitTrackerDay(
  date: string,
  db: Database = getDb(),
): Promise<string | null> {
  const parsedDate = dateOnlySchema.parse(date);
  return db.transaction(async (tx) => {
    const rows = await tx
      .delete(profitTrackerDays)
      .where(eq(profitTrackerDays.day, parsedDate))
      .returning({ day: profitTrackerDays.day });
    if (rows.length) await invalidateDeletedEconomics(tx);
    return rows[0]?.day ?? null;
  });
}

// Deleted rows cannot contribute their updatedAt to the materialized-fact
// freshness check. Advance the existing global economics dependency atomically.
async function invalidateDeletedEconomics(db: Pick<Database, 'insert'>) {
  const now = new Date();
  await db
    .insert(profitTrackerSettings)
    .values({
      id: 1,
      fxRate: String(DEFAULT_SETTINGS.fxRate),
      defaultReturnRate: String(DEFAULT_SETTINGS.defaultReturnRate),
      restFrom: DEFAULT_SETTINGS.restFrom,
      updatedAt: now,
    })
    .onConflictDoUpdate({ target: profitTrackerSettings.id, set: { updatedAt: now } });
}

export async function createProfitTrackerCost(
  input: z.input<typeof profitTrackerCostSchema>,
  db: Database = getDb(),
  requestId?: string,
) {
  const value = profitTrackerCostSchema.parse(input);
  const create = async (writer: Pick<Database, 'insert'>) => {
    const [row] = await writer
      .insert(profitTrackerOperatingCosts)
      .values({
        name: value.name,
        amountDzd: String(value.amountDzd),
        period: value.period,
        startDate: value.startDate,
        endDate: value.endDate,
      })
      .returning();
    return mapCost(row);
  };
  if (!requestId) return create(db);
  return (
    await runIdempotentAdminMutation(db, {
      scope: 'profit-tracker-cost:create',
      requestId,
      payload: value,
      execute: create,
    })
  ).value;
}

export async function updateProfitTrackerCost(
  id: number,
  input: z.input<typeof profitTrackerCostPatchSchema>,
  db: Database = getDb(),
) {
  const patch = profitTrackerCostPatchSchema.parse(input);
  return db.transaction(async (tx) => {
    const [stored] = await tx
      .select()
      .from(profitTrackerOperatingCosts)
      .where(eq(profitTrackerOperatingCosts.id, id))
      .for('update');
    if (!stored) return null;
    const previous = mapCost(stored);
    const value = profitTrackerCostSchema.parse({ ...previous, ...patch });
    const [row] = await tx
      .update(profitTrackerOperatingCosts)
      .set({
        name: value.name,
        amountDzd: String(value.amountDzd),
        period: value.period,
        startDate: value.startDate,
        endDate: value.endDate,
        updatedAt: new Date(),
      })
      .where(eq(profitTrackerOperatingCosts.id, id))
      .returning();
    return { previous, current: mapCost(row) };
  });
}

export async function deleteProfitTrackerCost(id: number, db: Database = getDb()) {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .delete(profitTrackerOperatingCosts)
      .where(eq(profitTrackerOperatingCosts.id, id))
      .returning();
    if (row) await invalidateDeletedEconomics(tx);
    return row ? mapCost(row) : null;
  });
}

export async function syncProfitTrackerMetaRows(
  rows: readonly ProfitTrackerMetaRow[],
  db: Database = getDb(),
  range?: ProfitTrackerMetaSyncRange,
) {
  if (rows.length === 0 && !range) return [];
  const unsupportedCurrency =
    rows.find((row) => row.accountCurrency.toUpperCase() !== 'EUR')?.accountCurrency ??
    (range?.accountCurrency.toUpperCase() !== 'EUR' ? range?.accountCurrency : null);
  if (unsupportedCurrency) {
    throw new Error(
      `Profit tracker requires an EUR Meta account; received ${unsupportedCurrency}.`,
    );
  }

  const settings = await getProfitTrackerSettings(db);
  const byDay = new Map<
    string,
    {
      spend: number;
      impressions: number;
      inlineLinkClicks: number;
      landingPageViews: number;
      purchases: number;
      rowCount: number;
      syncedAt: Date;
    }
  >();
  for (const row of rows) {
    const current = byDay.get(row.day) ?? {
      spend: 0,
      impressions: 0,
      inlineLinkClicks: 0,
      landingPageViews: 0,
      purchases: 0,
      rowCount: 0,
      syncedAt: row.syncedAt,
    };
    current.spend += numeric(row.spend);
    current.impressions += row.impressions;
    current.inlineLinkClicks += row.inlineLinkClicks;
    current.landingPageViews += numeric(row.landingPageViews);
    current.purchases += numeric(row.purchases);
    current.rowCount += 1;
    if (row.syncedAt > current.syncedAt) current.syncedAt = row.syncedAt;
    byDay.set(row.day, current);
  }

  if (range) {
    for (let day = range.since; day <= range.until; day = addDays(day, 1)) {
      if (!byDay.has(day)) {
        byDay.set(day, {
          spend: 0,
          impressions: 0,
          inlineLinkClicks: 0,
          landingPageViews: 0,
          purchases: 0,
          rowCount: 0,
          syncedAt: range.syncedAt,
        });
      }
    }
  }

  const values = [...byDay.entries()].map(([day, aggregate]) => ({
    day,
    spendEur: String(aggregate.spend),
    fbPurchases: String(aggregate.purchases),
    cpm:
      aggregate.impressions > 0 ? String((aggregate.spend / aggregate.impressions) * 1_000) : '0',
    ctr:
      aggregate.impressions > 0
        ? String((aggregate.inlineLinkClicks / aggregate.impressions) * 100)
        : '0',
    linkClicks: aggregate.inlineLinkClicks,
    landingPageViews: String(aggregate.landingPageViews),
    rawMetaJson: {
      source: 'meta_ads_daily_insights',
      currency: 'EUR',
      rows: aggregate.rowCount,
    },
    fxRateUsed: String(settings.fxRate),
    metaSyncedAt: aggregate.syncedAt,
    updatedAt: aggregate.syncedAt,
  })) satisfies Array<typeof profitTrackerDays.$inferInsert>;

  await db
    .insert(profitTrackerDays)
    .values(values)
    .onConflictDoUpdate({
      target: profitTrackerDays.day,
      set: {
        spendEur: sql`excluded.spend_eur`,
        fbPurchases: sql`excluded.fb_purchases`,
        cpm: sql`excluded.cpm`,
        ctr: sql`excluded.ctr`,
        linkClicks: sql`excluded.link_clicks`,
        landingPageViews: sql`excluded.landing_page_views`,
        rawMetaJson: sql`excluded.raw_meta_json`,
        metaSyncedAt: sql`excluded.meta_synced_at`,
        updatedAt: sql`excluded.updated_at`,
      },
    });
  return [...byDay.keys()].sort();
}
