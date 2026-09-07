import { z } from 'zod';
import {
  ACTION_REPORT_TIME,
  actionMetricSchema,
  breakdownInsightRowSchema,
  insightResponseRowSchema,
} from './contract';

export function finiteNumber(value: string | number | undefined) {
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
  row: z.infer<typeof insightResponseRowSchema>,
  account: { currency: string; timezone: string },
  syncedAt: Date,
) {
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

export function mapMetaAdsBreakdownRow(
  row: z.infer<typeof breakdownInsightRowSchema>,
  kind: 'placement_device' | 'region',
  syncedAt: Date,
) {
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
