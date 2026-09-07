import { z } from 'zod';
import { MetaAdsSyncError, readMetaAdsConfig } from './config';
import {
  ACTION_REPORT_TIME,
  type FetchLike,
  MAX_PAGES,
  META_PAGE_LIMIT,
  type MetaRequestResult,
  accountResponseSchema,
  breakdownInsightsPageSchema,
  deliveryEntitiesPageSchema,
  deliveryEntitySchema,
  insightsPageSchema,
} from './contract';
import { dateOnly, dayInTimezone, splitInsightsRange, subtractDays } from './dates';
import { mapMetaAdsBreakdownRow, mapMetaAdsInsightRow } from './mapping';
import { metaMoney, metaRequest, metaTimestamp } from './transport';

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
    `${input.config.graphApiOrigin}/${input.config.apiVersion}/act_${input.config.accountId}`,
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
      `${input.config.graphApiOrigin}/${input.config.apiVersion}/act_${input.config.accountId}/insights`,
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
      `${input.config.graphApiOrigin}/${input.config.apiVersion}/act_${input.config.accountId}/insights`,
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
    `${input.config.graphApiOrigin}/${input.config.apiVersion}/act_${input.config.accountId}/campaigns`,
  );
  campaignUrl.searchParams.set(
    'fields',
    'id,name,status,effective_status,objective,bid_strategy,daily_budget,lifetime_budget,budget_remaining,start_time,stop_time',
  );
  campaignUrl.searchParams.set('limit', String(META_PAGE_LIMIT));
  const adsetUrl = new URL(
    `${input.config.graphApiOrigin}/${input.config.apiVersion}/act_${input.config.accountId}/adsets`,
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
