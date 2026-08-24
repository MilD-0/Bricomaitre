import { describe, expect, it } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';

import {
  buildCustomerProductQuery,
  buildCustomerSummaryQuery,
  buildLandingPagePerformanceQuery,
  CUSTOMER_SUCCESSFUL_ORDER_STATUSES,
  getAiUsagePricing,
  estimateAdminAiModelCost,
  mapLiveAdminAiStats,
  resolveRawWebsiteFilters,
} from './stats-experience';

describe('experience stats SQL', () => {
  const filters = { startDate: '2026-04-22', endDate: '2026-07-20' };
  const dialect = new PgDialect();

  it('keeps landing-page filters qualified to the joined analytics table', () => {
    const query = dialect.sqlToQuery(buildLandingPagePerformanceQuery(filters));

    expect(query.sql).toContain('left join "analytics_events" on');
    expect(query.sql).toContain('"analytics_events"."occurred_at"');
    expect(query.sql).toContain('distinct on (landing_page_id, purchase_key)');
    expect(query.sql).toContain('coalesce(max(landing_purchase_totals.revenue), 0)');
    expect(query.sql).not.toContain('"analytics_events" event');
  });

  it('keeps customer filters qualified to the orders table', () => {
    const query = dialect.sqlToQuery(buildCustomerProductQuery(filters));

    expect(query.sql).toContain('from "orders"');
    expect(query.sql).toContain('"orders"."created_at"');
    expect(query.sql).not.toContain('from "orders" o');
  });

  it('derives customer order value from products and delivery when no override exists', () => {
    const query = dialect.sqlToQuery(buildCustomerSummaryQuery(filters));

    expect(query.sql).toContain(
      'coalesce("orders"."price"::double precision, cart.derived_subtotal, 0)',
    );
    expect(query.sql).toContain('+ coalesce("orders"."del_pr"::double precision, 0)');
    expect(query.sql).toContain('from unnest("orders"."cart_products") product_ref');
    expect(query.sql).toContain('or "products"."slug" = trim(product_ref)');
    expect(query.sql).toContain('coalesce(sum(orders) over(), 0)::int as successful_orders');
  });

  it('includes confirmed and later successful statuses while excluding negative outcomes', () => {
    const summaryQuery = dialect.sqlToQuery(buildCustomerSummaryQuery(filters));
    const productQuery = dialect.sqlToQuery(buildCustomerProductQuery(filters));

    expect(CUSTOMER_SUCCESSFUL_ORDER_STATUSES).toEqual([2, 3, 4, 5, 7, 10, 11]);
    for (const query of [summaryQuery, productQuery]) {
      expect(query.sql).toContain('"orders"."confirmed" in');
      expect(query.params).toEqual(expect.arrayContaining([...CUSTOMER_SUCCESSFUL_ORDER_STATUSES]));
      expect(query.params).not.toEqual(expect.arrayContaining([6, 8, 9]));
    }
  });
});

describe('experience stats raw-event window', () => {
  it('uses the latest seven reporting days for an open all-time range', () => {
    expect(
      resolveRawWebsiteFilters(
        { startDate: '', endDate: '' },
        new Date('2026-08-24T23:30:00.000Z'),
      ),
    ).toEqual({ startDate: '2026-08-19', endDate: '' });
  });

  it('does not widen an explicitly narrower range', () => {
    expect(
      resolveRawWebsiteFilters(
        { startDate: '2026-08-22', endDate: '2026-08-24' },
        new Date('2026-08-24T12:00:00.000Z'),
      ),
    ).toEqual({ startDate: '2026-08-22', endDate: '2026-08-24' });
  });
});

describe('experience stats AI pricing', () => {
  it('keeps estimated cost unavailable until both verified rates are configured', () => {
    expect(getAiUsagePricing('admin', {})).toBeNull();
    expect(
      getAiUsagePricing('admin', {
        AI_ADMIN_INPUT_COST_PER_1M_USD: '1.25',
      }),
    ).toBeNull();
    expect(
      getAiUsagePricing('storefront', {
        AI_STOREFRONT_INPUT_COST_PER_1M_USD: '',
        AI_STOREFRONT_OUTPUT_COST_PER_1M_USD: '',
      }),
    ).toBeNull();
  });

  it('accepts explicit non-negative per-million-token rates', () => {
    expect(
      getAiUsagePricing('storefront', {
        AI_STOREFRONT_INPUT_COST_PER_1M_USD: '0.15',
        AI_STOREFRONT_OUTPUT_COST_PER_1M_USD: '0.60',
      }),
    ).toEqual({ input: 0.15, output: 0.6 });
    expect(
      getAiUsagePricing('admin', {
        AI_ADMIN_INPUT_COST_PER_1M_USD: '-1',
        AI_ADMIN_OUTPUT_COST_PER_1M_USD: '2',
      }),
    ).toBeNull();
  });

  it('uses the selected model and provider rate for admin assistant cost estimates', () => {
    expect(
      estimateAdminAiModelCost(
        [
          {
            name: 'deepseek/deepseek-v4-flash',
            runs: 1,
            tokens: 1_000_000,
            inputTokens: 800_000,
            outputTokens: 200_000,
          },
          {
            name: 'deepseek/deepseek-v4-flash@baidu/fp8',
            runs: 1,
            tokens: 1_000_000,
            inputTokens: 500_000,
            outputTokens: 500_000,
          },
          {
            name: 'openai/gpt-5.6-luna',
            runs: 1,
            tokens: 1_000_000,
            inputTokens: 250_000,
            outputTokens: 750_000,
          },
        ],
        3,
        null,
      ),
    ).toEqual({
      estimatedCostUsd: 5.00545,
      costCoverageRate: 100,
    });
  });
});

describe('live admin AI stats', () => {
  it('maps current run telemetry independently from a stale reporting snapshot', () => {
    const stats = mapLiveAdminAiStats({
      summary: {
        runs: 5,
        completed: 4,
        failed: 0,
        cancelled: 1,
        helpful: 3,
        notHelpful: 1,
        inputTokens: 800,
        outputTokens: 200,
        totalTokens: 1_000,
        averageDurationMs: 1_250,
        activeUsers: 1,
      },
      tasks: [{ name: 'admin_chat', runs: 5, completed: 4, cancelled: 1, tokens: 1_000 }],
      models: [
        {
          name: 'deepseek/deepseek-v4-flash',
          runs: 5,
          tokens: 1_000,
          inputTokens: 800,
          outputTokens: 200,
        },
      ],
      trend: [{ bucket: '2026-07-20', runs: 4, completed: 4, failed: 0, tokens: 1_000 }],
      conversations: 2,
      toolCalls: 3,
      proposals: 1,
      appliedProposals: 1,
      estimatedCostUsd: 0.000108,
      costCoverageRate: 100,
    });

    expect(stats).toEqual(
      expect.objectContaining({
        runs: 5,
        completed: 4,
        cancelled: 1,
        successRate: 100,
        helpful: 3,
        notHelpful: 1,
        helpfulRate: 75,
        conversations: 2,
        totalTokens: 1_000,
        toolCalls: 3,
        proposals: 1,
        appliedProposals: 1,
      }),
    );
    expect(stats.models).toEqual([{ name: 'deepseek/deepseek-v4-flash', runs: 5, tokens: 1_000 }]);
  });
});
