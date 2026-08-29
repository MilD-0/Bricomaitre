import { and, sql, type SQLWrapper } from 'drizzle-orm';

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
  pageTypes: Array<{ name: string; sessions: number; pageViews: number; interactions: number }>;
  locales: Array<{ name: string; sessions: number; pageViews: number; purchases: number }>;
  devices: Array<{ name: string; sessions: number; pageViews: number }>;
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
  blocks: Array<{ name: string; interactions: number; addToCarts: number; checkouts: number }>;
};

export type AiSurfaceStats = {
  runs: number;
  completed: number;
  failed: number;
  cancelled: number;
  successRate: number;
  helpful: number;
  notHelpful: number;
  helpfulRate: number;
  conversations: number;
  activeUsers: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number | null;
  costCoverageRate: number;
  averageDurationMs: number;
  toolCalls: number;
  proposals: number;
  appliedProposals: number;
  topTasks: Array<{ name: string; runs: number; successRate: number; tokens: number }>;
  models: Array<{ name: string; runs: number; tokens: number }>;
  trend: Array<{ bucket: string; runs: number; completed: number; failed: number; tokens: number }>;
};

export type AiAssistantStats = {
  admin: AiSurfaceStats;
  storefront: AiSurfaceStats & {
    enabled: boolean;
    opens: number;
    messages: number;
    resultClicks: number;
    errors: number;
    clickThroughRate: number;
    influencedOrders: number;
    confirmedOrders: number;
    completedOrders: number;
    paidOrders: number;
    recommendedProductOrders: number;
    submittedValueDzd: number;
    confirmationRate: number;
    usageCoverageStartsAt: string | null;
    topIntents: Array<{ name: string; messages: number }>;
  };
};

export type CustomerStats = {
  summary: {
    customers: number;
    successfulOrders: number;
    repeatCustomers: number;
    confirmedCustomers: number;
    repeatRate: number;
    averageOrders: number;
    averageOrderValue: number;
  };
  customers: Array<{
    phone: string;
    name: string;
    city: string;
    orders: number;
    confirmedOrders: number;
    totalValue: number;
    averageOrderValue: number;
    firstOrderAt: string;
    lastOrderAt: string;
    products: Array<{ name: string; count: number }>;
  }>;
};

export type MetaPaidAttributionStats = {
  visits: number;
  createdOrders: number;
  purchases: number;
  landedOnly: number;
  conversionRate: number;
  topCampaigns: Array<{ name: string; visits: number; orders: number; purchases: number }>;
};

export type ExperienceStats = {
  website: WebsiteExperienceStats;
  landingPages: LandingPageStats;
  aiAssistants: AiAssistantStats;
  customers: CustomerStats;
  metaPaidAttribution: MetaPaidAttributionStats;
};

export function numberValue(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

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

function addIsoDays(value: string, amount: number) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function reportingDay(now: Date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ADMIN_REPORTING_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function resolveRawWebsiteFilters(
  filters: ExperienceStatsFilters,
  now = new Date(),
): ExperienceStatsFilters {
  const effectiveEndDate = filters.endDate || reportingDay(now);
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

export function reportingTimestampCondition(
  column: SQLWrapper,
  filters: ExperienceStatsFilters,
) {
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

function emptyAiSurface(): AiSurfaceStats {
  return {
    runs: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
    successRate: 0,
    helpful: 0,
    notHelpful: 0,
    helpfulRate: 0,
    conversations: 0,
    activeUsers: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    estimatedCostUsd: null,
    costCoverageRate: 0,
    averageDurationMs: 0,
    toolCalls: 0,
    proposals: 0,
    appliedProposals: 0,
    topTasks: [],
    models: [],
    trend: [],
  };
}

export function emptyExperienceStats(): ExperienceStats {
  return {
    website: {
      engagedSessions: 0,
      engagementRate: 0,
      returningJourneys: 0,
      errorEvents: 0,
      errorRate: 0,
      pageTypes: [],
      locales: [],
      devices: [],
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
      blocks: [],
    },
    aiAssistants: {
      admin: emptyAiSurface(),
      storefront: {
        ...emptyAiSurface(),
        enabled: false,
        opens: 0,
        messages: 0,
        resultClicks: 0,
        errors: 0,
        clickThroughRate: 0,
        influencedOrders: 0,
        confirmedOrders: 0,
        completedOrders: 0,
        paidOrders: 0,
        recommendedProductOrders: 0,
        submittedValueDzd: 0,
        confirmationRate: 0,
        usageCoverageStartsAt: null,
        topIntents: [],
      },
    },
    customers: {
      summary: {
        customers: 0,
        successfulOrders: 0,
        repeatCustomers: 0,
        confirmedCustomers: 0,
        repeatRate: 0,
        averageOrders: 0,
        averageOrderValue: 0,
      },
      customers: [],
    },
    metaPaidAttribution: {
      visits: 0,
      createdOrders: 0,
      purchases: 0,
      landedOnly: 0,
      conversionRate: 0,
      topCampaigns: [],
    },
  };
}
