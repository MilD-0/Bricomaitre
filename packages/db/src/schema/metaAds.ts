import {
  bigint,
  bigserial,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  primaryKey,
} from 'drizzle-orm/pg-core';

export const metaAdsDailyInsights = pgTable(
  'meta_ads_daily_insights',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    day: date('day').notNull(),
    accountId: text('account_id').notNull(),
    accountCurrency: text('account_currency').notNull(),
    accountTimezone: text('account_timezone').notNull(),
    campaignId: text('campaign_id').notNull(),
    campaignName: text('campaign_name'),
    adsetId: text('adset_id').notNull(),
    adsetName: text('adset_name'),
    adId: text('ad_id').notNull(),
    adName: text('ad_name'),
    objective: text('objective'),
    attributionSetting: text('attribution_setting').notNull(),
    actionReportTime: text('action_report_time').notNull(),
    attributionWindows: jsonb('attribution_windows').notNull().default([]),
    spend: numeric('spend', { precision: 16, scale: 4 }).notNull().default('0'),
    impressions: bigint('impressions', { mode: 'number' }).notNull().default(0),
    reach: bigint('reach', { mode: 'number' }).notNull().default(0),
    clicks: bigint('clicks', { mode: 'number' }).notNull().default(0),
    inlineLinkClicks: bigint('inline_link_clicks', { mode: 'number' }).notNull().default(0),
    outboundClicks: numeric('outbound_clicks', { precision: 14, scale: 4 }).notNull().default('0'),
    uniqueOutboundClicks: numeric('unique_outbound_clicks', { precision: 14, scale: 4 })
      .notNull()
      .default('0'),
    landingPageViews: numeric('landing_page_views', { precision: 14, scale: 4 })
      .notNull()
      .default('0'),
    addToCarts: numeric('add_to_carts', { precision: 14, scale: 4 }).notNull().default('0'),
    initiateCheckouts: numeric('initiate_checkouts', { precision: 14, scale: 4 })
      .notNull()
      .default('0'),
    leads: numeric('leads', { precision: 14, scale: 4 }).notNull().default('0'),
    purchases: numeric('purchases', { precision: 14, scale: 4 }).notNull().default('0'),
    purchaseValue: numeric('purchase_value', { precision: 16, scale: 2 }).notNull().default('0'),
    videoPlays: numeric('video_plays', { precision: 14, scale: 4 }).notNull().default('0'),
    videoP25Watched: numeric('video_p25_watched', { precision: 14, scale: 4 })
      .notNull()
      .default('0'),
    videoP50Watched: numeric('video_p50_watched', { precision: 14, scale: 4 })
      .notNull()
      .default('0'),
    videoP75Watched: numeric('video_p75_watched', { precision: 14, scale: 4 })
      .notNull()
      .default('0'),
    videoP95Watched: numeric('video_p95_watched', { precision: 14, scale: 4 })
      .notNull()
      .default('0'),
    videoP100Watched: numeric('video_p100_watched', { precision: 14, scale: 4 })
      .notNull()
      .default('0'),
    videoAverageWatchSeconds: numeric('video_average_watch_seconds', {
      precision: 12,
      scale: 4,
    })
      .notNull()
      .default('0'),
    qualityRanking: text('quality_ranking'),
    engagementRateRanking: text('engagement_rate_ranking'),
    conversionRateRanking: text('conversion_rate_ranking'),
    syncedAt: timestamp('synced_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('meta_ads_daily_insights_grain_unique').on(
      t.accountId,
      t.day,
      t.adId,
      t.actionReportTime,
      t.attributionSetting,
    ),
    index('idx_meta_ads_insights_campaign_day').on(t.campaignId, t.day.desc()),
    index('idx_meta_ads_insights_adset_day').on(t.adsetId, t.day.desc()),
    index('idx_meta_ads_insights_ad_day').on(t.adId, t.day.desc()),
    index('idx_meta_ads_insights_day_adset').on(t.day.desc(), t.adsetId),
  ],
);

