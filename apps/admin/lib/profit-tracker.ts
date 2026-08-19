import { and, asc, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { z } from 'zod';

import { getDb } from '@bric/db/client';
import {
  metaAdsDailyInsights,
  profitTrackerDays,
  profitTrackerOperatingCosts,
  profitTrackerSettings,
} from '@bric/db/schema';
import {
  applyProfitTrackerRollforward,
  buildProfitTrackerWeeks,
  operatingCostForDay,
  summarizeProfitTracker,
  type ProfitTrackerDayInput,
  type ProfitTrackerOperatingCost,
  type ProfitTrackerSettings,
} from './profit-tracker-metrics';

type Database = ReturnType<typeof getDb>;

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_SETTINGS: ProfitTrackerSettings = {
  fxRate: 280,
  defaultReturnRate: 10,
  restFrom: null,
};

const dateOnlySchema = z
  .string()
  .regex(ISO_DATE_PATTERN)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, 'Invalid calendar date');

const nullableNonnegative = z.number().finite().nonnegative().nullable().optional();

export const profitTrackerRangeSchema = z
  .object({
    range: z.enum(['7d', '14d', '30d', '90d', 'year', 'all', 'custom']).default('30d'),
    startDate: dateOnlySchema.optional(),
    endDate: dateOnlySchema.optional(),
  })
  .superRefine((value, context) => {
    if (value.range === 'custom' && (!value.startDate || !value.endDate)) {
      context.addIssue({
        code: 'custom',
        message: 'Custom ranges require startDate and endDate.',
      });
    }
    if (value.startDate && value.endDate && value.startDate > value.endDate) {
      context.addIssue({
        code: 'custom',
        message: 'startDate must not follow endDate.',
      });
    }
  });

export const profitTrackerSettingsSchema = z.object({
  fxRate: z.number().finite().positive().max(100_000),
  defaultReturnRate: z.number().finite().min(0).max(100),
  restFrom: dateOnlySchema.nullable(),
});

export const profitTrackerDaySchema = z
  .object({
    date: dateOnlySchema,
    spendEur: nullableNonnegative,
    fbPurchases: nullableNonnegative,
    cpm: nullableNonnegative,
    ctr: z.number().finite().min(0).max(100).nullable().optional(),
    linkClicks: z.number().int().nonnegative().nullable().optional(),
    landingPageViews: nullableNonnegative,
    grossProfitDzd: z.number().finite().nullable().optional(),
    returnRatePct: z.number().finite().min(0).max(100).nullable().optional(),
    confirmedOrders: z.number().int().nonnegative().nullable().optional(),
    note: z.string().trim().max(500).nullable().optional(),
  })
  .strict();

export const profitTrackerCostSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    amountDzd: z.number().finite().nonnegative().max(1_000_000_000_000),
    period: z.enum(['monthly', 'once']),
    startDate: dateOnlySchema,
    endDate: dateOnlySchema.nullable().default(null),
  })
  .superRefine((value, context) => {
    if (value.endDate && value.endDate < value.startDate) {
      context.addIssue({
        code: 'custom',
        message: 'endDate must not precede startDate.',
        path: ['endDate'],
      });
    }
  });

export type ProfitTrackerRangeInput = z.input<typeof profitTrackerRangeSchema>;
export type ProfitTrackerDayUpdate = z.infer<typeof profitTrackerDaySchema>;
export type ProfitTrackerMetaRow = {
  day: string;
  accountCurrency: string;
  spend: string | number;
  impressions: number;
  inlineLinkClicks: number;
  landingPageViews: string | number;
  purchases: string | number;
  syncedAt: Date;
};

export type ProfitTrackerMetaSyncRange = {
  since: string;
  until: string;
  accountCurrency: string;
  syncedAt: Date;
};

