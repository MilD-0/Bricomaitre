import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { and, desc, eq, gte, lte, max, sql } from 'drizzle-orm';
import { z } from 'zod';

import { getDb } from '@bric/db/client';
import {
  searchConsoleDailyAppearances,
  searchConsoleDailyRows,
  searchConsoleDailyTotals,
  searchConsoleSitemaps,
  searchConsoleSyncRuns,
  searchConsoleUrlInspections,
} from '@bric/db/schema';

type Database = ReturnType<typeof getDb>;
type FetchLike = typeof fetch;

const SEARCH_ANALYTICS_ENDPOINT = 'https://www.googleapis.com/webmasters/v3/sites';
const SEARCH_INSPECTION_ENDPOINT =
  'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect';
const SEARCH_CONSOLE_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
const DETAIL_PAGE_SIZE = 25_000;
const MAX_DETAIL_ROWS = 50_000;
const DEFAULT_SITE_URL = 'sc-domain:bricomaitre.com';
const DEFAULT_SITE_ORIGIN = 'https://bricomaitre.com';

const credentialsSchema = z.object({
  client_email: z.string().email(),
  private_key: z.string().min(1),
  token_uri: z.string().url().default('https://oauth2.googleapis.com/token'),
});

const analyticsRowSchema = z.object({
  keys: z.array(z.string()).default([]),
  clicks: z.number().default(0),
  impressions: z.number().default(0),
  ctr: z.number().default(0),
  position: z.number().optional(),
});

const analyticsResponseSchema = z
  .object({ rows: z.array(analyticsRowSchema).optional() })
  .passthrough();

