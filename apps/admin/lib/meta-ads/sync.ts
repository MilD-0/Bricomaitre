import { getDb } from '@bric/db/client';
import {
  metaAdsBreakdownDailyInsights,
  metaAdsDailyInsights,
  metaAdsDeliveryEntities,
  metaAdsSyncRuns,
} from '@bric/db/schema';
import { and, eq, gte, lte } from 'drizzle-orm';
import { refreshAnalyticsFacts } from '../analytics-facts';
import { syncProfitTrackerMetaRows } from '../profit-tracker';
import { MetaAdsSyncError, readMetaAdsConfig } from './config';
import {
  ACTION_REPORT_TIME,
  type Database,
  DEFAULT_LOOKBACK_DAYS,
  type FetchLike,
  MAX_LOOKBACK_DAYS,
  META_INSERT_BATCH_SIZE,
  type MetaAdsEnvironment,
} from './contract';
import { dateOnly, dayInTimezone, subtractDays } from './dates';
import { fetchMetaAdsInsightRows } from './fetch';

export async function syncMetaAdsInsights(
  options: {
    db?: Database;
    env?: MetaAdsEnvironment;
    fetchImpl?: FetchLike;
    now?: Date;
    since?: string;
    until?: string;
    lookbackDays?: number;
    trigger?: string;
  } = {},
) {
  const db = options.db ?? getDb();
  const config = readMetaAdsConfig(options.env);
  const now = options.now ?? new Date();
  const lookbackDays = Math.min(
    MAX_LOOKBACK_DAYS,
    Math.max(1, Math.trunc(options.lookbackDays ?? DEFAULT_LOOKBACK_DAYS)),
  );
  const provisionalUntil = dateOnly(options.until ?? dayInTimezone(now, 'Africa/Algiers'), 'until');
  const provisionalSince = dateOnly(
    options.since ?? subtractDays(provisionalUntil, lookbackDays - 1),
    'since',
  );
  if (provisionalSince > provisionalUntil) {
    throw new MetaAdsSyncError('since must not follow until.', 'invalid_date_range');
  }
  const [run] = await db
    .insert(metaAdsSyncRuns)
    .values({
      trigger: options.trigger?.slice(0, 80) || 'manual',
      status: 'running',
      apiVersion: config.apiVersion,
      accountId: config.accountId,
      sinceDay: provisionalSince,
      untilDay: provisionalUntil,
      startedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: metaAdsSyncRuns.id });

  try {
    const loaded = await fetchMetaAdsInsightRows({
      config,
      fetchImpl: options.fetchImpl ?? fetch,
      now,
      since: options.since,
      until: options.until,
      lookbackDays,
    });

    // Meta may revise an attributed result to zero and then omit its row.
    // Replace the fetched account/range atomically so stale facts cannot survive.
    await db.transaction(async (tx) => {
      await tx
        .delete(metaAdsDailyInsights)
        .where(
          and(
            eq(metaAdsDailyInsights.accountId, loaded.account.id),
            gte(metaAdsDailyInsights.day, loaded.since),
            lte(metaAdsDailyInsights.day, loaded.until),
            eq(metaAdsDailyInsights.actionReportTime, ACTION_REPORT_TIME),
          ),
        );

      await tx
        .delete(metaAdsBreakdownDailyInsights)
        .where(
          and(
            eq(metaAdsBreakdownDailyInsights.accountId, loaded.account.id),
            gte(metaAdsBreakdownDailyInsights.day, loaded.since),
            lte(metaAdsBreakdownDailyInsights.day, loaded.until),
          ),
        );

      await tx
        .delete(metaAdsDeliveryEntities)
        .where(eq(metaAdsDeliveryEntities.accountId, loaded.account.id));

      for (let offset = 0; offset < loaded.rows.length; offset += META_INSERT_BATCH_SIZE) {
        await tx
          .insert(metaAdsDailyInsights)
          .values(loaded.rows.slice(offset, offset + META_INSERT_BATCH_SIZE));
      }
      for (let offset = 0; offset < loaded.breakdownRows.length; offset += META_INSERT_BATCH_SIZE) {
        await tx
          .insert(metaAdsBreakdownDailyInsights)
          .values(loaded.breakdownRows.slice(offset, offset + META_INSERT_BATCH_SIZE));
      }
      for (
        let offset = 0;
        offset < loaded.deliveryEntities.length;
        offset += META_INSERT_BATCH_SIZE
      ) {
        await tx
          .insert(metaAdsDeliveryEntities)
          .values(loaded.deliveryEntities.slice(offset, offset + META_INSERT_BATCH_SIZE));
      }
    });

    await syncProfitTrackerMetaRows(loaded.rows, db, {
      since: loaded.since,
      until: loaded.until,
      accountCurrency: loaded.account.currency,
      syncedAt: now,
    });
    await refreshAnalyticsFacts({
      db,
      now,
    });

    const completedAt = options.now ? now : new Date();
    await db
      .update(metaAdsSyncRuns)
      .set({
        status: 'succeeded',
        accountId: loaded.account.id,
        accountCurrency: loaded.account.currency,
        accountTimezone: loaded.account.timezone,
        sinceDay: loaded.since,
        untilDay: loaded.until,
        pagesFetched: loaded.pagesFetched,
        rowsFetched:
          loaded.rows.length + loaded.breakdownRows.length + loaded.deliveryEntities.length,
        rowsUpserted:
          loaded.rows.length + loaded.breakdownRows.length + loaded.deliveryEntities.length,
        usage: loaded.usage,
        completedAt,
        updatedAt: completedAt,
      })
      .where(eq(metaAdsSyncRuns.id, run.id));

    return {
      runId: run.id,
      account: loaded.account,
      since: loaded.since,
      until: loaded.until,
      pagesFetched: loaded.pagesFetched,
      rows: loaded.rows.length,
      breakdownRows: loaded.breakdownRows.length,
      deliveryEntities: loaded.deliveryEntities.length,
    };
  } catch (error) {
    const failure =
      error instanceof MetaAdsSyncError
        ? error
        : new MetaAdsSyncError(
            error instanceof Error ? error.message : 'Unknown Meta Ads synchronization failure.',
            'meta_ads_sync_failed',
          );
    const completedAt = options.now ? now : new Date();
    await db
      .update(metaAdsSyncRuns)
      .set({
        status: 'failed',
        errorCode: failure.code,
        errorMessage: failure.message.slice(0, 1000),
        completedAt,
        updatedAt: completedAt,
      })
      .where(eq(metaAdsSyncRuns.id, run.id));
    throw failure;
  }
}
