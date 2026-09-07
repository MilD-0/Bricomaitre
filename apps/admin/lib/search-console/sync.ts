import { getDb } from '@bric/db/client';
import {
  searchConsoleDailyAppearances,
  searchConsoleDailyRows,
  searchConsoleDailyTotals,
  searchConsoleSitemaps,
  searchConsoleSyncRuns,
  searchConsoleUrlInspections,
} from '@bric/db/schema';
import { and, eq, gte, lte, max, sql } from 'drizzle-orm';
import { reportingDateSchema } from '../analytics/contract';
import {
  type SearchConsoleEnvironment,
  readSearchConsoleConfig,
  SearchConsoleSyncError,
} from './config';
import { type Database, type FetchLike } from './contract';
import { addDays, batches, dayInAlgiers, subtractMonths, timestamp } from './dates';
import { fetchSearchConsoleSnapshot, numericString } from './fetch';

export async function syncSearchConsole(
  options: {
    db?: Database;
    env?: SearchConsoleEnvironment;
    fetchImpl?: FetchLike;
    now?: Date;
    since?: string;
    until?: string;
    trigger?: string;
    inspectionLimit?: number;
  } = {},
) {
  const db = options.db ?? getDb();
  const now = options.now ?? new Date();
  const config = readSearchConsoleConfig(options.env ?? process.env);
  const [{ latest }] = await db
    .select({ latest: max(searchConsoleDailyTotals.day) })
    .from(searchConsoleDailyTotals)
    .where(eq(searchConsoleDailyTotals.searchType, 'web'));
  const until = options.until ?? addDays(dayInAlgiers(now), -3);
  const since = options.since ?? (latest ? addDays(String(latest), -7) : subtractMonths(until, 16));
  if (
    !reportingDateSchema.safeParse(since).success ||
    !reportingDateSchema.safeParse(until).success ||
    since > until
  ) {
    throw new SearchConsoleSyncError('Search Console date range is invalid.', 'invalid_range');
  }

  const [run] = await db
    .insert(searchConsoleSyncRuns)
    .values({
      trigger: options.trigger ?? 'manual',
      status: 'running',
      siteUrl: config.siteUrl,
      sinceDay: since,
      untilDay: until,
      startedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: searchConsoleSyncRuns.id });
  if (!run) {
    throw new SearchConsoleSyncError('Search Console sync could not be recorded.', 'run_failed');
  }

  try {
    const snapshot = await fetchSearchConsoleSnapshot({
      since,
      until,
      env: options.env,
      fetchImpl: options.fetchImpl,
      now,
      inspectionLimit: options.inspectionLimit,
    });
    const syncedAt = snapshot.fetchedAt;
    await db.transaction(async (tx) => {
      await tx
        .delete(searchConsoleDailyRows)
        .where(
          and(
            eq(searchConsoleDailyRows.searchType, 'web'),
            gte(searchConsoleDailyRows.day, since),
            lte(searchConsoleDailyRows.day, until),
          ),
        );
      await tx
        .delete(searchConsoleDailyAppearances)
        .where(
          and(
            eq(searchConsoleDailyAppearances.searchType, 'web'),
            gte(searchConsoleDailyAppearances.day, since),
            lte(searchConsoleDailyAppearances.day, until),
          ),
        );
      await tx
        .delete(searchConsoleDailyTotals)
        .where(
          and(
            eq(searchConsoleDailyTotals.searchType, 'web'),
            gte(searchConsoleDailyTotals.day, since),
            lte(searchConsoleDailyTotals.day, until),
          ),
        );

      const totals = snapshot.totals.flatMap((row) => {
        const day = row.keys[0];
        return day
          ? [
              {
                day,
                searchType: 'web',
                clicks: numericString(row.clicks),
                impressions: numericString(row.impressions),
                ctr: numericString(row.ctr),
                position: row.position == null ? null : numericString(row.position),
                dataState: 'final',
                syncedAt,
                updatedAt: syncedAt,
              },
            ]
          : [];
      });
      if (totals.length) {
        await tx
          .insert(searchConsoleDailyTotals)
          .values(totals)
          .onConflictDoUpdate({
            target: [searchConsoleDailyTotals.day, searchConsoleDailyTotals.searchType],
            set: {
              clicks: sql`excluded.clicks`,
              impressions: sql`excluded.impressions`,
              ctr: sql`excluded.ctr`,
              position: sql`excluded.position`,
              dataState: 'final',
              syncedAt,
              updatedAt: syncedAt,
            },
          });
      }

      const detailValues = snapshot.details.flatMap((row) => {
        const [day, query, page, country, device] = row.keys;
        return day && page
          ? [
              {
                day,
                searchType: 'web',
                query: query ?? '',
                page,
                country: country ?? '',
                device: device ?? '',
                clicks: numericString(row.clicks),
                impressions: numericString(row.impressions),
                ctr: numericString(row.ctr),
                position: row.position == null ? null : numericString(row.position),
                syncedAt,
                updatedAt: syncedAt,
              },
            ]
          : [];
      });
      for (const batch of batches(detailValues)) {
        if (batch.length) await tx.insert(searchConsoleDailyRows).values(batch);
      }

      const appearanceValues = snapshot.appearances.flatMap((row) => {
        const day = row.keys[0];
        return day
          ? [
              {
                day,
                searchType: 'web',
                appearance: row.appearance,
                clicks: numericString(row.clicks),
                impressions: numericString(row.impressions),
                ctr: numericString(row.ctr),
                position: row.position == null ? null : numericString(row.position),
                syncedAt,
                updatedAt: syncedAt,
              },
            ]
          : [];
      });
      for (const batch of batches(appearanceValues)) {
        if (batch.length) await tx.insert(searchConsoleDailyAppearances).values(batch);
      }

      for (const sitemap of snapshot.sitemaps) {
        const contents = sitemap.contents ?? [];
        const submittedUrls = contents.reduce(
          (sum, entry) => sum + Number(entry.submitted ?? 0),
          0,
        );
        await tx
          .insert(searchConsoleSitemaps)
          .values({
            path: sitemap.path,
            siteUrl: config.siteUrl,
            type: sitemap.type ?? null,
            isPending: sitemap.isPending ?? false,
            isSitemapsIndex: sitemap.isSitemapsIndex ?? false,
            warnings: Number(sitemap.warnings ?? 0),
            errors: Number(sitemap.errors ?? 0),
            submittedUrls,
            contents,
            lastSubmittedAt: timestamp(sitemap.lastSubmitted),
            lastDownloadedAt: timestamp(sitemap.lastDownloaded),
            syncedAt,
            updatedAt: syncedAt,
          })
          .onConflictDoUpdate({
            target: searchConsoleSitemaps.path,
            set: {
              type: sitemap.type ?? null,
              isPending: sitemap.isPending ?? false,
              isSitemapsIndex: sitemap.isSitemapsIndex ?? false,
              warnings: Number(sitemap.warnings ?? 0),
              errors: Number(sitemap.errors ?? 0),
              submittedUrls,
              contents,
              lastSubmittedAt: timestamp(sitemap.lastSubmitted),
              lastDownloadedAt: timestamp(sitemap.lastDownloaded),
              syncedAt,
              updatedAt: syncedAt,
            },
          });
      }

      for (const inspection of snapshot.inspections) {
        const url = inspection.url;
        const status = inspection.indexStatusResult;
        await tx
          .insert(searchConsoleUrlInspections)
          .values({
            url,
            siteUrl: config.siteUrl,
            verdict: status?.verdict ?? null,
            coverageState: status?.coverageState ?? null,
            robotsTxtState: status?.robotsTxtState ?? null,
            indexingState: status?.indexingState ?? null,
            pageFetchState: status?.pageFetchState ?? null,
            googleCanonical: status?.googleCanonical ?? null,
            userCanonical: status?.userCanonical ?? null,
            lastCrawlAt: timestamp(status?.lastCrawlTime),
            crawledAs: status?.crawledAs ?? null,
            referringUrls: status?.referringUrls ?? [],
            sitemapUrls: status?.sitemap ?? [],
            richResults: inspection.richResultsResult ?? {},
            inspectedAt: syncedAt,
            updatedAt: syncedAt,
          })
          .onConflictDoUpdate({
            target: searchConsoleUrlInspections.url,
            set: {
              verdict: status?.verdict ?? null,
              coverageState: status?.coverageState ?? null,
              robotsTxtState: status?.robotsTxtState ?? null,
              indexingState: status?.indexingState ?? null,
              pageFetchState: status?.pageFetchState ?? null,
              googleCanonical: status?.googleCanonical ?? null,
              userCanonical: status?.userCanonical ?? null,
              lastCrawlAt: timestamp(status?.lastCrawlTime),
              crawledAs: status?.crawledAs ?? null,
              referringUrls: status?.referringUrls ?? [],
              sitemapUrls: status?.sitemap ?? [],
              richResults: inspection.richResultsResult ?? {},
              inspectedAt: syncedAt,
              updatedAt: syncedAt,
            },
          });
      }
    });

    await db
      .update(searchConsoleSyncRuns)
      .set({
        status: 'succeeded',
        totalsFetched: snapshot.totals.length,
        detailRowsFetched: snapshot.details.length,
        appearancesFetched: snapshot.appearances.length,
        urlsInspected: snapshot.inspections.length,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(searchConsoleSyncRuns.id, run.id));
    await import('../analytics-snapshots')
      .then(({ invalidateAnalyticsSnapshots }) => invalidateAnalyticsSnapshots())
      .catch((error) => console.error('[search-console] Snapshot invalidation failed.', error));
    return {
      since,
      until,
      totals: snapshot.totals.length,
      details: snapshot.details.length,
      appearances: snapshot.appearances.length,
      inspections: snapshot.inspections.length,
      sitemaps: snapshot.sitemaps.length,
    };
  } catch (error) {
    const known = error instanceof SearchConsoleSyncError ? error : null;
    await db
      .update(searchConsoleSyncRuns)
      .set({
        status: 'failed',
        errorCode: known?.code ?? 'unexpected_error',
        errorMessage: (error instanceof Error ? error.message : 'Unexpected sync failure').slice(
          0,
          500,
        ),
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(searchConsoleSyncRuns.id, run.id));
    throw error;
  }
}
