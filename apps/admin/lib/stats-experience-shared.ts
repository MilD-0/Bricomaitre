import { and, sql, type SQLWrapper } from 'drizzle-orm';
import { dayInTimezone } from './analytics/date-range';
export { numberOrZero as numberValue } from './stats-values';

import { ORDER_STATUS } from '@bric/storefront-core/order-domain';

export const CUSTOMER_SUCCESSFUL_ORDER_STATUSES = [
  ORDER_STATUS.CONFIRMED,
  ORDER_STATUS.DISPATCHED,
  ORDER_STATUS.COMPLETED,
  ORDER_STATUS.DELAYED,
  ORDER_STATUS.IN_DELIVERY,
  ORDER_STATUS.MANUAL_COMPLETED,
  ORDER_STATUS.POSTED,
] as const;

export type ExperienceStatsFilters = {
  startDate: string;
  endDate: string;
};

export type WebsiteExperienceStats = {
  engagedSessions: number;
  engagementRate: number;
  returningJourneys: number;
  errorEvents: number;
  errorRate: number;
  vitals: Array<{
    name: string;
    samples: number;
    average: number;
    p75?: number;
    good: number;
    needsImprovement: number;
    poor: number;
  }>;
  acquisitionSources: Array<{
    name: string;
    sessions: number;
    orders: number;
    successfulOrders: number;
    conversionRate: number;
  }>;
  acquisitionCoverageStartsAt: string | null;
  trend: Array<{
    bucket: string;
    sessions: number;
    pageViews: number;
    purchases: number;
    errors: number;
  }>;
};

export type LandingPageStats = {
  summary: {
    total: number;
    published: number;
    drafts: number;
    sessions: number;
    productViews: number;
    addToCarts: number;
    checkoutStarts: number;
    purchases: number;
    revenue: number;
    conversionRate: number;
  };
  pages: Array<{
    id: number;
    slug: string;
    locale: string;
    status: string;
    product: string;
    revision: number | null;
    sessions: number;
    productViews: number;
    addToCarts: number;
    checkoutStarts: number;
    purchases: number;
    revenue: number;
    conversionRate: number;
  }>;
};

export type StorefrontAiStats = {
  opens: number;
  messages: number;
  resultClicks: number;
  influencedOrders: number;
  confirmedOrders: number;
  paidOrders: number;
};

export type ExperienceStats = {
  website: WebsiteExperienceStats;
  landingPages: LandingPageStats;
  aiAssistants: { storefront: StorefrontAiStats };
};

export function isoValue(value: unknown) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function round(value: number, places = 2) {
  const factor = 10 ** places;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function dateCondition(column: SQLWrapper, filters: ExperienceStatsFilters) {
  const conditions = [];
  if (filters.startDate) conditions.push(sql`${column} >= ${filters.startDate}::date`);
  if (filters.endDate)
    conditions.push(sql`${column} < (${filters.endDate}::date + interval '1 day')`);
  return conditions.length ? and(...conditions) : undefined;
}

export function timestampCondition(column: SQLWrapper, filters: ExperienceStatsFilters) {
  const conditions = [];
  if (filters.startDate)
    conditions.push(
      sql`${column} >= (${filters.startDate}::date::timestamp at time zone 'Africa/Algiers')`,
    );
  if (filters.endDate)
    conditions.push(
      sql`${column} < ((${filters.endDate}::date + interval '1 day') at time zone 'Africa/Algiers')`,
    );
  return conditions.length ? and(...conditions) : undefined;
}

function addIsoDays(value: string, amount: number) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

export function resolveRawWebsiteFilters(
  filters: ExperienceStatsFilters,
  now = new Date(),
): ExperienceStatsFilters {
  const effectiveEndDate = filters.endDate || dayInTimezone(now);
  const recentStartDate = addIsoDays(effectiveEndDate, -6);

  return {
    ...filters,
    startDate: [filters.startDate, recentStartDate].filter(Boolean).sort().at(-1)!,
  };
}

export function inclusiveDateDays(filters: ExperienceStatsFilters) {
  return (
    Math.floor(
      (Date.parse(`${filters.endDate}T00:00:00.000Z`) -
        Date.parse(`${filters.startDate}T00:00:00.000Z`)) /
        86_400_000,
    ) + 1
  );
}

export const ADMIN_REPORTING_TIMEZONE = 'Africa/Algiers';

export function reportingTimestampCondition(column: SQLWrapper, filters: ExperienceStatsFilters) {
  const conditions = [];
  if (filters.startDate)
    conditions.push(
      sql`(${column} at time zone ${ADMIN_REPORTING_TIMEZONE})::date >= ${filters.startDate}::date`,
    );
  if (filters.endDate)
    conditions.push(
      sql`(${column} at time zone ${ADMIN_REPORTING_TIMEZONE})::date <= ${filters.endDate}::date`,
    );
  return conditions.length ? and(...conditions) : undefined;
}

export function emptyExperienceStats(): ExperienceStats {
  return {
    website: {
      engagedSessions: 0,
      engagementRate: 0,
      returningJourneys: 0,
      errorEvents: 0,
      errorRate: 0,
      vitals: [],
      acquisitionSources: [],
      acquisitionCoverageStartsAt: null,
      trend: [],
    },
    landingPages: {
      summary: {
        total: 0,
        published: 0,
        drafts: 0,
        sessions: 0,
        productViews: 0,
        addToCarts: 0,
        checkoutStarts: 0,
        purchases: 0,
        revenue: 0,
        conversionRate: 0,
      },
      pages: [],
    },
    aiAssistants: {
      storefront: {
        opens: 0,
        messages: 0,
        resultClicks: 0,
        influencedOrders: 0,
        confirmedOrders: 0,
        paidOrders: 0,
      },
    },
  };
}