const sitemapResponseSchema = z
  .object({
    sitemap: z
      .array(
        z
          .object({
            path: z.string(),
            lastSubmitted: z.string().optional(),
            isPending: z.boolean().optional(),
            isSitemapsIndex: z.boolean().optional(),
            type: z.string().optional(),
            lastDownloaded: z.string().optional(),
            warnings: z.union([z.string(), z.number()]).optional(),
            errors: z.union([z.string(), z.number()]).optional(),
            contents: z
              .array(
                z
                  .object({
                    type: z.string().optional(),
                    submitted: z.union([z.string(), z.number()]).optional(),
                    indexed: z.union([z.string(), z.number()]).optional(),
                  })
                  .passthrough(),
              )
              .optional(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();

const inspectionResponseSchema = z
  .object({
    inspectionResult: z
      .object({
        inspectionUrl: z.string().optional(),
        indexStatusResult: z
          .object({
            verdict: z.string().optional(),
            coverageState: z.string().optional(),
            robotsTxtState: z.string().optional(),
            indexingState: z.string().optional(),
            lastCrawlTime: z.string().optional(),
            pageFetchState: z.string().optional(),
            googleCanonical: z.string().optional(),
            userCanonical: z.string().optional(),
            referringUrls: z.array(z.string()).optional(),
            sitemap: z.array(z.string()).optional(),
            crawledAs: z.string().optional(),
          })
          .passthrough()
          .optional(),
        richResultsResult: z.record(z.string(), z.unknown()).optional(),
      })
      .passthrough(),
  })
  .passthrough();

export class SearchConsoleSyncError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number | null = null,
  ) {
    super(message);
    this.name = 'SearchConsoleSyncError';
  }
}

export type SearchConsoleEnvironment = {
  [key: string]: string | undefined;
  GOOGLE_SEARCH_CONSOLE_CREDENTIALS_BASE64?: string;
  GOOGLE_SEARCH_CONSOLE_CREDENTIALS_JSON?: string;
  GOOGLE_APPLICATION_CREDENTIALS?: string;
  SEARCH_CONSOLE_SITE_URL?: string;
  SEARCH_CONSOLE_SITE_ORIGIN?: string;
};

function decodeCredentials(env: SearchConsoleEnvironment) {
  if (env.GOOGLE_SEARCH_CONSOLE_CREDENTIALS_BASE64?.trim()) {
    return Buffer.from(env.GOOGLE_SEARCH_CONSOLE_CREDENTIALS_BASE64.trim(), 'base64').toString(
      'utf8',
    );
  }
  if (env.GOOGLE_SEARCH_CONSOLE_CREDENTIALS_JSON?.trim()) {
    return env.GOOGLE_SEARCH_CONSOLE_CREDENTIALS_JSON.trim();
  }
  if (env.GOOGLE_APPLICATION_CREDENTIALS?.trim()) {
    return readFileSync(env.GOOGLE_APPLICATION_CREDENTIALS.trim(), 'utf8');
  }
  throw new SearchConsoleSyncError(
    'Search Console service-account credentials are not configured.',
    'unconfigured',
  );
}

export function readSearchConsoleConfig(env: SearchConsoleEnvironment = process.env) {
  let credentialsJson: unknown;
  try {
    credentialsJson = JSON.parse(decodeCredentials(env));
  } catch (error) {
    if (error instanceof SearchConsoleSyncError) throw error;
    throw new SearchConsoleSyncError(
      'Search Console credentials are not valid JSON.',
      'invalid_credentials',
    );
  }
  const parsed = credentialsSchema.safeParse(credentialsJson);
  if (!parsed.success) {
    throw new SearchConsoleSyncError(
      'Search Console credentials are missing the client email or private key.',
      'invalid_credentials',
    );
  }
  const siteUrl = env.SEARCH_CONSOLE_SITE_URL?.trim() || DEFAULT_SITE_URL;
  const siteOrigin = (env.SEARCH_CONSOLE_SITE_ORIGIN?.trim() || DEFAULT_SITE_ORIGIN).replace(
    /\/$/,
    '',
  );
  if (!siteUrl.startsWith('sc-domain:') && !/^https?:\/\//.test(siteUrl)) {
    throw new SearchConsoleSyncError('SEARCH_CONSOLE_SITE_URL is invalid.', 'invalid_site_url');
  }
  if (!/^https:\/\//.test(siteOrigin)) {
    throw new SearchConsoleSyncError(
      'SEARCH_CONSOLE_SITE_ORIGIN must be an HTTPS origin.',
      'invalid_site_origin',
    );
  }
  return { credentials: parsed.data, siteUrl, siteOrigin };
}

function base64Url(value: string) {
  return Buffer.from(value).toString('base64url');
}

async function accessToken(
  config: ReturnType<typeof readSearchConsoleConfig>,
  fetchImpl: FetchLike,
  now: Date,
) {
  const issuedAt = Math.floor(now.getTime() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64Url(
    JSON.stringify({
      iss: config.credentials.client_email,
      scope: SEARCH_CONSOLE_SCOPE,
      aud: config.credentials.token_uri,
      iat: issuedAt,
      exp: issuedAt + 3600,
    }),
  );
  const unsigned = `${header}.${claims}`;
  const signer = createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  const assertion = `${unsigned}.${signer.sign(config.credentials.private_key).toString('base64url')}`;
  const response = await fetchImpl(config.credentials.token_uri, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  const body = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    error?: string;
  };
  if (!response.ok || !body.access_token) {
    throw new SearchConsoleSyncError(
      'Search Console authentication failed.',
      body.error || 'authentication_failed',
      response.status,
    );
  }
  return body.access_token;
}

async function googleRequest(url: string, init: RequestInit, token: string, fetchImpl: FetchLike) {
  let lastStatus: number | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetchImpl(url, {
      ...init,
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
    });
    lastStatus = response.status;
    const body = (await response.json().catch(() => ({}))) as {
      error?: { message?: string; status?: string };
    };
    if (response.ok) return body;
    if (response.status !== 429 && response.status < 500) {
      throw new SearchConsoleSyncError(
        body.error?.message?.slice(0, 500) || 'Search Console request failed.',
        body.error?.status || 'request_failed',
        response.status,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
  }
  throw new SearchConsoleSyncError(
    'Search Console remained unavailable after retrying.',
    'upstream_unavailable',
    lastStatus,
  );
}

type AnalyticsQuery = {
  startDate: string;
  endDate: string;
  dimensions?: string[];
  rowLimit?: number;
  startRow?: number;
  dimensionFilterGroups?: Array<{
    filters: Array<{ dimension: string; operator: string; expression: string }>;
  }>;
};

async function queryAnalytics(
  config: ReturnType<typeof readSearchConsoleConfig>,
  token: string,
  fetchImpl: FetchLike,
  input: AnalyticsQuery,
) {
  const url = `${SEARCH_ANALYTICS_ENDPOINT}/${encodeURIComponent(config.siteUrl)}/searchAnalytics/query`;
  const body = await googleRequest(
    url,
    {
      method: 'POST',
      body: JSON.stringify({
        ...input,
        type: 'web',
        dataState: 'final',
        rowLimit: input.rowLimit ?? DETAIL_PAGE_SIZE,
      }),
    },
    token,
    fetchImpl,
  );
  return analyticsResponseSchema.parse(body).rows ?? [];
}

function numericString(value: number) {
  return Number.isFinite(value) ? String(value) : '0';
}

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function canonicalInspectionUrl(value: string, origin: string) {
  try {
    const url = new URL(value, origin);
    if (url.origin !== origin) return null;
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

export async function fetchSearchConsoleSnapshot(input: {
  since: string;
  until: string;
  env?: SearchConsoleEnvironment;
  fetchImpl?: FetchLike;
  now?: Date;
  inspectionLimit?: number;
}) {
  if (!validDate(input.since) || !validDate(input.until) || input.since > input.until) {
    throw new SearchConsoleSyncError('Search Console date range is invalid.', 'invalid_range');
  }
  const config = readSearchConsoleConfig(input.env ?? process.env);
  const fetchImpl = input.fetchImpl ?? fetch;
  const now = input.now ?? new Date();
  const token = await accessToken(config, fetchImpl, now);

  const [totalRows, appearanceTypes] = await Promise.all([
    queryAnalytics(config, token, fetchImpl, {
      startDate: input.since,
      endDate: input.until,
      dimensions: ['date'],
    }),
    queryAnalytics(config, token, fetchImpl, {
      startDate: input.since,
      endDate: input.until,
      dimensions: ['searchAppearance'],
    }),
  ]);

  const detailRows: z.infer<typeof analyticsRowSchema>[] = [];
  for (let startRow = 0; startRow < MAX_DETAIL_ROWS; startRow += DETAIL_PAGE_SIZE) {
    const rows = await queryAnalytics(config, token, fetchImpl, {
      startDate: input.since,
      endDate: input.until,
      dimensions: ['date', 'query', 'page', 'country', 'device'],
      rowLimit: DETAIL_PAGE_SIZE,
      startRow,
    });
    detailRows.push(...rows);
    if (rows.length < DETAIL_PAGE_SIZE) break;
  }

  const appearanceRows = (
    await Promise.all(
      appearanceTypes.map(async (appearance) => {
        const name = appearance.keys[0];
        if (!name) return [];
        const rows = await queryAnalytics(config, token, fetchImpl, {
          startDate: input.since,
          endDate: input.until,
          dimensions: ['date'],
          dimensionFilterGroups: [
            {
              filters: [{ dimension: 'searchAppearance', operator: 'equals', expression: name }],
            },
          ],
        });
        return rows.map((row) => ({ ...row, appearance: name }));
      }),
    )
  ).flat();

  const sitemapsUrl = `${SEARCH_ANALYTICS_ENDPOINT}/${encodeURIComponent(config.siteUrl)}/sitemaps`;
  const sitemapBody = await googleRequest(sitemapsUrl, { method: 'GET' }, token, fetchImpl);
  const sitemaps = sitemapResponseSchema.parse(sitemapBody).sitemap ?? [];

  const inspectionUrls = Array.from(
    new Set(
      detailRows
        .slice()
        .sort((left, right) => right.impressions - left.impressions)
        .flatMap((row) => {
          const url = canonicalInspectionUrl(row.keys[2] ?? '', config.siteOrigin);
          return url ? [url] : [];
        }),
    ),
  ).slice(0, Math.max(0, input.inspectionLimit ?? 20));

  const inspections = (
    await Promise.all(
      inspectionUrls.map(async (url) => {
        try {
          const body = await googleRequest(
            SEARCH_INSPECTION_ENDPOINT,
            {
              method: 'POST',
              body: JSON.stringify({
                inspectionUrl: url,
                siteUrl: config.siteUrl,
                languageCode: 'en-US',
              }),
            },
            token,
            fetchImpl,
          );
          return inspectionResponseSchema.parse(body).inspectionResult;
        } catch (error) {
          if (!(error instanceof SearchConsoleSyncError)) throw error;
          return null;
        }
      }),
    )
  ).filter(
    (inspection): inspection is z.infer<typeof inspectionResponseSchema>['inspectionResult'] =>
      inspection != null,
  );

  return {
    config: { siteUrl: config.siteUrl, siteOrigin: config.siteOrigin },
    since: input.since,
    until: input.until,
    fetchedAt: now,
    totals: totalRows,
    details: detailRows,
    appearances: appearanceRows,
    sitemaps,
    inspections,
  };
}

function addDays(day: string, amount: number) {
  const value = new Date(`${day}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

function subtractMonths(day: string, months: number) {
  const value = new Date(`${day}T00:00:00.000Z`);
  value.setUTCMonth(value.getUTCMonth() - months);
  return value.toISOString().slice(0, 10);
}

function dayInAlgiers(now: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Algiers',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function batches<T>(rows: T[], size = 500) {
  const result: T[][] = [];
  for (let index = 0; index < rows.length; index += size) {
    result.push(rows.slice(index, index + size));
  }
  return result;
}

function timestamp(value: string | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

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
  if (since > until) {
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
        const url = inspection.inspectionUrl;
        if (!url) continue;
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

export async function latestSearchConsoleSync(db: Database = getDb()) {
  const [row] = await db
    .select()
    .from(searchConsoleSyncRuns)
    .orderBy(desc(searchConsoleSyncRuns.startedAt))
    .limit(1);
  return row ?? null;
}
