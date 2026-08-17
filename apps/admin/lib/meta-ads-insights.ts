import { and, eq, gte, lte } from 'drizzle-orm';
import { z } from 'zod';

import { getDb } from '@bric/db/client';
import { metaAdsDailyInsights, metaAdsSyncRuns } from '@bric/db/schema';

const DEFAULT_GRAPH_API_VERSION = 'v25.0';
const DEFAULT_LOOKBACK_DAYS = 28;
const MAX_LOOKBACK_DAYS = 90;
const ACTION_REPORT_TIME = 'conversion';
const META_GRAPH_HOST = 'graph.facebook.com';
const META_PAGE_LIMIT = 500;
const MAX_PAGES = 100;

type Database = ReturnType<typeof getDb>;
type MetaAdsEnvironment = Record<string, string | undefined> &
  Partial<
    Record<
      'META_ADS_ACCESS_TOKEN' | 'META_AD_ACCOUNT_ID' | 'META_ADS_GRAPH_API_VERSION',
      string | undefined
    >
  >;

type FetchLike = typeof fetch;

const accountResponseSchema = z
  .object({
    id: z.string().min(1),
    currency: z.string().trim().min(1).max(12),
    timezone_name: z.string().trim().min(1).max(120),
  })
  .passthrough();

const actionMetricSchema = z
  .object({
    action_type: z.string(),
    value: z.union([z.string(), z.number()]),
  })
  .passthrough();

const insightResponseRowSchema = z
  .object({
    date_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    account_id: z.string().min(1),
    account_currency: z.string().trim().min(1).max(12).optional(),
    campaign_id: z.string().min(1),
    campaign_name: z.string().optional(),
    adset_id: z.string().min(1),
    adset_name: z.string().optional(),
    ad_id: z.string().min(1),
    ad_name: z.string().optional(),
    objective: z.string().optional(),
    attribution_setting: z.string().optional(),
    spend: z.union([z.string(), z.number()]).optional(),
    impressions: z.union([z.string(), z.number()]).optional(),
    reach: z.union([z.string(), z.number()]).optional(),
    clicks: z.union([z.string(), z.number()]).optional(),
    inline_link_clicks: z.union([z.string(), z.number()]).optional(),
    actions: z.array(actionMetricSchema).optional(),
    action_values: z.array(actionMetricSchema).optional(),
  })
  .passthrough();

