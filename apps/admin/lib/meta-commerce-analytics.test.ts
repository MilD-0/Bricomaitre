import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it, vi } from 'vitest';

import {
  buildMetaCommercePerformanceQuery,
  buildMetaCommerceSummaryQuery,
  getMetaCommercePerformance,
} from './meta-commerce-analytics';

describe('integrated Meta commerce analytics', () => {
  const dialect = new PgDialect();

  it('joins ad spend to durable order, cost, settlement, and ECOTRACK outcomes', () => {
    const query = dialect.sqlToQuery(
      buildMetaCommercePerformanceQuery(
        { startDate: '2026-08-01', endDate: '2026-08-17', limit: 25 },
        true,
      ),
    );

    expect(query.sql).toContain('from "meta_ads_daily_insights"');
    expect(query.sql).toContain('from "order_acquisition_attribution"');
    expect(query.sql).toContain('left join "admin"."ecotrack_order_states"');
    expect(query.sql).toContain('from "admin"."processed_orders"');
    expect(query.sql).toContain('full outer join order_cohorts');
    expect(query.sql).toContain('order_cohorts.ad_id = spend.ad_id');
    expect(query.sql).toContain('"order_line_items"."unit_purchase_price_snapshot"');
    expect(query.sql.toLowerCase()).not.toContain('roas');
  });

  it('keeps cost and profit unavailable without financial access', () => {
    const query = dialect.sqlToQuery(buildMetaCommercePerformanceQuery({}, false));
    expect(query.sql.match(/null::double precision/g)).toHaveLength(2);
  });

  it('builds truthful range totals without cross-currency ROAS', () => {
    const query = dialect.sqlToQuery(
      buildMetaCommerceSummaryQuery({ startDate: '2026-08-01', endDate: '2026-08-17' }),
    );

    expect(query.sql).toContain('from "meta_ads_daily_insights"');
    expect(query.sql).toContain('from "order_acquisition_attribution"');
    expect(query.sql).toContain('left join "admin"."ecotrack_order_states"');
    expect(query.sql).toContain('from "admin"."processed_orders"');
    expect(query.sql.toLowerCase()).not.toContain('roas');
  });

  it('normalizes PostgreSQL numeric results without inventing restricted values', async () => {
    const db = {
      execute: vi.fn().mockResolvedValue({
        rows: [
          {
            day: '2026-08-16',
            spend: '12.5',
            bricOrders: 3,
            submittedValueDzd: '15000',
            estimatedProductCostDzd: null,
            realizedProfitDzd: null,
          },
        ],
      }),
    };

    await expect(getMetaCommercePerformance(db as never, {}, false)).resolves.toEqual([
      expect.objectContaining({
        spend: 12.5,
        bricOrders: 3,
        submittedValueDzd: 15000,
        estimatedProductCostDzd: null,
        realizedProfitDzd: null,
      }),
    ]);
  });
});
