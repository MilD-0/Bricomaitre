import { and, eq, gte, lte } from 'drizzle-orm';
import { z } from 'zod';

import { getDb } from '@bric/db/client';
import {
  metaAdsBreakdownDailyInsights,
  metaAdsDailyInsights,
  metaAdsDeliveryEntities,
  metaAdsSyncRuns,
} from '@bric/db/schema';
import { syncProfitTrackerMetaRows } from './profit-tracker';
import { refreshAnalyticsFacts } from './analytics-facts';

const DEFAULT_GRAPH_API_VERSION = 'v25.0';
const DEFAULT_LOOKBACK_DAYS = 28;
const MAX_LOOKBACK_DAYS = 90;
const ACTION_REPORT_TIME = 'conversion';
const META_GRAPH_HOST = 'graph.facebook.com';
const META_PAGE_LIMIT = 500;
const MAX_PAGES = 300;
const MAX_INSIGHTS_DAYS_PER_REQUEST = 30;
const META_INSERT_BATCH_SIZE = 250;

type Database = ReturnType<typeof getDb>;
type MetaAdsEnvironment = Record<string, string | undefined> &
  Partial<
    Record<
      'META_ADS_ACCESS_TOKEN' | 'META_AD_ACCOUNT_ID' | 'META_ADS_GRAPH_API_VERSION',
      string | undefined
    >
  >;

type FetchLike = typeof fetch;
type MetaRequestResult<T> = { body: T; usage: ReturnType<typeof responseUsage> };

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
    outbound_clicks: z.array(actionMetricSchema).optional(),
    unique_outbound_clicks: z.array(actionMetricSchema).optional(),
    video_play_actions: z.array(actionMetricSchema).optional(),
    video_p25_watched_actions: z.array(actionMetricSchema).optional(),
    video_p50_watched_actions: z.array(actionMetricSchema).optional(),
    video_p75_watched_actions: z.array(actionMetricSchema).optional(),
    video_p95_watched_actions: z.array(actionMetricSchema).optional(),
    video_p100_watched_actions: z.array(actionMetricSchema).optional(),
    video_avg_time_watched_actions: z.array(actionMetricSchema).optional(),
    quality_ranking: z.string().optional(),
    engagement_rate_ranking: z.string().optional(),
    conversion_rate_ranking: z.string().optional(),
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

const breakdownInsightRowSchema = insightResponseRowSchema.extend({
  publisher_platform: z.string().optional(),
  platform_position: z.string().optional(),
  impression_device: z.string().optional(),
  region: z.string().optional(),
});

const breakdownInsightsPageSchema = z
  .object({
    data: z.array(breakdownInsightRowSchema),
    paging: z.object({ next: z.string().url().optional() }).passthrough().optional(),
  })
  .passthrough();

const deliveryEntitySchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    campaign_id: z.string().optional(),
    status: z.string().optional(),
    effective_status: z.string().optional(),
    objective: z.string().optional(),
    optimization_goal: z.string().optional(),
    billing_event: z.string().optional(),
    bid_strategy: z.string().optional(),
    daily_budget: z.union([z.string(), z.number()]).optional(),
    lifetime_budget: z.union([z.string(), z.number()]).optional(),
    budget_remaining: z.union([z.string(), z.number()]).optional(),
    start_time: z.string().optional(),
    stop_time: z.string().optional(),
    end_time: z.string().optional(),
  })
  .passthrough();

