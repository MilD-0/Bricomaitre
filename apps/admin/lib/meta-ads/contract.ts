import { getDb } from '@bric/db/client';
import { z } from 'zod';
import type { responseUsage } from './transport';

export const DEFAULT_GRAPH_API_VERSION = 'v25.0';

export const DEFAULT_LOOKBACK_DAYS = 28;

export const MAX_LOOKBACK_DAYS = 90;

export const ACTION_REPORT_TIME = 'conversion';

export const DEFAULT_META_GRAPH_ORIGIN = 'https://graph.facebook.com';

export const META_PAGE_LIMIT = 500;

export const MAX_PAGES = 300;

export const MAX_INSIGHTS_DAYS_PER_REQUEST = 30;

export const META_INSERT_BATCH_SIZE = 250;

export type Database = ReturnType<typeof getDb>;

export type MetaAdsEnvironment = Record<string, string | undefined> &
  Partial<
    Record<
      | 'META_ADS_ACCESS_TOKEN'
      | 'META_AD_ACCOUNT_ID'
      | 'META_ADS_GRAPH_API_VERSION'
      | 'META_ADS_GRAPH_API_ORIGIN',
      string | undefined
    >
  >;

export type FetchLike = typeof fetch;

export type MetaRequestResult<T> = { body: T; usage: ReturnType<typeof responseUsage> };

export const accountResponseSchema = z
  .object({
    id: z.string().min(1),
    currency: z.string().trim().min(1).max(12),
    timezone_name: z.string().trim().min(1).max(120),
  })
  .passthrough();

export const actionMetricSchema = z
  .object({
    action_type: z.string(),
    value: z.union([z.string(), z.number()]),
  })
  .passthrough();

export const insightResponseRowSchema = z
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

export const insightsPageSchema = z
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

export const breakdownInsightRowSchema = insightResponseRowSchema.extend({
  publisher_platform: z.string().optional(),
  platform_position: z.string().optional(),
  impression_device: z.string().optional(),
  region: z.string().optional(),
});

export const breakdownInsightsPageSchema = z
  .object({
    data: z.array(breakdownInsightRowSchema),
    paging: z.object({ next: z.string().url().optional() }).passthrough().optional(),
  })
  .passthrough();

export const deliveryEntitySchema = z
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

export const deliveryEntitiesPageSchema = z
  .object({
    data: z.array(deliveryEntitySchema),
    paging: z.object({ next: z.string().url().optional() }).passthrough().optional(),
  })
  .passthrough();