export const metaAdsSyncRuns = pgTable(
  'meta_ads_sync_runs',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    trigger: text('trigger').notNull(),
    status: text('status').notNull(),
    apiVersion: text('api_version').notNull(),
    accountId: text('account_id').notNull(),
    accountCurrency: text('account_currency'),
    accountTimezone: text('account_timezone'),
    sinceDay: date('since_day').notNull(),
    untilDay: date('until_day').notNull(),
    pagesFetched: integer('pages_fetched').notNull().default(0),
    rowsFetched: integer('rows_fetched').notNull().default(0),
    rowsUpserted: integer('rows_upserted').notNull().default(0),
    usage: jsonb('usage').notNull().default({}),
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_meta_ads_sync_runs_started').on(t.startedAt.desc()),
    index('idx_meta_ads_sync_runs_status_started').on(t.status, t.startedAt.desc()),
  ],
);

export const metaAdsBreakdownDailyInsights = pgTable(
  'meta_ads_breakdown_daily_insights',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    day: date('day').notNull(),
    accountId: text('account_id').notNull(),
    campaignId: text('campaign_id').notNull(),
    campaignName: text('campaign_name'),
    adsetId: text('adset_id').notNull(),
    adsetName: text('adset_name'),
    adId: text('ad_id').notNull(),
    adName: text('ad_name'),
    breakdownKind: text('breakdown_kind').notNull(),
    publisherPlatform: text('publisher_platform').notNull().default(''),
    platformPosition: text('platform_position').notNull().default(''),
    impressionDevice: text('impression_device').notNull().default(''),
    region: text('region').notNull().default(''),
    spend: numeric('spend', { precision: 16, scale: 4 }).notNull().default('0'),
    impressions: bigint('impressions', { mode: 'number' }).notNull().default(0),
    reach: bigint('reach', { mode: 'number' }).notNull().default(0),
    clicks: bigint('clicks', { mode: 'number' }).notNull().default(0),
    outboundClicks: numeric('outbound_clicks', { precision: 14, scale: 4 }).notNull().default('0'),
    landingPageViews: numeric('landing_page_views', { precision: 14, scale: 4 })
      .notNull()
      .default('0'),
    purchases: numeric('purchases', { precision: 14, scale: 4 }).notNull().default('0'),
    purchaseValue: numeric('purchase_value', { precision: 16, scale: 2 }).notNull().default('0'),
    syncedAt: timestamp('synced_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('meta_ads_breakdown_daily_grain_unique').on(
      table.accountId,
      table.day,
      table.adId,
      table.breakdownKind,
      table.publisherPlatform,
      table.platformPosition,
      table.impressionDevice,
      table.region,
    ),
    index('idx_meta_ads_breakdown_kind_day').on(table.breakdownKind, table.day.desc()),
    index('idx_meta_ads_breakdown_campaign_day').on(table.campaignId, table.day.desc()),
  ],
);

export const metaAdsDeliveryEntities = pgTable(
  'meta_ads_delivery_entities',
  {
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    accountId: text('account_id').notNull(),
    campaignId: text('campaign_id'),
    campaignName: text('campaign_name'),
    name: text('name').notNull(),
    status: text('status'),
    effectiveStatus: text('effective_status'),
    objective: text('objective'),
    optimizationGoal: text('optimization_goal'),
    billingEvent: text('billing_event'),
    bidStrategy: text('bid_strategy'),
    dailyBudget: numeric('daily_budget', { precision: 16, scale: 2 }),
    lifetimeBudget: numeric('lifetime_budget', { precision: 16, scale: 2 }),
    budgetRemaining: numeric('budget_remaining', { precision: 16, scale: 2 }),
    startTime: timestamp('start_time', { withTimezone: true }),
    stopTime: timestamp('stop_time', { withTimezone: true }),
    syncedAt: timestamp('synced_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.entityType, table.entityId] }),
    index('idx_meta_ads_delivery_entities_campaign').on(table.campaignId, table.entityType),
    index('idx_meta_ads_delivery_entities_status').on(table.entityType, table.effectiveStatus),
  ],
);