const deliveryEntitiesPageSchema = z
  .object({
    data: z.array(deliveryEntitySchema),
    paging: z.object({ next: z.string().url().optional() }).passthrough().optional(),
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

function firstActionMetric(rows: z.infer<typeof actionMetricSchema>[] | undefined) {
  return rows?.length ? finiteNumber(rows[0]?.value) : 0;
}

function nullableRanking(value: string | undefined) {
  const normalized = value?.trim();
  return normalized && normalized !== 'UNKNOWN' ? normalized : null;
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
    outboundClicks: firstActionMetric(row.outbound_clicks).toFixed(4),
    uniqueOutboundClicks: firstActionMetric(row.unique_outbound_clicks).toFixed(4),
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
    videoPlays: firstActionMetric(row.video_play_actions).toFixed(4),
    videoP25Watched: firstActionMetric(row.video_p25_watched_actions).toFixed(4),
    videoP50Watched: firstActionMetric(row.video_p50_watched_actions).toFixed(4),
    videoP75Watched: firstActionMetric(row.video_p75_watched_actions).toFixed(4),
    videoP95Watched: firstActionMetric(row.video_p95_watched_actions).toFixed(4),
    videoP100Watched: firstActionMetric(row.video_p100_watched_actions).toFixed(4),
    videoAverageWatchSeconds: firstActionMetric(row.video_avg_time_watched_actions).toFixed(4),
    qualityRanking: nullableRanking(row.quality_ranking),
    engagementRateRanking: nullableRanking(row.engagement_rate_ranking),
    conversionRateRanking: nullableRanking(row.conversion_rate_ranking),
    syncedAt,
    updatedAt: syncedAt,
  };
}

function mapMetaAdsBreakdownRow(raw: unknown, kind: 'placement_device' | 'region', syncedAt: Date) {
  const row = breakdownInsightRowSchema.parse(raw);
  return {
    day: row.date_start,
    accountId: row.account_id.replace(/^act_/, ''),
    campaignId: row.campaign_id,
    campaignName: row.campaign_name?.trim() || null,
    adsetId: row.adset_id,
    adsetName: row.adset_name?.trim() || null,
    adId: row.ad_id,
    adName: row.ad_name?.trim() || null,
    breakdownKind: kind,
    publisherPlatform: row.publisher_platform?.trim() || '',
    platformPosition: row.platform_position?.trim() || '',
    impressionDevice: row.impression_device?.trim() || '',
    region: row.region?.trim() || '',
    spend: finiteNumber(row.spend).toFixed(4),
    impressions: integerMetric(row.impressions),
    reach: integerMetric(row.reach),
    clicks: integerMetric(row.clicks),
    outboundClicks: firstActionMetric(row.outbound_clicks).toFixed(4),
    landingPageViews: actionMetric(row.actions, ['landing_page_view']).toFixed(4),
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

function metaMoney(value: string | number | undefined) {
  if (value == null) return null;
  return (finiteNumber(value) / 100).toFixed(2);
}

function metaTimestamp(value: string | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
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

async function metaRequest<T>(
  url: URL,
  config: ReturnType<typeof readMetaAdsConfig>,
  fetchImpl: FetchLike,
  wait: (milliseconds: number) => Promise<void>,
  schema: z.ZodType<T>,
  responseName: string,
): Promise<MetaRequestResult<T>> {
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

    if (response.ok) {
      let parsed: ReturnType<typeof schema.safeParse> | null = null;
      try {
        parsed = schema.safeParse(body);
      } catch {
        // Treat parser exhaustion from an unexpectedly large or malformed
        // provider response like any other invalid upstream payload.
      }
      if (parsed?.success) {
        return { body: parsed.data, usage: responseUsage(response) };
      }
      if (attempt < 2) {
        await wait(attempt === 0 ? 500 : 2_000);
        continue;
      }
      throw new MetaAdsSyncError(
        `Meta returned an invalid ${responseName} response.`,
        'meta_ads_invalid_response',
        response.status,
      );
    }

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

function addDays(day: string, days: number) {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function splitInsightsRange(since: string, until: string) {
  const ranges: Array<{ since: string; until: string }> = [];
  for (
    let cursor = since;
    cursor <= until;
    cursor = addDays(cursor, MAX_INSIGHTS_DAYS_PER_REQUEST)
  ) {
    const candidateUntil = addDays(cursor, MAX_INSIGHTS_DAYS_PER_REQUEST - 1);
    ranges.push({ since: cursor, until: candidateUntil < until ? candidateUntil : until });
  }
  return ranges;
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
  const accountResult = await metaRequest<z.infer<typeof accountResponseSchema>>(
    accountUrl,
    input.config,
    input.fetchImpl,
    wait,
    accountResponseSchema,
    'ad account',
  );
  const accountBody = accountResult.body;
  const until = dateOnly(
    explicitUntil ?? dayInTimezone(input.now, accountBody.timezone_name),
    'until',
  );
  const since = dateOnly(explicitSince ?? subtractDays(until, input.lookbackDays - 1), 'since');
  if (since > until) {
    throw new MetaAdsSyncError('since must not follow until.', 'invalid_date_range');
  }

  const fields = [
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
    'outbound_clicks',
    'unique_outbound_clicks',
    'actions',
    'action_values',
    'video_play_actions',
    'video_p25_watched_actions',
    'video_p50_watched_actions',
    'video_p75_watched_actions',
    'video_p95_watched_actions',
    'video_p100_watched_actions',
    'video_avg_time_watched_actions',
    'quality_ranking',
    'engagement_rate_ranking',
    'conversion_rate_ranking',
  ].join(',');
  const breakdownFields = [
    'date_start',
    'account_id',
    'campaign_id',
    'campaign_name',
    'adset_id',
    'adset_name',
    'ad_id',
    'ad_name',
    'spend',
    'impressions',
    'reach',
    'clicks',
    'outbound_clicks',
    'actions',
    'action_values',
  ].join(',');

  const buildInsightsUrl = (range: { since: string; until: string }) => {
    const url = new URL(
      `https://${META_GRAPH_HOST}/${input.config.apiVersion}/act_${input.config.accountId}/insights`,
    );
    url.searchParams.set('level', 'ad');
    url.searchParams.set('time_increment', '1');
    url.searchParams.set('time_range', JSON.stringify(range));
    url.searchParams.set('action_report_time', ACTION_REPORT_TIME);
    url.searchParams.set('use_account_attribution_setting', 'true');
    url.searchParams.set('limit', String(META_PAGE_LIMIT));
    url.searchParams.set('fields', fields);
    return url;
  };

  const buildBreakdownUrl = (range: { since: string; until: string }, breakdowns: string) => {
    const url = new URL(
      `https://${META_GRAPH_HOST}/${input.config.apiVersion}/act_${input.config.accountId}/insights`,
    );
    url.searchParams.set('level', 'ad');
    url.searchParams.set('time_increment', '1');
    url.searchParams.set('time_range', JSON.stringify(range));
    url.searchParams.set('action_report_time', ACTION_REPORT_TIME);
    url.searchParams.set('use_account_attribution_setting', 'true');
    url.searchParams.set('limit', String(META_PAGE_LIMIT));
    url.searchParams.set('fields', breakdownFields);
    url.searchParams.set('breakdowns', breakdowns);
    return url;
  };

  const rows: ReturnType<typeof mapMetaAdsInsightRow>[] = [];
  let pagesFetched = 0;
  let usage: Record<string, unknown> = { account: accountResult.usage };

  for (const [rangeIndex, range] of splitInsightsRange(since, until).entries()) {
    let pageInRange = 0;
    let next: URL | null = buildInsightsUrl(range);
    while (next) {
      if (pagesFetched >= MAX_PAGES) {
        throw new MetaAdsSyncError('Meta Ads pagination exceeded the safety limit.', 'page_limit');
      }
      const result: MetaRequestResult<z.infer<typeof insightsPageSchema>> = await metaRequest(
        next,
        input.config,
        input.fetchImpl,
        wait,
        insightsPageSchema,
        'Insights page',
      );
      const page: z.infer<typeof insightsPageSchema> = result.body;
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
      pageInRange += 1;
      usage = {
        ...usage,
        [`range_${rangeIndex + 1}_page_${pageInRange}`]: result.usage,
      };
      next = page.paging?.next ? new URL(page.paging.next) : null;
    }
  }

  const breakdownRows: ReturnType<typeof mapMetaAdsBreakdownRow>[] = [];
  const breakdownRequests = [
    {
      kind: 'placement_device' as const,
      value: 'publisher_platform,platform_position,impression_device',
    },
    { kind: 'region' as const, value: 'region' },
  ];
  for (const [breakdownIndex, breakdown] of breakdownRequests.entries()) {
    for (const [rangeIndex, range] of splitInsightsRange(since, until).entries()) {
      let pageInRange = 0;
      let next: URL | null = buildBreakdownUrl(range, breakdown.value);
      while (next) {
        if (pagesFetched >= MAX_PAGES) {
          throw new MetaAdsSyncError(
            'Meta Ads pagination exceeded the safety limit.',
            'page_limit',
          );
        }
        const result: MetaRequestResult<z.infer<typeof breakdownInsightsPageSchema>> =
          await metaRequest(
            next,
            input.config,
            input.fetchImpl,
            wait,
            breakdownInsightsPageSchema,
            `${breakdown.kind} breakdown page`,
          );
        const page: z.infer<typeof breakdownInsightsPageSchema> = result.body;
        breakdownRows.push(
          ...page.data.map((row) => mapMetaAdsBreakdownRow(row, breakdown.kind, input.now)),
        );
        pagesFetched += 1;
        pageInRange += 1;
        usage = {
          ...usage,
          [`breakdown_${breakdownIndex + 1}_range_${rangeIndex + 1}_page_${pageInRange}`]:
            result.usage,
        };
        next = page.paging?.next ? new URL(page.paging.next) : null;
      }
    }
  }

  const campaignUrl = new URL(
    `https://${META_GRAPH_HOST}/${input.config.apiVersion}/act_${input.config.accountId}/campaigns`,
  );
  campaignUrl.searchParams.set(
    'fields',
    'id,name,status,effective_status,objective,bid_strategy,daily_budget,lifetime_budget,budget_remaining,start_time,stop_time',
  );
  campaignUrl.searchParams.set('limit', String(META_PAGE_LIMIT));
  const adsetUrl = new URL(
    `https://${META_GRAPH_HOST}/${input.config.apiVersion}/act_${input.config.accountId}/adsets`,
  );
  adsetUrl.searchParams.set(
    'fields',
    'id,name,campaign_id,status,effective_status,optimization_goal,billing_event,bid_strategy,daily_budget,lifetime_budget,budget_remaining,start_time,end_time',
  );
  adsetUrl.searchParams.set('limit', String(META_PAGE_LIMIT));
  const entityPages: Array<{
    entityType: 'campaign' | 'adset';
    rows: z.infer<typeof deliveryEntitySchema>[];
  }> = [];
  for (const [entityType, firstUrl] of [
    ['campaign', campaignUrl],
    ['adset', adsetUrl],
  ] as const) {
    const entityRows: z.infer<typeof deliveryEntitySchema>[] = [];
    let next: URL | null = firstUrl;
    let pageIndex = 0;
    while (next) {
      if (pagesFetched >= MAX_PAGES) {
        throw new MetaAdsSyncError('Meta Ads pagination exceeded the safety limit.', 'page_limit');
      }
      const result: MetaRequestResult<z.infer<typeof deliveryEntitiesPageSchema>> =
        await metaRequest(
          next,
          input.config,
          input.fetchImpl,
          wait,
          deliveryEntitiesPageSchema,
          `${entityType} page`,
        );
      const page: z.infer<typeof deliveryEntitiesPageSchema> = result.body;
      entityRows.push(...page.data);
      pagesFetched += 1;
      pageIndex += 1;
      usage = { ...usage, [`${entityType}_page_${pageIndex}`]: result.usage };
      next = page.paging?.next ? new URL(page.paging.next) : null;
    }
    entityPages.push({ entityType, rows: entityRows });
  }
  const campaignNames = new Map(
    entityPages
      .find((page) => page.entityType === 'campaign')
      ?.rows.map((row) => [row.id, row.name]) ?? [],
  );
  const deliveryEntities = entityPages.flatMap(({ entityType, rows: entityRows }) =>
    entityRows.map((row) => {
      const campaignId = entityType === 'campaign' ? row.id : (row.campaign_id ?? null);
      return {
        entityType,
        entityId: row.id,
        accountId: accountBody.id.replace(/^act_/, ''),
        campaignId,
        campaignName: campaignId ? (campaignNames.get(campaignId) ?? null) : null,
        name: row.name,
        status: row.status ?? null,
        effectiveStatus: row.effective_status ?? null,
        objective: row.objective ?? null,
        optimizationGoal: row.optimization_goal ?? null,
        billingEvent: row.billing_event ?? null,
        bidStrategy: row.bid_strategy ?? null,
        dailyBudget: metaMoney(row.daily_budget),
        lifetimeBudget: metaMoney(row.lifetime_budget),
        budgetRemaining: metaMoney(row.budget_remaining),
        startTime: metaTimestamp(row.start_time),
        stopTime: metaTimestamp(row.stop_time ?? row.end_time),
        syncedAt: input.now,
        updatedAt: input.now,
      };
    }),
  );

  return {
    account: {
      id: accountBody.id.replace(/^act_/, ''),
      currency: accountBody.currency,
      timezone: accountBody.timezone_name,
    },
    since,
    until,
    rows,
    breakdownRows,
    deliveryEntities,
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
