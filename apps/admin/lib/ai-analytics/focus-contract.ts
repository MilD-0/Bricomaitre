import { z } from 'zod';
import type { AnalyticsSource, AnalyticsView } from '../analytics';

export const adminAiAnalyticsFocusDimensions = [
  'economics_timeline',
  'paid_timeline',
  'cash_pipeline',
  'forecast',
  'signals',
  'posting_cohorts',
  'friday_weeks',
  'campaigns',
  'adsets',
  'ads',
  'attribution_maturation',
  'meta_daily',
  'profit_efficiency',
  'paid_funnel',
  'tracking_events',
  'shipment_states',
  'attempt_outcomes',
  'fulfillment_trend',
  'leading_forecast',
  'storefront_trend',
  'storefront_funnel',
  'storefront_paths',
  'storefront_searches',
  'storefront_products',
  'storefront_sources',
  'web_vitals',
  'landing_pages',
  'storefront_assistant',
  'search_trend',
  'search_opportunities',
  'search_pages',
  'search_devices',
  'search_countries',
  'search_appearances',
  'search_index_issues',
  'search_sitemaps',
  'products',
  'basket_pairs',
  'wilayas',
  'communes',
  'meta_regions',
  'customers',
  'operating_costs',
  'daily_assumptions',
] as const;

export type AdminAiAnalyticsFocusDimension = (typeof adminAiAnalyticsFocusDimensions)[number];

export const identifierFields: Partial<Record<AdminAiAnalyticsFocusDimension, readonly string[]>> =
  {
    campaigns: ['id', 'name'],
    adsets: ['id', 'name', 'campaignId'],
    ads: ['id', 'name', 'campaignId', 'adsetId'],
    attribution_maturation: ['campaignId'],
    tracking_events: ['name'],
    shipment_states: ['status', 'phase'],
    attempt_outcomes: ['outcome', 'band'],
    storefront_paths: ['from', 'to'],
    storefront_searches: ['term'],
    storefront_products: ['id', 'sku', 'title'],
    storefront_sources: ['name'],
    web_vitals: ['name'],
    landing_pages: ['id', 'slug', 'product'],
    search_opportunities: ['query'],
    search_pages: ['page', 'path'],
    search_devices: ['device'],
    search_countries: ['country'],
    search_appearances: ['appearance'],
    search_index_issues: ['url', 'path'],
    search_sitemaps: ['path'],
    products: ['id', 'sku', 'title'],
    basket_pairs: ['left', 'right'],
    wilayas: ['wilayaId', 'name'],
    communes: ['wilayaId', 'wilayaName', 'name'],
    meta_regions: ['name'],
    customers: ['name'],
    operating_costs: ['id', 'name'],
    daily_assumptions: ['date'],
  };

export const adminAiAnalyticsFocusLimitSchema = z
  .number()
  .int()
  .min(1)
  .max(100)
  .default(20)
  .describe('Maximum matched rows to return.');

export type AdminAiAnalyticsFocus = {
  dimension: AdminAiAnalyticsFocusDimension;
  search?: string;
  identifiers: string[];
  limit: number;
};

export type DatasetSpec = {
  views: AnalyticsView[];
  paths: Partial<Record<AnalyticsView, string[]>>;
  relatedPaths?: Partial<Record<AnalyticsView, string[]>>;
  relatedDefinition?: string;
  effectiveRangeKey: string;
  additionalEffectiveRangeKeys?: string[];
  definition: string;
  dateBasis: string;
  sources: AnalyticsSource['key'][];
  totalSemantics: string;
  rowSemantics?: Record<
    string,
    {
      definition: string;
      dateBasis: string;
      sources: AnalyticsSource['key'][];
      modeled?: boolean;
      maturity?: string | null;
      attribution?: string | null;
    }
  >;
};

export type AdminAiAnalyticsFieldContract = {
  field: string;
  definition: string;
  unit:
    | 'dzd'
    | 'eur'
    | 'number'
    | 'percent'
    | 'ratio'
    | 'hours'
    | 'seconds'
    | 'date'
    | 'text'
    | 'boolean';
  dateBasis: string;
  sources: AnalyticsSource['key'][];
  nullMeaning: string;
  modeled: boolean;
  estimation: string | null;
  maturity: string | null;
  attribution: string | null;
};

export function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
