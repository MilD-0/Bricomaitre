import { and, count, desc, eq, sql } from 'drizzle-orm';
import * as XLSX from 'xlsx';
import { z } from 'zod';

import { getDb } from '@bric/db/client';
import { adCosts, adSpendImportBatches } from '@bric/db/schema';
import { mutateEntityWithHistory, type ActionActor } from './action-history';
import {
  normalizeSpreadsheetText as normalizeText,
  parseSpreadsheetDate as parseDate,
} from './stats-spreadsheet';
import { numberOrZero, round, toDateInput } from './stats-values';

type AdCostDateFilters = {
  startDate?: string;
  endDate?: string;
};

const LEGACY_AD_SPEND_IMPORT_BATCH_ID = '00000000-0000-4000-8000-000000000001';

export const adCostEntrySchema = z.object({
  date: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/),
  platform: z.string().trim().min(1).default('facebook'),
  campaignName: z.string().trim().optional().nullable(),
  campaignId: z.string().trim().optional().nullable(),
  spend: z.number().nonnegative(),
  impressions: z.number().int().nonnegative().optional(),
  clicks: z.number().int().nonnegative().optional(),
  conversions: z.number().int().nonnegative().optional(),
  reach: z.number().int().nonnegative().optional(),
  notes: z.string().trim().optional().nullable(),
  importBatchId: z.string().uuid().optional().nullable(),
});

export type AdCostEntryInput = z.infer<typeof adCostEntrySchema>;