const insightsPageSchema = z
  .object({
    data: z.array(insightResponseRowSchema),
    paging: z
      .object({
        next: z.string().url().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export class MetaAdsSyncError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number | null = null,
  ) {
    super(message);
    this.name = 'MetaAdsSyncError';
  }
}

export function readMetaAdsConfig(env: MetaAdsEnvironment = process.env) {
  const accessToken = env.META_ADS_ACCESS_TOKEN?.trim() ?? '';
  const accountId = (env.META_AD_ACCOUNT_ID?.trim() ?? '').replace(/^act_/, '');
  const configuredVersion = env.META_ADS_GRAPH_API_VERSION?.trim() ?? DEFAULT_GRAPH_API_VERSION;
  const apiVersion = /^v\d+\.\d+$/.test(configuredVersion)
    ? configuredVersion
    : DEFAULT_GRAPH_API_VERSION;

  if (!accessToken || !/^\d{6,30}$/.test(accountId)) {
    throw new MetaAdsSyncError(
      'Meta Ads Insights requires META_ADS_ACCESS_TOKEN and a numeric META_AD_ACCOUNT_ID.',
      'meta_ads_unconfigured',
    );
  }

  return { accessToken, accountId, apiVersion };
}

function finiteNumber(value: string | number | undefined) {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(value ?? '0');
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function integerMetric(value: string | number | undefined) {
  return Math.max(0, Math.trunc(finiteNumber(value)));
}

function actionMetric(
  rows: z.infer<typeof actionMetricSchema>[] | undefined,
  priority: readonly string[],
) {
  for (const actionType of priority) {
    const row = rows?.find((item) => item.action_type === actionType);
    if (row) return finiteNumber(row.value);
  }
  return 0;
}

function attributionWindows(setting: string) {
  return setting
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

export function mapMetaAdsInsightRow(
  raw: unknown,
  account: { currency: string; timezone: string },
  syncedAt: Date,
) {
  const row = insightResponseRowSchema.parse(raw);
  const setting = row.attribution_setting?.trim() || 'account_default';

  return {
    day: row.date_start,
    accountId: row.account_id.replace(/^act_/, ''),
    accountCurrency: row.account_currency?.trim() || account.currency,
    accountTimezone: account.timezone,
    campaignId: row.campaign_id,
    campaignName: row.campaign_name?.trim() || null,
    adsetId: row.adset_id,
    adsetName: row.adset_name?.trim() || null,
    adId: row.ad_id,
    adName: row.ad_name?.trim() || null,
    objective: row.objective?.trim() || null,
    attributionSetting: setting,
    actionReportTime: ACTION_REPORT_TIME,
    attributionWindows: attributionWindows(setting),
    spend: finiteNumber(row.spend).toFixed(4),
    impressions: integerMetric(row.impressions),
    reach: integerMetric(row.reach),
    clicks: integerMetric(row.clicks),
    inlineLinkClicks: integerMetric(row.inline_link_clicks),
    landingPageViews: actionMetric(row.actions, ['landing_page_view']).toFixed(4),
    addToCarts: actionMetric(row.actions, [
      'offsite_conversion.fb_pixel_add_to_cart',
      'omni_add_to_cart',
      'add_to_cart',
    ]).toFixed(4),
    initiateCheckouts: actionMetric(row.actions, [
      'offsite_conversion.fb_pixel_initiate_checkout',
      'omni_initiated_checkout',
      'initiate_checkout',
    ]).toFixed(4),
    leads: actionMetric(row.actions, [
      'offsite_conversion.fb_pixel_lead',
      'onsite_conversion.lead_grouped',
      'lead',
    ]).toFixed(4),
    purchases: actionMetric(row.actions, [
      'offsite_conversion.fb_pixel_purchase',
      'omni_purchase',
      'purchase',
    ]).toFixed(4),
    purchaseValue: actionMetric(row.action_values, [
      'offsite_conversion.fb_pixel_purchase',
      'omni_purchase',
      'purchase',
    ]).toFixed(2),
    syncedAt,
    updatedAt: syncedAt,
  };
}

function safeJsonHeader(value: string | null) {
  if (!value) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function responseUsage(response: Response) {
  return {
    app: safeJsonHeader(response.headers.get('x-app-usage')),
    business: safeJsonHeader(response.headers.get('x-business-use-case-usage')),
  };
}

async function metaRequest(
  url: URL,
  config: ReturnType<typeof readMetaAdsConfig>,
  fetchImpl: FetchLike,
  wait: (milliseconds: number) => Promise<void>,
) {
  if (url.hostname !== META_GRAPH_HOST || url.protocol !== 'https:') {
    throw new MetaAdsSyncError(
      'Meta returned an invalid pagination URL.',
      'invalid_pagination_url',
    );
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    let response: Response;
    try {
      response = await fetchImpl(url, {
        headers: { authorization: `Bearer ${config.accessToken}` },
        signal: AbortSignal.timeout(20_000),
      });
    } catch (error) {
      if (attempt < 2) {
        await wait(attempt === 0 ? 500 : 2_000);
        continue;
      }
      throw new MetaAdsSyncError(
        error instanceof Error ? error.message.slice(0, 1000) : 'Meta Ads network request failed.',
        'meta_ads_network_error',
      );
    }
    const body = (await response.json().catch(() => null)) as {
      error?: { code?: number; message?: string };
    } | null;

    if (response.ok) return { body, usage: responseUsage(response) };

    if ((response.status === 429 || response.status >= 500) && attempt < 2) {
      const retryAfterSeconds = Number.parseInt(response.headers.get('retry-after') ?? '', 10);
      const delay = Number.isFinite(retryAfterSeconds)
        ? Math.min(10_000, Math.max(0, retryAfterSeconds * 1_000))
        : attempt === 0
          ? 500
          : 2_000;
      await wait(delay);
      continue;
    }

    const code = body?.error?.code == null ? `http_${response.status}` : `meta_${body.error.code}`;
    throw new MetaAdsSyncError(
      body?.error?.message?.slice(0, 1000) || `Meta Ads request failed with ${response.status}.`,
      code,
      response.status,
    );
  }
  throw new MetaAdsSyncError('Meta Ads request exhausted retries.', 'meta_ads_retry_exhausted');
}

function dayInTimezone(now: Date, timeZone: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function subtractDays(day: string, days: number) {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function dateOnly(value: string, field: string) {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    throw new MetaAdsSyncError(`${field} must be a valid YYYY-MM-DD date.`, 'invalid_date_range');
  }
  return value;
}

export async function fetchMetaAdsInsightRows(input: {
  config: ReturnType<typeof readMetaAdsConfig>;
  fetchImpl: FetchLike;
  now: Date;
  since?: string;
  until?: string;
  lookbackDays: number;
  wait?: (milliseconds: number) => Promise<void>;
}) {
  const wait =
    input.wait ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const explicitSince = input.since ? dateOnly(input.since, 'since') : undefined;
  const explicitUntil = input.until ? dateOnly(input.until, 'until') : undefined;
  const accountUrl = new URL(
    `https://${META_GRAPH_HOST}/${input.config.apiVersion}/act_${input.config.accountId}`,
  );
  accountUrl.searchParams.set('fields', 'id,currency,timezone_name');
  const accountResult = await metaRequest(accountUrl, input.config, input.fetchImpl, wait);
  const accountBody = accountResponseSchema.parse(accountResult.body);
  const until = dateOnly(
    explicitUntil ?? dayInTimezone(input.now, accountBody.timezone_name),
    'until',
  );
  const since = dateOnly(explicitSince ?? subtractDays(until, input.lookbackDays - 1), 'since');
  if (since > until) {
    throw new MetaAdsSyncError('since must not follow until.', 'invalid_date_range');
  }

  const insightsUrl = new URL(
    `https://${META_GRAPH_HOST}/${input.config.apiVersion}/act_${input.config.accountId}/insights`,
  );
  insightsUrl.searchParams.set('level', 'ad');
  insightsUrl.searchParams.set('time_increment', '1');
  insightsUrl.searchParams.set('time_range', JSON.stringify({ since, until }));
  insightsUrl.searchParams.set('action_report_time', ACTION_REPORT_TIME);
  insightsUrl.searchParams.set('use_account_attribution_setting', 'true');
  insightsUrl.searchParams.set('limit', String(META_PAGE_LIMIT));
  insightsUrl.searchParams.set(
    'fields',
    [
      'date_start',
      'account_id',
      'account_currency',
      'campaign_id',
      'campaign_name',
      'adset_id',
      'adset_name',
      'ad_id',
      'ad_name',
      'objective',
      'attribution_setting',
      'spend',
      'impressions',
      'reach',
      'clicks',
      'inline_link_clicks',
      'actions',
      'action_values',
    ].join(','),
  );

  const rows: ReturnType<typeof mapMetaAdsInsightRow>[] = [];
  let pagesFetched = 0;
  let next: URL | null = insightsUrl;
  let usage: Record<string, unknown> = { account: accountResult.usage };

  while (next) {
    if (pagesFetched >= MAX_PAGES) {
      throw new MetaAdsSyncError('Meta Ads pagination exceeded the safety limit.', 'page_limit');
    }
    const result = await metaRequest(next, input.config, input.fetchImpl, wait);
    const page = insightsPageSchema.parse(result.body);
    rows.push(
      ...page.data.map((row) =>
        mapMetaAdsInsightRow(
          row,
          { currency: accountBody.currency, timezone: accountBody.timezone_name },
          input.now,
        ),
      ),
    );
    pagesFetched += 1;
    usage = { ...usage, [`page_${pagesFetched}`]: result.usage };
    next = page.paging?.next ? new URL(page.paging.next) : null;
  }

  return {
    account: {
      id: accountBody.id.replace(/^act_/, ''),
      currency: accountBody.currency,
      timezone: accountBody.timezone_name,
    },
    since,
    until,
    rows,
    pagesFetched,
    usage,
  };
}

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

      if (loaded.rows.length > 0) {
        await tx.insert(metaAdsDailyInsights).values(loaded.rows);
      }
    });

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
        rowsFetched: loaded.rows.length,
        rowsUpserted: loaded.rows.length,
        usage: loaded.usage,
        completedAt: now,
        updatedAt: now,
      })
      .where(eq(metaAdsSyncRuns.id, run.id));

    return {
      runId: run.id,
      account: loaded.account,
      since: loaded.since,
      until: loaded.until,
      pagesFetched: loaded.pagesFetched,
      rows: loaded.rows.length,
    };
  } catch (error) {
    const failure =
      error instanceof MetaAdsSyncError
        ? error
        : new MetaAdsSyncError(
            error instanceof Error ? error.message : 'Unknown Meta Ads synchronization failure.',
            'meta_ads_sync_failed',
          );
    await db
      .update(metaAdsSyncRuns)
      .set({
        status: 'failed',
        errorCode: failure.code,
        errorMessage: failure.message.slice(0, 1000),
        completedAt: now,
        updatedAt: now,
      })
      .where(eq(metaAdsSyncRuns.id, run.id));
    throw failure;
  }
}
