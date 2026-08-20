import {
  bigserial,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const searchConsoleDailyTotals = pgTable(
  'search_console_daily_totals',
  {
    day: date('day').notNull(),
    searchType: text('search_type').notNull().default('web'),
    clicks: numeric('clicks', { precision: 18, scale: 4 }).notNull().default('0'),
    impressions: numeric('impressions', { precision: 18, scale: 4 }).notNull().default('0'),
    ctr: numeric('ctr', { precision: 12, scale: 8 }).notNull().default('0'),
    position: numeric('position', { precision: 12, scale: 6 }),
    dataState: text('data_state').notNull().default('final'),
    syncedAt: timestamp('synced_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.day, table.searchType] }),
    index('idx_search_console_totals_type_day').on(table.searchType, table.day.desc()),
  ],
);

export const searchConsoleDailyRows = pgTable(
  'search_console_daily_rows',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    day: date('day').notNull(),
    searchType: text('search_type').notNull().default('web'),
    query: text('query').notNull().default(''),
    page: text('page').notNull().default(''),
    country: text('country').notNull().default(''),
    device: text('device').notNull().default(''),
    clicks: numeric('clicks', { precision: 18, scale: 4 }).notNull().default('0'),
    impressions: numeric('impressions', { precision: 18, scale: 4 }).notNull().default('0'),
    ctr: numeric('ctr', { precision: 12, scale: 8 }).notNull().default('0'),
    position: numeric('position', { precision: 12, scale: 6 }),
    syncedAt: timestamp('synced_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('search_console_daily_dimensions_unique').on(
      table.day,
      table.searchType,
      table.query,
      table.page,
      table.country,
      table.device,
    ),
    index('idx_search_console_rows_day').on(table.day.desc()),
    index('idx_search_console_rows_query_day').on(table.query, table.day.desc()),
    index('idx_search_console_rows_page_day').on(table.page, table.day.desc()),
    index('idx_search_console_rows_device_day').on(table.device, table.day.desc()),
  ],
);

export const searchConsoleDailyAppearances = pgTable(
  'search_console_daily_appearances',
  {
    day: date('day').notNull(),
    searchType: text('search_type').notNull().default('web'),
    appearance: text('appearance').notNull(),
    clicks: numeric('clicks', { precision: 18, scale: 4 }).notNull().default('0'),
    impressions: numeric('impressions', { precision: 18, scale: 4 }).notNull().default('0'),
    ctr: numeric('ctr', { precision: 12, scale: 8 }).notNull().default('0'),
    position: numeric('position', { precision: 12, scale: 6 }),
    syncedAt: timestamp('synced_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.day, table.searchType, table.appearance] }),
    index('idx_search_console_appearance_day').on(table.appearance, table.day.desc()),
  ],
);

export const searchConsoleUrlInspections = pgTable(
  'search_console_url_inspections',
  {
    url: text('url').primaryKey(),
    siteUrl: text('site_url').notNull(),
    verdict: text('verdict'),
    coverageState: text('coverage_state'),
    robotsTxtState: text('robots_txt_state'),
    indexingState: text('indexing_state'),
    pageFetchState: text('page_fetch_state'),
    googleCanonical: text('google_canonical'),
    userCanonical: text('user_canonical'),
    lastCrawlAt: timestamp('last_crawl_at', { withTimezone: true }),
    crawledAs: text('crawled_as'),
    referringUrls: jsonb('referring_urls').notNull().default([]),
    sitemapUrls: jsonb('sitemap_urls').notNull().default([]),
    richResults: jsonb('rich_results').notNull().default({}),
    inspectedAt: timestamp('inspected_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_search_console_inspections_verdict').on(table.verdict, table.inspectedAt.desc()),
    index('idx_search_console_inspections_crawl').on(table.lastCrawlAt.desc()),
  ],
);

export const searchConsoleSitemaps = pgTable(
  'search_console_sitemaps',
  {
    path: text('path').primaryKey(),
    siteUrl: text('site_url').notNull(),
    type: text('type'),
    isPending: boolean('is_pending').notNull().default(false),
    isSitemapsIndex: boolean('is_sitemaps_index').notNull().default(false),
    warnings: integer('warnings').notNull().default(0),
    errors: integer('errors').notNull().default(0),
    submittedUrls: integer('submitted_urls').notNull().default(0),
    contents: jsonb('contents').notNull().default([]),
    lastSubmittedAt: timestamp('last_submitted_at', { withTimezone: true }),
    lastDownloadedAt: timestamp('last_downloaded_at', { withTimezone: true }),
    syncedAt: timestamp('synced_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_search_console_sitemaps_synced').on(table.syncedAt.desc())],
);

export const searchConsoleSyncRuns = pgTable(
  'search_console_sync_runs',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    trigger: text('trigger').notNull(),
    status: text('status').notNull(),
    siteUrl: text('site_url').notNull(),
    sinceDay: date('since_day').notNull(),
    untilDay: date('until_day').notNull(),
    totalsFetched: integer('totals_fetched').notNull().default(0),
    detailRowsFetched: integer('detail_rows_fetched').notNull().default(0),
    appearancesFetched: integer('appearances_fetched').notNull().default(0),
    urlsInspected: integer('urls_inspected').notNull().default(0),
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_search_console_sync_started').on(table.startedAt.desc()),
    index('idx_search_console_sync_status_started').on(table.status, table.startedAt.desc()),
  ],
);
