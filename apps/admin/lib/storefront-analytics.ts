import type { getDb } from '@bric/db/client';
import { type StatsFilters } from './stats-contract';
import { getStorefrontExperienceStats } from './stats-experience';
import { emptyExperienceStats } from './stats-experience-shared';
import {
  buildAnalyticsRollupWhere,
  buildAnalyticsWhere,
  buildLiveOrderTrendQuery,
  buildResolvedFilters,
  mergeCanonicalWebsitePurchases,
} from './stats-live-commerce';
import { getWebsiteAnalyticsData } from './stats-live-traffic';
import { numberOrZero, round } from './stats-values';

export async function getLiveStorefrontAnalytics(
  db: ReturnType<typeof getDb>,
  input: StatsFilters,
  options: { includeExperience?: boolean } = {},
) {
  const filters = buildResolvedFilters(input);
  const analyticsWhere = buildAnalyticsWhere(filters);
  const rollupWhere = buildAnalyticsRollupWhere(filters);
  const includeExperience = options.includeExperience !== false;
  const [websiteData, experience, orderTrend]: [
    Awaited<ReturnType<typeof getWebsiteAnalyticsData>>,
    Awaited<ReturnType<typeof getStorefrontExperienceStats>>,
    { rows: unknown[] },
  ] = await Promise.all([
    getWebsiteAnalyticsData(db, analyticsWhere, rollupWhere, filters),
    includeExperience
      ? getStorefrontExperienceStats(db, filters)
      : Promise.resolve(emptyExperienceStats()),
    db.execute(buildLiveOrderTrendQuery(filters)),
  ]);
  const dailyOrders = (orderTrend.rows as Array<{ bucket: string; orders: number }>).map((row) => ({
    bucket: row.bucket,
    orders: numberOrZero(row.orders),
  }));
  const summary = websiteData.summary;
  const website = mergeCanonicalWebsitePurchases(
    {
      sessions: summary?.sessions ?? 0,
      journeys: summary?.journeys ?? 0,
      pageViews: summary?.pageViews ?? 0,
      productViews: summary?.productViews ?? 0,
      addToCarts: summary?.addToCarts ?? 0,
      checkoutStarts: summary?.checkoutStarts ?? 0,
      purchases: 0,
      searches: summary?.searches ?? 0,
      zeroResultSearches: summary?.zeroResultSearches ?? 0,
      sessionConversionRate: 0,
      viewToCartRate: summary?.productViews
        ? round(((summary?.addToCarts ?? 0) / summary.productViews) * 100)
        : 0,
      cartToPurchaseRate: 0,
      checkoutToPurchaseRate: 0,
      topSearches: websiteData.searches.map((row) => ({
        term: row.term,
        searches: row.searches,
        zeroResults: row.zeroResults,
      })),
      funnel: [],
      topProducts: [],
      ...experience.website,
    },
    dailyOrders.reduce((total, day) => total + day.orders, 0),
    dailyOrders,
  );

  return {
    website,
    landingPages: experience.landingPages,
    aiAssistants: experience.aiAssistants,
  };
}