function numeric(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableNumeric(value: unknown) {
  if (value == null) return null;
  const parsed = numeric(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function decimal(value: number) {
  return String(value);
}

function addDays(date: string, amount: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

function dayInTimezone(now: Date, timezone = 'Africa/Algiers') {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function resolveProfitTrackerRange(raw: ProfitTrackerRangeInput, now = new Date()) {
  const parsed = profitTrackerRangeSchema.parse(raw);
  const endDate = parsed.range === 'custom' ? parsed.endDate! : dayInTimezone(now);
  let startDate: string | null;

  switch (parsed.range) {
    case '7d':
      startDate = addDays(endDate, -6);
      break;
    case '14d':
      startDate = addDays(endDate, -13);
      break;
    case '30d':
      startDate = addDays(endDate, -29);
      break;
    case '90d':
      startDate = addDays(endDate, -89);
      break;
    case 'year':
      startDate = `${endDate.slice(0, 4)}-01-01`;
      break;
    case 'custom':
      startDate = parsed.startDate!;
      break;
    case 'all':
      startDate = null;
      break;
  }

  return { range: parsed.range, startDate, endDate };
}

function mapSettings(row: typeof profitTrackerSettings.$inferSelect | undefined) {
  if (!row) return DEFAULT_SETTINGS;
  return {
    fxRate: numeric(row.fxRate),
    defaultReturnRate: numeric(row.defaultReturnRate),
    restFrom: row.restFrom,
  } satisfies ProfitTrackerSettings;
}

function mapDay(row: typeof profitTrackerDays.$inferSelect): ProfitTrackerDayInput {
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

function mapCost(
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

export async function updateProfitTrackerSettings(
  input: z.infer<typeof profitTrackerSettingsSchema>,
  db: Database = getDb(),
) {
  const value = profitTrackerSettingsSchema.parse(input);
  const now = new Date();
  const [row] = await db
    .insert(profitTrackerSettings)
    .values({
      id: 1,
      fxRate: decimal(value.fxRate),
      defaultReturnRate: decimal(value.defaultReturnRate),
      restFrom: value.restFrom,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: profitTrackerSettings.id,
      set: {
        fxRate: decimal(value.fxRate),
        defaultReturnRate: decimal(value.defaultReturnRate),
        restFrom: value.restFrom,
        updatedAt: now,
      },
    })
    .returning();
  return mapSettings(row);
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
    spendEur: value.spendEur == null ? null : decimal(value.spendEur),
    fbPurchases: value.fbPurchases == null ? null : decimal(value.fbPurchases),
    cpm: value.cpm == null ? null : decimal(value.cpm),
    ctr: value.ctr == null ? null : decimal(value.ctr),
    linkClicks: value.linkClicks ?? null,
    landingPageViews: value.landingPageViews == null ? null : decimal(value.landingPageViews),
    grossProfitDzd: value.grossProfitDzd == null ? null : decimal(value.grossProfitDzd),
    returnRatePct:
      value.returnRatePct == null
        ? value.grossProfitDzd == null
          ? null
          : decimal(settings.defaultReturnRate)
        : decimal(value.returnRatePct),
    confirmedOrders: value.confirmedOrders ?? null,
    note: value.note || null,
    fxRateUsed: decimal(settings.fxRate),
    createdAt: now,
    updatedAt: now,
  };
  const updateValue: Partial<typeof profitTrackerDays.$inferInsert> = { updatedAt: now };
  const fieldMap = {
    spendEur: 'spendEur',
    fbPurchases: 'fbPurchases',
    cpm: 'cpm',
    ctr: 'ctr',
    linkClicks: 'linkClicks',
    landingPageViews: 'landingPageViews',
    grossProfitDzd: 'grossProfitDzd',
    returnRatePct: 'returnRatePct',
    confirmedOrders: 'confirmedOrders',
    note: 'note',
  } as const;

  for (const [inputKey, columnKey] of Object.entries(fieldMap) as Array<
    [keyof typeof fieldMap, (typeof fieldMap)[keyof typeof fieldMap]]
  >) {
    if (provided.has(inputKey)) {
      updateValue[columnKey] = insertValue[columnKey] as never;
    }
  }
  if (
    provided.has('grossProfitDzd') &&
    (!provided.has('returnRatePct') || value.returnRatePct == null) &&
    value.grossProfitDzd != null
  ) {
    updateValue.returnRatePct = decimal(settings.defaultReturnRate);
  }

  const [row] = await db
    .insert(profitTrackerDays)
    .values(insertValue)
    .onConflictDoUpdate({ target: profitTrackerDays.day, set: updateValue })
    .returning();
  return mapDay(row);
}

export async function deleteProfitTrackerDay(date: string, db: Database = getDb()) {
  const parsedDate = dateOnlySchema.parse(date);
  const rows = await db
    .delete(profitTrackerDays)
    .where(eq(profitTrackerDays.day, parsedDate))
    .returning({ day: profitTrackerDays.day });
  return rows[0]?.day ?? null;
}

export async function listProfitTrackerCosts(db: Database = getDb()) {
  const rows = await db
    .select()
    .from(profitTrackerOperatingCosts)
    .orderBy(asc(profitTrackerOperatingCosts.period), asc(profitTrackerOperatingCosts.name));
  return rows.map(mapCost);
}

export async function createProfitTrackerCost(
  input: z.input<typeof profitTrackerCostSchema>,
  db: Database = getDb(),
) {
  const value = profitTrackerCostSchema.parse(input);
  const [row] = await db
    .insert(profitTrackerOperatingCosts)
    .values({
      name: value.name,
      amountDzd: decimal(value.amountDzd),
      period: value.period,
      startDate: value.startDate,
      endDate: value.endDate,
    })
    .returning();
  return mapCost(row);
}

export async function updateProfitTrackerCost(
  id: number,
  input: z.input<typeof profitTrackerCostSchema>,
  db: Database = getDb(),
) {
  const value = profitTrackerCostSchema.parse(input);
  const [row] = await db
    .update(profitTrackerOperatingCosts)
    .set({
      name: value.name,
      amountDzd: decimal(value.amountDzd),
      period: value.period,
      startDate: value.startDate,
      endDate: value.endDate,
      updatedAt: new Date(),
    })
    .where(eq(profitTrackerOperatingCosts.id, id))
    .returning();
  return row ? mapCost(row) : null;
}

export async function deleteProfitTrackerCost(id: number, db: Database = getDb()) {
  const rows = await db
    .delete(profitTrackerOperatingCosts)
    .where(eq(profitTrackerOperatingCosts.id, id))
    .returning({ id: profitTrackerOperatingCosts.id });
  return rows[0]?.id ?? null;
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
    spendEur: decimal(aggregate.spend),
    fbPurchases: decimal(aggregate.purchases),
    cpm:
      aggregate.impressions > 0 ? decimal((aggregate.spend / aggregate.impressions) * 1_000) : '0',
    ctr:
      aggregate.impressions > 0
        ? decimal((aggregate.inlineLinkClicks / aggregate.impressions) * 100)
        : '0',
    linkClicks: aggregate.inlineLinkClicks,
    landingPageViews: decimal(aggregate.landingPageViews),
    rawMetaJson: {
      source: 'meta_ads_daily_insights',
      currency: 'EUR',
      rows: aggregate.rowCount,
    },
    fxRateUsed: decimal(settings.fxRate),
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

async function listAdsetPerformance(
  startDate: string | null,
  endDate: string,
  dayByDate: Map<string, ReturnType<typeof applyProfitTrackerRollforward>[number]>,
  fallbackFxRate: number,
  db: Database,
) {
  const conditions = [lte(metaAdsDailyInsights.day, endDate)];
  if (startDate) conditions.push(gte(metaAdsDailyInsights.day, startDate));
  const rows = await db
    .select({
      day: metaAdsDailyInsights.day,
      adsetId: metaAdsDailyInsights.adsetId,
      adsetName: sql<string | null>`max(${metaAdsDailyInsights.adsetName})`,
      spend: sql<number>`coalesce(sum(${metaAdsDailyInsights.spend}), 0)::double precision`,
      purchases: sql<number>`coalesce(sum(${metaAdsDailyInsights.purchases}), 0)::double precision`,
      purchaseValue: sql<number>`coalesce(sum(${metaAdsDailyInsights.purchaseValue}), 0)::double precision`,
    })
    .from(metaAdsDailyInsights)
    .where(and(...conditions))
    .groupBy(metaAdsDailyInsights.day, metaAdsDailyInsights.adsetId)
    .orderBy(desc(metaAdsDailyInsights.day));

  const totalsByDay = new Map<string, { purchaseValue: number; purchases: number }>();
  for (const row of rows) {
    const current = totalsByDay.get(row.day) ?? { purchaseValue: 0, purchases: 0 };
    current.purchaseValue += numeric(row.purchaseValue);
    current.purchases += numeric(row.purchases);
    totalsByDay.set(row.day, current);
  }
  const byAdset = new Map<
    string,
    {
      adsetId: string;
      adsetName: string;
      days: number;
      spendEur: number;
      purchases: number;
      purchaseValue: number;
      adCostDzd: number;
      estimatedNetProfitDzd: number;
      hasEstimate: boolean;
    }
  >();
  for (const row of rows) {
    const current = byAdset.get(row.adsetId) ?? {
      adsetId: row.adsetId,
      adsetName: row.adsetName || row.adsetId,
      days: 0,
      spendEur: 0,
      purchases: 0,
      purchaseValue: 0,
      adCostDzd: 0,
      estimatedNetProfitDzd: 0,
      hasEstimate: false,
    };
    const spend = numeric(row.spend);
    const purchases = numeric(row.purchases);
    const purchaseValue = numeric(row.purchaseValue);
    const trackedDay = dayByDate.get(row.day);
    const fxRate = trackedDay?.fxRateUsed || fallbackFxRate;
    const adCostDzd = spend * fxRate;
    const dayTotals = totalsByDay.get(row.day)!;
    const share =
      dayTotals.purchaseValue > 0
        ? purchaseValue / dayTotals.purchaseValue
        : dayTotals.purchases > 0
          ? purchases / dayTotals.purchases
          : 0;
    current.days += 1;
    current.spendEur += spend;
    current.purchases += purchases;
    current.purchaseValue += purchaseValue;
    current.adCostDzd += adCostDzd;
    if (trackedDay?.metrics.adjustedProfitDzd != null) {
      current.estimatedNetProfitDzd += trackedDay.metrics.adjustedProfitDzd * share - adCostDzd;
      current.hasEstimate = true;
    }
    byAdset.set(row.adsetId, current);
  }

  return [...byAdset.values()]
    .map((row) => ({
      ...row,
      costPerPurchaseDzd: row.purchases > 0 ? row.adCostDzd / row.purchases : null,
    }))
    .sort((left, right) => right.spendEur - left.spendEur);
}

export async function getProfitTrackerReport(
  input: ProfitTrackerRangeInput,
  options: { db?: Database; now?: Date } = {},
) {
  const db = options.db ?? getDb();
  const filters = resolveProfitTrackerRange(input, options.now);
  const settings = await getProfitTrackerSettings(db);
  const queryStartDate = filters.startDate ? addDays(filters.startDate, -7) : null;
  const dayConditions = [lte(profitTrackerDays.day, filters.endDate)];
  if (queryStartDate) dayConditions.push(gte(profitTrackerDays.day, queryStartDate));
  const [dayRows, costs] = await Promise.all([
    db
      .select()
      .from(profitTrackerDays)
      .where(and(...dayConditions))
      .orderBy(asc(profitTrackerDays.day)),
    listProfitTrackerCosts(db),
  ]);
  const rolled = applyProfitTrackerRollforward(dayRows.map(mapDay), settings);
  const selected = rolled.filter(
    (day) => (!filters.startDate || day.date >= filters.startDate) && day.date <= filters.endDate,
  );
  const effectiveStartDate = filters.startDate ?? selected.at(-1)?.date ?? null;
  const effectiveEndDate = selected[0]?.date ?? filters.endDate;
  const summary = summarizeProfitTracker(
    selected,
    costs,
    effectiveStartDate,
    effectiveStartDate ? effectiveEndDate : null,
  );
  let cumulativeNetDzd = 0;
  let cumulativeNetBeforeReturnsDzd = 0;
  let cumulativeTrueProfitDzd = 0;
  const enrichedAscending = [...selected].reverse().map((day) => {
    const operatingCostDzd = operatingCostForDay(day.date, costs);
    const trueProfitDzd =
      day.metrics.netProfitDzd == null ? null : day.metrics.netProfitDzd - operatingCostDzd;
    cumulativeNetDzd += day.metrics.netProfitDzd || 0;
    cumulativeNetBeforeReturnsDzd += day.metrics.netProfitBeforeReturnsDzd || 0;
    cumulativeTrueProfitDzd += trueProfitDzd || 0;
    return {
      ...day,
      operatingCostDzd,
      trueProfitDzd,
      cumulativeNetDzd,
      cumulativeNetBeforeReturnsDzd,
      cumulativeTrueProfitDzd,
    };
  });
  const days = enrichedAscending.reverse();
  const dayByDate = new Map(selected.map((day) => [day.date, day]));
  const adsets = await listAdsetPerformance(
    filters.startDate,
    filters.endDate,
    dayByDate,
    settings.fxRate,
    db,
  );

  return {
    filters: {
      ...filters,
      startDate: effectiveStartDate,
      endDate: effectiveEndDate,
    },
    settings,
    summary,
    days,
    weeks: buildProfitTrackerWeeks(selected, costs, filters.endDate),
    costs,
    adsets,
    freshness: {
      metaSyncedAt:
        days
          .map((day) => day.metaSyncedAt)
          .filter((value): value is string => Boolean(value))
          .sort()
          .at(-1) ?? null,
    },
  };
}

function csvCell(value: unknown) {
  const text = value == null ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export async function exportProfitTrackerCsv(
  input: ProfitTrackerRangeInput,
  options: { db?: Database; now?: Date } = {},
) {
  const report = await getProfitTrackerReport(input, options);
  const header = [
    'date',
    'spend_eur',
    'fb_purchases',
    'cpm',
    'ctr',
    'link_clicks',
    'landing_page_views',
    'gross_profit_dzd',
    'return_rate_pct',
    'confirmed_orders',
    'fx_rate_used',
    'ad_cost_dzd',
    'adjusted_profit_dzd',
    'net_profit_dzd',
    'profit_x',
    'net_profit_before_returns_dzd',
    'profit_x_before_returns',
    'cost_per_confirmed_dzd',
    'confirmation_rate_pct',
    'click_to_page_rate_pct',
    'operating_cost_dzd',
    'true_profit_dzd',
    'is_rest_day',
    'rolled_in_dzd',
    'rolled_out_dzd',
    'note',
  ];
  const lines = [...report.days]
    .reverse()
    .map((day) =>
      [
        day.date,
        day.spendEur,
        day.fbPurchases,
        day.cpm,
        day.ctr,
        day.linkClicks,
        day.landingPageViews,
        day.grossProfitDzd,
        day.returnRatePct,
        day.confirmedOrders,
        day.fxRateUsed,
        day.metrics.adCostDzd,
        day.metrics.adjustedProfitDzd,
        day.metrics.netProfitDzd,
        day.metrics.profitX,
        day.metrics.netProfitBeforeReturnsDzd,
        day.metrics.profitXBeforeReturns,
        day.metrics.costPerConfirmedDzd,
        day.metrics.confirmationRatePct,
        day.metrics.clickToPageRatePct,
        day.operatingCostDzd,
        day.trueProfitDzd,
        day.isRestDay,
        day.rolledInDzd,
        day.rolledOutDzd,
        day.note,
      ]
        .map(csvCell)
        .join(','),
    );
  return [header.join(','), ...lines].join('\n');
}
