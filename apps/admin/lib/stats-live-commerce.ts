import { analyticsEventProductIdsSql } from '@bric/storefront-core/analytics';
import { and, sql } from 'drizzle-orm';

import type { getDb } from '@bric/db/client';
import {
  analyticsAcquisitionDailyRollups,
  analyticsDailyRollups,
  analyticsEvents,
  analyticsSessions,
  brands,
  categories,
  orderLineItems,
  orders,
  products,
} from '@bric/db/schema';
import { ADMIN_REPORTING_TIMEZONE } from './stats-experience-shared';
import { numberOrZero, round, toDateInput } from './stats-values';
import { type WebsiteAnalyticsData, type StatsFilters } from './stats-contract';

export function buildResolvedFilters(input: StatsFilters): Required<StatsFilters> {
  const today = new Date();
  const endDate = toDateInput(today);
  let startDate = input.startDate ?? '';

  if (input.range === '7d') {
    const start = new Date(today);
    start.setDate(today.getDate() - 6);
    startDate = toDateInput(start);
  }

  if (input.range === '14d') {
    const start = new Date(today);
    start.setDate(today.getDate() - 13);
    startDate = toDateInput(start);
  }

  if (input.range === '30d') {
    const start = new Date(today);
    start.setDate(today.getDate() - 29);
    startDate = toDateInput(start);
  }

  if (input.range === '90d') {
    const start = new Date(today);
    start.setDate(today.getDate() - 89);
    startDate = toDateInput(start);
  }

  if (input.range === 'year') {
    startDate = `${today.getUTCFullYear()}-01-01`;
  }

  if (input.range === 'all') {
    return {
      range: input.range,
      startDate: input.startDate ?? '',
      endDate: input.endDate ?? '',
    };
  }

  if (input.range === 'custom') {
    return {
      range: input.range,
      startDate: input.startDate ?? '',
      endDate: input.endDate ?? '',
    };
  }

  return {
    range: input.range,
    startDate,
    endDate,
  };
}

