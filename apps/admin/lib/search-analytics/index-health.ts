import {
  searchConsoleSitemaps,
  searchConsoleSyncRuns,
  searchConsoleUrlInspections,
} from '@bric/db/schema';
import { sql } from 'drizzle-orm';
import { canonicalSearchPath, type Database, iso, number, records } from './values';

function canonicalInspectionIdentity(value: string) {
  try {
    const url = new URL(value);
    url.hash = '';
    return url.href;
  } catch {
    return value;
  }
}

export async function indexHealth(db: Database) {
  const [inspectionResult, sitemapResult, syncResult] = await Promise.all([
    db.execute(sql`
      select * from ${searchConsoleUrlInspections}
      order by ${searchConsoleUrlInspections.inspectedAt} desc
      limit 100
    `),
    db.execute(sql`
      select * from ${searchConsoleSitemaps}
      order by ${searchConsoleSitemaps.syncedAt} desc
    `),
    db.execute(sql`
      select * from ${searchConsoleSyncRuns}
      order by ${searchConsoleSyncRuns.startedAt} desc
      limit 1
    `),
  ]);
  const inspections = records(inspectionResult.rows).map((row) => {
    const canonicalMismatch = Boolean(
      row.google_canonical &&
      row.user_canonical &&
      canonicalInspectionIdentity(String(row.google_canonical)) !==
        canonicalInspectionIdentity(String(row.user_canonical)),
    );
    const verdict = row.verdict ? String(row.verdict) : null;
    return {
      url: String(row.url),
      path: canonicalSearchPath(String(row.url)),
      verdict,
      coverageState: row.coverage_state ? String(row.coverage_state) : null,
      pageFetchState: row.page_fetch_state ? String(row.page_fetch_state) : null,
      indexingState: row.indexing_state ? String(row.indexing_state) : null,
      googleCanonical: row.google_canonical ? String(row.google_canonical) : null,
      userCanonical: row.user_canonical ? String(row.user_canonical) : null,
      canonicalMismatch,
      lastCrawlAt: iso(row.last_crawl_at),
      inspectedAt: iso(row.inspected_at),
      needsAttention:
        verdict === 'FAIL' ||
        verdict === 'PARTIAL' ||
        canonicalMismatch ||
        (typeof row.page_fetch_state === 'string' &&
          !['SUCCESSFUL', 'PAGE_FETCH_STATE_UNSPECIFIED'].includes(row.page_fetch_state)),
    };
  });
  const sitemaps = records(sitemapResult.rows).map((row) => ({
    path: String(row.path),
    pending: Boolean(row.is_pending),
    warnings: number(row.warnings),
    errors: number(row.errors),
    submittedUrls: number(row.submitted_urls),
    lastDownloadedAt: iso(row.last_downloaded_at),
    syncedAt: iso(row.synced_at),
  }));
  const run = records(syncResult.rows)[0];
  return {
    inspections,
    issues: inspections.filter((row) => row.needsAttention),
    sitemaps,
    lastSync: run
      ? {
          status: String(run.status),
          since: String(run.since_day),
          until: String(run.until_day),
          startedAt: iso(run.started_at),
          completedAt: iso(run.completed_at),
          detailRows: number(run.detail_rows_fetched),
        }
      : null,
  };
}
