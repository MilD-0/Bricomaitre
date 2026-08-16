import { describe, expect, it } from 'vitest';

import { semanticAnalyticsComparisonSchema, semanticAnalyticsQuerySchema } from './analytics';

describe('semantic analytics query contract', () => {
  it('accepts a bounded allowlisted sales query', () => {
    expect(
      semanticAnalyticsQuerySchema.parse({
        query: 'sales_summary',
        startDate: '2026-01-01',
        endDate: '2026-01-31',
      }),
    ).toMatchObject({ limit: 10, confirmedOnly: false });
  });

  it('rejects unknown query names and raw SQL-shaped fields', () => {
    expect(
      semanticAnalyticsQuerySchema.safeParse({ query: 'raw_sql', sql: 'select * from users' })
        .success,
    ).toBe(false);
  });

  it('rejects reversed, excessive, and unsupported date ranges', () => {
    expect(
      semanticAnalyticsQuerySchema.safeParse({
        query: 'sales_summary',
        startDate: '2026-02-01',
        endDate: '2026-01-01',
      }).success,
    ).toBe(false);
    expect(
      semanticAnalyticsQuerySchema.safeParse({
        query: 'sales_summary',
        startDate: '2024-01-01',
        endDate: '2026-01-01',
      }).success,
    ).toBe(false);
    expect(
      semanticAnalyticsQuerySchema.safeParse({ query: 'inventory_risk', startDate: '2026-01-01' })
        .success,
    ).toBe(false);
  });

  it('rejects filters that the selected semantic query cannot honor', () => {
    expect(
      semanticAnalyticsQuerySchema.safeParse({ query: 'sales_summary', productId: 12 }).success,
    ).toBe(false);
    expect(
      semanticAnalyticsQuerySchema.safeParse({ query: 'funnel_summary', confirmedOnly: true })
        .success,
    ).toBe(false);
  });

  it('only permits compatible bounded comparison periods', () => {
    expect(
      semanticAnalyticsComparisonSchema.parse({
        query: 'sales_summary',
        currentStartDate: '2026-02-01',
        currentEndDate: '2026-02-28',
        previousStartDate: '2026-01-01',
        previousEndDate: '2026-01-31',
      }).limit,
    ).toBe(10);
    expect(
      semanticAnalyticsComparisonSchema.safeParse({
        query: 'product_performance',
        currentStartDate: '2026-02-01',
        currentEndDate: '2026-02-28',
        previousStartDate: '2026-01-01',
        previousEndDate: '2026-01-31',
      }).success,
    ).toBe(false);
  });
});