export function buildAnalyticsWhere(filters: StatsFilters | Required<StatsFilters>) {
  const conditions = [];

  if (filters.startDate) {
    conditions.push(
      sql`${analyticsEvents.occurredAt} >= (${filters.startDate}::date::timestamp at time zone 'Africa/Algiers')`,
    );
  }

  if (filters.endDate) {
    conditions.push(
      sql`${analyticsEvents.occurredAt} < ((${filters.endDate}::date + interval '1 day') at time zone 'Africa/Algiers')`,
    );
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}

export function buildCanonicalStorefrontSessionsQuery(filters: Required<StatsFilters>) {
  return sql`
    select (
      coalesce((select sum(sessions)::int from (
        select ${analyticsAcquisitionDailyRollups.day} as day,
          sum(${analyticsAcquisitionDailyRollups.sessions})::int as sessions
        from ${analyticsAcquisitionDailyRollups}
        where ${
          filters.startDate
            ? sql`${analyticsAcquisitionDailyRollups.day} >= ${filters.startDate}::date`
            : sql`true`
        }
          and ${
            filters.endDate
              ? sql`${analyticsAcquisitionDailyRollups.day} <= ${filters.endDate}::date`
              : sql`true`
          }
        group by ${analyticsAcquisitionDailyRollups.day}
        union all
        select ${analyticsDailyRollups.day}, ${analyticsDailyRollups.sessions}
        from ${analyticsDailyRollups}
        where ${analyticsDailyRollups.dimension} = 'overall'
          and ${analyticsDailyRollups.dayTimezone} = 'UTC'
          and ${analyticsDailyRollups.dimensionKey} = ''
          and ${
            filters.startDate
              ? sql`${analyticsDailyRollups.day} >= ${filters.startDate}::date`
              : sql`true`
          }
          and ${
            filters.endDate
              ? sql`${analyticsDailyRollups.day} <= ${filters.endDate}::date`
              : sql`true`
          }
          and not exists (
            select 1 from ${analyticsAcquisitionDailyRollups} acquisition
            where acquisition.day = ${analyticsDailyRollups.day}
              and acquisition.day_timezone = ${analyticsDailyRollups.dayTimezone}
          )
      ) rolled), 0)
      + coalesce((select count(distinct ${analyticsSessions.id})::int
        from ${analyticsSessions}
        where ${
          filters.startDate
            ? sql`${analyticsSessions.startedAt} >= (${filters.startDate}::date::timestamp at time zone 'Africa/Algiers')`
            : sql`true`
        }
          and ${
            filters.endDate
              ? sql`${analyticsSessions.startedAt} < ((${filters.endDate}::date + interval '1 day') at time zone 'Africa/Algiers')`
              : sql`true`
          }
          and not exists (
            select 1 from ${analyticsDailyRollups} rollup
            where rollup.day = (${analyticsSessions.startedAt} at time zone rollup.day_timezone)::date
              and rollup.dimension = 'overall'
              and rollup.dimension_key = ''
          )
          and not exists (
            select 1 from ${analyticsAcquisitionDailyRollups} acquisition
            where acquisition.day = (${analyticsSessions.startedAt} at time zone acquisition.day_timezone)::date
          )), 0)
    )::int as sessions
  `;
}

export async function getCanonicalStorefrontSessionCount(
  db: ReturnType<typeof getDb>,
  input: StatsFilters,
) {
  if (input.startDate && input.endDate && input.startDate > input.endDate) return 0;
  const filters = buildResolvedFilters(input);
  const result = await db.execute(buildCanonicalStorefrontSessionsQuery(filters));
  return numberOrZero((result.rows[0] as Record<string, unknown> | undefined)?.sessions);
}

function buildLiveOrderWhere(filters: Required<StatsFilters>) {
  const localOrderDate = sql`(${orders.createdAt} at time zone ${ADMIN_REPORTING_TIMEZONE})::date`;
  const conditions = [];

  if (filters.startDate) {
    conditions.push(sql`${localOrderDate} >= ${filters.startDate}::date`);
  }

  if (filters.endDate) {
    conditions.push(sql`${localOrderDate} <= ${filters.endDate}::date`);
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}

export function buildLiveOrderTrendQuery(filters: Required<StatsFilters>) {
  const where = buildLiveOrderWhere(filters);
  return sql`
    with filtered_orders as (
      select ${orders.createdAt} at time zone ${ADMIN_REPORTING_TIMEZONE} as local_created_at
      from ${orders}
      where ${where ?? sql`true`}
    )
    select to_char(local_created_at::date, 'YYYY-MM-DD') as bucket,
      count(*)::int as orders
    from filtered_orders group by 1 order by 1
  `;
}

export function mergeCanonicalWebsitePurchases(
  website: WebsiteAnalyticsData,
  purchases: number,
  dailyOrders?: Array<{ bucket: string; orders: number }>,
): WebsiteAnalyticsData {
  const funnel = [
    ...website.funnel.filter((item) => item.name !== 'Purchases'),
    ...(purchases > 0 ? [{ name: 'Purchases', value: purchases }] : []),
  ];

  const trend = dailyOrders
    ? (() => {
        const merged = new Map(
          website.trend.map((point) => [point.bucket, { ...point, purchases: 0 }]),
        );

        for (const point of dailyOrders) {
          merged.set(point.bucket, {
            ...(merged.get(point.bucket) ?? {
              bucket: point.bucket,
              sessions: 0,
              pageViews: 0,
              errors: 0,
            }),
            purchases: point.orders,
          });
        }

        return [...merged.values()].sort((left, right) => left.bucket.localeCompare(right.bucket));
      })()
    : website.trend;

  return {
    ...website,
    purchases,
    trend,
    sessionConversionRate: website.sessions ? round((purchases / website.sessions) * 100) : 0,
    cartToPurchaseRate: website.addToCarts ? round((purchases / website.addToCarts) * 100) : 0,
    checkoutToPurchaseRate: website.checkoutStarts
      ? round((purchases / website.checkoutStarts) * 100)
      : 0,
    funnel,
  };
}

export function buildAnalyticsRollupWhere(filters: StatsFilters | Required<StatsFilters>) {
  const conditions = [];
  if (filters.startDate) {
    conditions.push(sql`${analyticsDailyRollups.day} >= ${filters.startDate}::date`);
  }
  if (filters.endDate) {
    conditions.push(sql`${analyticsDailyRollups.day} <= ${filters.endDate}::date`);
  }
  return conditions.length > 0 ? and(...conditions) : undefined;
}

export function buildWebsiteProductMetricsQuery(filters: Required<StatsFilters>) {
  const analyticsWhere = buildAnalyticsWhere(filters);
  const rollupWhere = buildAnalyticsRollupWhere(filters);
  const orderWhere = buildLiveOrderWhere(filters);
  const unrolledAnalyticsWhere = and(
    analyticsWhere,
    sql`not exists (
      select 1 from ${analyticsDailyRollups} rollup
      where rollup.day = (${analyticsEvents.occurredAt} at time zone rollup.day_timezone)::date
        and rollup.dimension = 'overall'
        and rollup.dimension_key = ''
    )`,
  );

  return sql`
    with raw_product_engagement as (
      select attributed.product_id,
        count(*) filter (where ${analyticsEvents.eventName} = 'view_item')::int as view_count,
        count(*) filter (where ${analyticsEvents.eventName} = 'add_to_cart')::int as add_to_cart_count,
        count(*) filter (where ${analyticsEvents.eventName} = 'begin_checkout')::int as checkout_count
      from ${analyticsEvents}
      cross join ${analyticsEventProductIdsSql()} attributed
      where ${unrolledAnalyticsWhere ?? sql`true`}
      group by attributed.product_id
    ), rollup_product_engagement as (
      select case when ${analyticsDailyRollups.dimensionKey} ~ '^[0-9]+$'
          then ${analyticsDailyRollups.dimensionKey}::bigint end as product_id,
        coalesce(sum(${analyticsDailyRollups.productViews}), 0)::int as view_count,
        coalesce(sum(${analyticsDailyRollups.addToCarts}), 0)::int as add_to_cart_count,
        coalesce(sum(${analyticsDailyRollups.checkoutStarts}), 0)::int as checkout_count
      from ${analyticsDailyRollups}
      where ${rollupWhere ?? sql`true`}
        and ${analyticsDailyRollups.dimension} = 'product'
      group by ${analyticsDailyRollups.dimensionKey}
    ), merged_product_engagement as (
      select product_id,
        sum(view_count)::int as view_count,
        sum(add_to_cart_count)::int as add_to_cart_count,
        sum(checkout_count)::int as checkout_count
      from (
        select * from raw_product_engagement
        union all
        select * from rollup_product_engagement
      ) source
      where product_id is not null
      group by product_id
    ), normalized_order_products as (
      select ${orderLineItems.orderId} as order_id, ${orderLineItems.productId} as product_id
      from ${orderLineItems}
      inner join ${orders} on ${orders.id} = ${orderLineItems.orderId}
      where ${orderWhere ?? sql`true`}
        and ${orderLineItems.productId} is not null
    ), legacy_order_products as (
      select ${orders.id} as order_id, matched.product_id
      from ${orders}
      cross join lateral unnest(${orders.cartProducts}) product_ref
      inner join lateral (
        select ${products.id} as product_id
        from ${products}
        where (${products.id} = case
            when trim(product_ref) ~ '^[0-9]+$' then trim(product_ref)::bigint
            else null
          end)
          or ${products.mongoId} = trim(product_ref)
          or ${products.slug} = trim(product_ref)
        order by case
          when trim(product_ref) ~ '^[0-9]+$' and ${products.id} = trim(product_ref)::bigint then 0
          when ${products.mongoId} = trim(product_ref) then 1
          else 2
        end
        limit 1
      ) matched on true
      where ${orderWhere ?? sql`true`}
        and not exists (
          select 1 from ${orderLineItems}
          where ${orderLineItems.orderId} = ${orders.id}
        )
    ), order_product_purchases as (
      select product_id, count(distinct order_id)::int as purchase_count
      from (
        select order_id, product_id from normalized_order_products
        union all
        select order_id, product_id from legacy_order_products
      ) order_products
      group by product_id
    ), combined_product_metrics as (
      select coalesce(engagement.product_id, purchases.product_id) as product_id,
        coalesce(engagement.view_count, 0)::int as view_count,
        coalesce(engagement.add_to_cart_count, 0)::int as add_to_cart_count,
        coalesce(engagement.checkout_count, 0)::int as checkout_count,
        coalesce(purchases.purchase_count, 0)::int as purchase_count
      from merged_product_engagement engagement
      full join order_product_purchases purchases on purchases.product_id = engagement.product_id
    )
    select product.id, product.title, product.sku,
      category.name as category_name, brand.name as brand_name,
      metrics.view_count, metrics.add_to_cart_count, metrics.checkout_count,
      metrics.purchase_count as website_purchase_count,
      (metrics.view_count + metrics.add_to_cart_count * 4 + metrics.checkout_count * 7 + metrics.purchase_count * 10)::double precision as popularity_score,
      coalesce(metrics.purchase_count::double precision / nullif(metrics.view_count, 0), 0) as website_conversion_rate
    from combined_product_metrics metrics
    join ${products} product on product.id = metrics.product_id
    left join ${categories} category on category.id = product.category_id
    left join ${brands} brand on brand.id = product.brand_id
    order by popularity_score desc, metrics.view_count desc
  `;
}

export type LiveWebsiteProductMetric = {
  id: number;
  title: string;
  sku: string | null;
  categoryName: string | null;
  brandName: string | null;
  viewCount: number;
  addToCartCount: number;
  checkoutCount: number;
  websitePurchaseCount: number;
  popularityScore: number;
  websiteConversionRate: number;
};

export async function getLiveWebsiteProductMetrics(
  db: ReturnType<typeof getDb>,
  input: StatsFilters,
): Promise<LiveWebsiteProductMetric[]> {
  if (input.startDate && input.endDate && input.startDate > input.endDate) return [];
  const filters = buildResolvedFilters(input);
  const result = await db.execute(buildWebsiteProductMetricsQuery(filters));

  return (result.rows as Array<Record<string, unknown>>).map((row): LiveWebsiteProductMetric => ({
    id: numberOrZero(row.id),
    title: String(row.title ?? ''),
    sku: row.sku == null ? null : String(row.sku),
    categoryName: row.category_name == null ? null : String(row.category_name),
    brandName: row.brand_name == null ? null : String(row.brand_name),
    viewCount: numberOrZero(row.view_count),
    addToCartCount: numberOrZero(row.add_to_cart_count),
    checkoutCount: numberOrZero(row.checkout_count),
    websitePurchaseCount: numberOrZero(row.website_purchase_count),
    popularityScore: round(numberOrZero(row.popularity_score)),
    websiteConversionRate: round(numberOrZero(row.website_conversion_rate) * 100),
  }));
}