export function buildAdCostWhere(filters: AdCostDateFilters) {
  const conditions = [];

  if (filters.startDate) {
    conditions.push(sql`${adCosts.date} >= ${filters.startDate}`);
  }

  if (filters.endDate) {
    conditions.push(sql`${adCosts.date} <= ${filters.endDate}`);
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}

function valueFor(row: Record<string, unknown>, names: string[]) {
  for (const name of names) {
    if (row[name] !== undefined && row[name] !== null && row[name] !== '') {
      return row[name];
    }
  }

  return undefined;
}

export async function listAdCosts(filters: AdCostDateFilters) {
  const db = getDb();
  const adWhere = buildAdCostWhere(filters);
  const rows = await db
    .select()
    .from(adCosts)
    .where(adWhere)
    .orderBy(desc(adCosts.date))
    .limit(500);
  return rows.map((row) => ({
    id: String(row.id),
    date: row.date,
    platform: row.platform,
    campaignName: row.campaignName,
    campaignId: row.campaignId,
    spend: numberOrZero(row.spend),
    impressions: row.impressions ?? 0,
    clicks: row.clicks ?? 0,
    conversions: row.conversions ?? 0,
    reach: row.reach ?? 0,
    notes: row.notes,
    importBatchId: row.importBatchId,
  }));
}

export async function listAdSpendImportBatches() {
  const db = getDb();
  await ensureLegacyAdSpendImportBatch();
  const rows = await db
    .select({
      batchId: adSpendImportBatches.batchId,
      fileName: adSpendImportBatches.fileName,
      rate: adSpendImportBatches.rate,
      totalRows: adSpendImportBatches.totalRows,
      importedRows: adSpendImportBatches.importedRows,
      updatedRows: adSpendImportBatches.updatedRows,
      importedAt: adSpendImportBatches.importedAt,
      currentRows: sql<number>`coalesce(count(${adCosts.id})::int, 0)`,
      currentSpend: sql<number>`coalesce(sum(${adCosts.spend})::double precision, 0)`,
      dateRangeStart: sql<string | null>`min(${adCosts.date})`,
      dateRangeEnd: sql<string | null>`max(${adCosts.date})`,
    })
    .from(adSpendImportBatches)
    .leftJoin(adCosts, eq(adCosts.importBatchId, adSpendImportBatches.batchId))
    .groupBy(
      adSpendImportBatches.id,
      adSpendImportBatches.batchId,
      adSpendImportBatches.fileName,
      adSpendImportBatches.rate,
      adSpendImportBatches.totalRows,
      adSpendImportBatches.importedRows,
      adSpendImportBatches.updatedRows,
      adSpendImportBatches.importedAt,
    )
    .orderBy(desc(adSpendImportBatches.importedAt), desc(adSpendImportBatches.id))
    .limit(100);

  return rows.map((row) => ({
    batchId: row.batchId,
    fileName: row.fileName,
    rate: numberOrZero(row.rate),
    totalRows: row.totalRows,
    importedRows: row.importedRows,
    updatedRows: row.updatedRows,
    importedAt: row.importedAt.toISOString(),
    currentRows: row.currentRows,
    currentSpend: numberOrZero(row.currentSpend),
    dateRangeStart: row.dateRangeStart,
    dateRangeEnd: row.dateRangeEnd,
  }));
}

async function ensureLegacyAdSpendImportBatch() {
  const db = getDb();
  const legacyImportWhere = and(
    sql`${adCosts.importBatchId} is null`,
    sql`${adCosts.notes} like 'Imported at rate %'`,
  );
  const [{ rows = 0 } = { rows: 0 }] = await db
    .select({ rows: count() })
    .from(adCosts)
    .where(legacyImportWhere);

  if (rows === 0) {
    return;
  }

  const now = new Date();
  await db
    .insert(adSpendImportBatches)
    .values({
      batchId: LEGACY_AD_SPEND_IMPORT_BATCH_ID,
      fileName: 'Legacy ad spend rows',
      rate: '1.0000',
      totalRows: rows,
      importedRows: rows,
      updatedRows: 0,
      importedAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: adSpendImportBatches.batchId,
      set: {
        totalRows: rows,
        importedRows: rows,
        updatedAt: now,
      },
    });

  await db
    .update(adCosts)
    .set({
      importBatchId: LEGACY_AD_SPEND_IMPORT_BATCH_ID,
      updatedAt: now,
    })
    .where(legacyImportWhere);
}

export async function upsertAdCostEntry(input: AdCostEntryInput, actor?: ActionActor) {
  const db = getDb();
  const value = adCostEntrySchema.parse(input);
  const campaignName = value.campaignName?.trim() || null;
  const now = new Date();
  const existing = await db
    .select({ id: adCosts.id })
    .from(adCosts)
    .where(
      and(
        eq(adCosts.date, value.date),
        eq(adCosts.platform, value.platform),
        campaignName
          ? eq(adCosts.campaignName, campaignName)
          : sql`${adCosts.campaignName} is null`,
      ),
    )
    .limit(1);

  if (existing[0]) {
    const [updated] = await mutateEntityWithHistory(db, {
      entityType: 'statsAdCosts',
      entityId: existing[0].id,
      operation: 'update',
      actor,
      execute: (tx) =>
        tx
          .update(adCosts)
          .set({
            campaignId: value.campaignId ?? null,
            spend: value.spend.toFixed(2),
            impressions: value.impressions,
            clicks: value.clicks,
            conversions: value.conversions,
            reach: value.reach,
            notes: value.notes ?? null,
            importBatchId: value.importBatchId ?? null,
            updatedAt: now,
          })
          .where(eq(adCosts.id, existing[0].id))
          .returning({ id: adCosts.id }),
    });

    return {
      ...updated,
      created: false,
    };
  }

  const [created] = await mutateEntityWithHistory<Array<{ id: number }>>(db, {
    entityType: 'statsAdCosts',
    operation: 'create',
    actor,
    resolveEntityId: (result) => result[0]?.id,
    execute: (tx) =>
      tx
        .insert(adCosts)
        .values({
          date: value.date,
          platform: value.platform,
          campaignName,
          campaignId: value.campaignId ?? null,
          spend: value.spend.toFixed(2),
          impressions: value.impressions,
          clicks: value.clicks,
          conversions: value.conversions,
          reach: value.reach,
          notes: value.notes ?? null,
          importBatchId: value.importBatchId ?? null,
          updatedAt: now,
        })
        .returning({ id: adCosts.id }),
  });

  return {
    ...created,
    created: true,
  };
}

export async function deleteAdCostEntry(numericId: number, actor?: ActionActor) {
  const db = getDb();
  const existing = await db
    .select({ id: adCosts.id })
    .from(adCosts)
    .where(eq(adCosts.id, numericId))
    .limit(1);
  if (!existing[0]) {
    return null;
  }

  const deleted = await mutateEntityWithHistory(db, {
    entityType: 'statsAdCosts',
    entityId: numericId,
    operation: 'delete',
    actor,
    execute: (tx) =>
      tx.delete(adCosts).where(eq(adCosts.id, numericId)).returning({ id: adCosts.id }),
  });
  return deleted[0] ?? null;
}

export async function deleteAdSpendImportBatch(batchId: string) {
  const db = getDb();
  const batch = batchId.trim();
  if (!batch) {
    return null;
  }

  const existing = await db
    .select({
      batchId: adSpendImportBatches.batchId,
      fileName: adSpendImportBatches.fileName,
    })
    .from(adSpendImportBatches)
    .where(eq(adSpendImportBatches.batchId, batch))
    .limit(1);

  if (!existing[0]) {
    return null;
  }

  const rows = await db.transaction(async (tx) => {
    const deletedRows = await tx
      .delete(adCosts)
      .where(eq(adCosts.importBatchId, batch))
      .returning({ id: adCosts.id });
    await tx.delete(adSpendImportBatches).where(eq(adSpendImportBatches.batchId, batch));
    return deletedRows.length;
  });

  return {
    ...existing[0],
    deletedRows: rows,
  };
}

export function buildAdCostEntriesFromSpreadsheetRow(row: Record<string, unknown>, rate: number) {
  const startDate = parseDate(valueFor(row, ['Reporting starts', 'Start Date', 'Date', 'date']));
  const endDate =
    parseDate(valueFor(row, ['Reporting ends', 'End Date', 'Date', 'date'])) ?? startDate;
  const spendRaw = valueFor(row, ['Amount spent (EUR)', 'Amount spent', 'spend']);

  if (!startDate || !endDate || spendRaw == null) {
    return [];
  }

  const spend = numberOrZero(spendRaw) * rate;
  const days = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000) + 1);
  const dailySpend = spend / days;

  const entries: AdCostEntryInput[] = [];
  for (let index = 0; index < days; index += 1) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + index);
    entries.push({
      date: toDateInput(date),
      platform: normalizeText(valueFor(row, ['platform', 'Platform'])) || 'facebook',
      campaignName:
        normalizeText(valueFor(row, ['Campaign name', 'Campaign Name', 'Campaign'])) || null,
      campaignId: normalizeText(valueFor(row, ['Campaign ID', 'campaign_id'])) || null,
      spend: round(dailySpend),
      impressions:
        Math.round(numberOrZero(valueFor(row, ['Impressions', 'impressions'])) / days) || undefined,
      clicks:
        Math.round(
          numberOrZero(valueFor(row, ['Clicks (all)', 'Link clicks', 'Clicks', 'clicks'])) / days,
        ) || undefined,
      conversions:
        Math.round(
          numberOrZero(
            valueFor(row, [
              'Results',
              'results',
              'Conversions',
              'Website checkouts initiated',
              'Website purchases',
            ]),
          ) / days,
        ) || undefined,
      reach: Math.round(numberOrZero(valueFor(row, ['Reach', 'reach'])) / days) || undefined,
      notes: `Imported at rate ${rate}`,
    });
  }

  return entries;
}

export async function importAdCostsSpreadsheet(
  buffer: Buffer,
  rate: number,
  fileName: string,
  actor?: ActionActor,
) {
  const db = getDb();
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = sheet ? XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet) : [];
  const batchId = crypto.randomUUID();
  const now = new Date();

  await db.insert(adSpendImportBatches).values({
    batchId,
    fileName,
    rate: rate.toFixed(4),
    totalRows: rows.length,
    uploadedByEmail: actor?.email ?? null,
    uploadedByName: actor?.name ?? null,
    updatedAt: now,
  });

  let imported = 0;
  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    const entries = buildAdCostEntriesFromSpreadsheetRow(row, rate);
    if (entries.length === 0) {
      skipped += 1;
      continue;
    }

    for (const costEntry of entries) {
      const entry = await upsertAdCostEntry({ ...costEntry, importBatchId: batchId }, actor);
      if (entry.created) {
        imported += 1;
      } else {
        updated += 1;
      }
    }
  }

  await db
    .update(adSpendImportBatches)
    .set({
      importedRows: imported,
      updatedRows: updated,
      updatedAt: new Date(),
    })
    .where(eq(adSpendImportBatches.batchId, batchId));

  return { batchId, fileName, imported, updated, skipped, total: rows.length };
}
