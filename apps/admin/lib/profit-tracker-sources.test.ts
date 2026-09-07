import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it, vi } from 'vitest';

import { getCanonicalOrderProjectionDays, upsertProfitTrackerDay } from './profit-tracker';
import { resolveProfitTrackerDaySources } from './profit-tracker/calculation';
import { stateAwareProjectedContribution } from './profit-tracker/calculation';
import { toCanonicalOrderProjectionDay } from './profit-tracker/projections';
import { applyProfitTrackerRollforward } from './profit-tracker-metrics';

const automatic = {
  date: '2026-08-15',
  postedOrders: 10,
  costCompleteOrders: 8,
  grossProfitDzd: 80_000,
  realizedGrossProfitDzd: 30_000,
  returnExposedGrossProfitDzd: 40_000,
  returnExposedOrders: 5,
};

describe('profit tracker source precedence', () => {
  it('updates only the manual fields supplied by the operator', async () => {
    const now = new Date('2026-08-15T12:00:00.000Z');
    const conflictInputs: Array<{ set: Record<string, unknown> }> = [];
    const onConflictDoUpdate = vi.fn((input: { set: Record<string, unknown> }) => {
      conflictInputs.push(input);
      return {
        returning: vi.fn(async () => [
          {
            day: '2026-08-15',
            spendEur: null,
            fbPurchases: null,
            cpm: null,
            ctr: null,
            linkClicks: null,
            landingPageViews: null,
            grossProfitDzd: '100000',
            returnRatePct: null,
            confirmedOrders: null,
            note: null,
            rawMetaJson: null,
            fxRateUsed: '280',
            metaSyncedAt: null,
            createdAt: now,
            updatedAt: now,
          },
        ]),
      };
    });
    const values = vi.fn(() => ({ onConflictDoUpdate }));
    const db = {
      query: { profitTrackerSettings: { findFirst: vi.fn(async () => undefined) } },
      insert: vi.fn(() => ({ values })),
    };

    await upsertProfitTrackerDay({ date: '2026-08-15', grossProfitDzd: 100_000 }, db as never);

    const update = conflictInputs[0]!.set;
    expect(update.grossProfitDzd).toBe('100000');
    expect(Object.keys(update).sort()).toEqual(['grossProfitDzd', 'updatedAt']);
  });

  it('applies manual fields independently over posted-order economics', () => {
    const day = resolveProfitTrackerDaySources({
      date: '2026-08-15',
      automatic,
      manual: {
        date: '2026-08-15',
        spendEur: 999,
        fbPurchases: 999,
        cpm: 999,
        ctr: 99,
        linkClicks: 999,
        landingPageViews: 999,
        grossProfitDzd: 100_000,
        returnRatePct: null,
        confirmedOrders: null,
        note: 'manual gross only',
        fxRateUsed: 275,
      },
      meta: {
        date: '2026-08-15',
        accountCurrency: 'EUR',
        spendEur: 50,
        impressions: 1_000,
        fbPurchases: 12,
        cpm: 50,
        ctr: 2,
        linkClicks: 20,
        landingPageViews: 15,
        metaSyncedAt: '2026-08-16T00:00:00.000Z',
      },
      settings: { fxRate: 280, defaultReturnRate: 10, restFrom: null },
    });

    expect(day.grossProfitDzd).toBe(100_000);
    expect(day.grossProfitSource).toBe('manual');
    expect(day.confirmedOrders).toBe(10);
    expect(day.confirmedOrdersSource).toBe('automatic');
    expect(day.returnRatePct).toBe(10);
    expect(day.returnRateSource).toBe('default');
    expect(day.spendEur).toBe(50);
    expect(day.projectedCoveragePct).toBe(80);
    expect(day.stateAdjustedProfitDzd).toBeUndefined();
  });

  it('uses manual return and confirmed values without replacing automatic gross profit', () => {
    const day = resolveProfitTrackerDaySources({
      date: '2026-08-15',
      automatic,
      manual: {
        date: '2026-08-15',
        spendEur: null,
        fbPurchases: null,
        cpm: null,
        ctr: null,
        linkClicks: null,
        landingPageViews: null,
        grossProfitDzd: null,
        returnRatePct: 20,
        confirmedOrders: 7,
        note: null,
        fxRateUsed: 280,
      },
      settings: { fxRate: 280, defaultReturnRate: 10, restFrom: null },
    });

    expect(day.grossProfitDzd).toBe(80_000);
    expect(day.grossProfitSource).toBe('automatic');
    expect(day.returnRatePct).toBe(20);
    expect(day.returnRateSource).toBe('manual');
    expect(day.confirmedOrders).toBe(7);
    expect(day.confirmedOrdersSource).toBe('manual');
    expect(day.stateAdjustedProfitDzd).toBe(62_000);
    expect(day.returnExposedOrders).toBe(5);
  });

  it('keeps realized contribution, removes known losses, and risks only unresolved orders', () => {
    expect(
      stateAwareProjectedContribution({
        realizedGrossProfitDzd: 30_000,
        returnExposedGrossProfitDzd: 40_000,
        planningReturnRatePct: 10,
      }),
    ).toBe(66_000);
  });

  it('treats exactly 100% as the operator profit-suppression mode', () => {
    expect(
      stateAwareProjectedContribution({
        realizedGrossProfitDzd: 30_000,
        returnExposedGrossProfitDzd: 40_000,
        planningReturnRatePct: 100,
      }),
    ).toBe(0);
  });
});

describe('canonical order projection adapter', () => {
  it('uses the analytics return, FX, ad-cost, and adjusted-profit semantics', () => {
    const [day] = applyProfitTrackerRollforward(
      [
        {
          date: '2026-08-15',
          spendEur: 100,
          fbPurchases: null,
          cpm: null,
          ctr: null,
          linkClicks: null,
          landingPageViews: null,
          grossProfitDzd: 100_000,
          returnRatePct: 10,
          confirmedOrders: 10,
          note: null,
          fxRateUsed: 280,
          postedOrders: 10,
        },
      ],
      { fxRate: 300, restFrom: null },
    );

    expect(
      toCanonicalOrderProjectionDay({
        basis: 'posted',
        reportDay: day.date,
        day,
        defaultReturnRate: 15,
      }),
    ).toEqual({
      basis: 'posted',
      reportDay: '2026-08-15',
      grossProfit: 100_000,
      adSpend: 28_000,
      estimatedReturnRate: 10,
      estimatedReturnedOrders: 1,
      estimatedReturnLoss: 10_000,
      projectedProfit: 62_000,
    });
  });

  it('does not haircut delivered or paid contribution in a mixed current-state cohort', () => {
    const [day] = applyProfitTrackerRollforward(
      [
        {
          date: '2026-08-15',
          spendEur: 100,
          fbPurchases: null,
          cpm: null,
          ctr: null,
          linkClicks: null,
          landingPageViews: null,
          grossProfitDzd: 100_000,
          returnRatePct: 10,
          confirmedOrders: 10,
          note: null,
          fxRateUsed: 280,
          postedOrders: 10,
          returnExposedOrders: 4,
          stateAdjustedProfitDzd: 76_000,
        },
      ],
      { fxRate: 280, restFrom: null },
    );

    expect(
      toCanonicalOrderProjectionDay({
        basis: 'posted',
        reportDay: day.date,
        day,
        defaultReturnRate: 10,
      }),
    ).toEqual({
      basis: 'posted',
      reportDay: '2026-08-15',
      grossProfit: 100_000,
      adSpend: 28_000,
      estimatedReturnRate: 10,
      estimatedReturnedOrders: 0.4,
      estimatedReturnLoss: 24_000,
      projectedProfit: 48_000,
    });
  });

  it('returns zero projected profit in operator suppression mode', () => {
    const [day] = applyProfitTrackerRollforward(
      [
        {
          date: '2026-08-15',
          spendEur: 100,
          fbPurchases: null,
          cpm: null,
          ctr: null,
          linkClicks: null,
          landingPageViews: null,
          grossProfitDzd: 100_000,
          returnRatePct: 100,
          confirmedOrders: 10,
          note: null,
          fxRateUsed: 280,
          postedOrders: 10,
          stateAdjustedProfitDzd: 100_000,
        },
      ],
      { fxRate: 280, restFrom: null },
    );
    expect(
      toCanonicalOrderProjectionDay({
        basis: 'posted',
        reportDay: day.date,
        day,
        defaultReturnRate: 100,
      }).projectedProfit,
    ).toBe(0);
  });

  it('does not turn missing economics into a false zero', () => {
    expect(
      toCanonicalOrderProjectionDay({
        basis: 'confirmed',
        reportDay: '2026-08-15',
        defaultReturnRate: 10,
      }),
    ).toEqual({
      basis: 'confirmed',
      reportDay: '2026-08-15',
      grossProfit: null,
      adSpend: null,
      estimatedReturnRate: 10,
      estimatedReturnedOrders: 0,
      estimatedReturnLoss: null,
      projectedProfit: null,
    });
  });

  it('does not report ad spend as a posted-order loss before any orders are posted', () => {
    const [day] = applyProfitTrackerRollforward(
      [
        {
          date: '2026-08-15',
          spendEur: 100,
          fbPurchases: null,
          cpm: null,
          ctr: null,
          linkClicks: null,
          landingPageViews: null,
          grossProfitDzd: null,
          returnRatePct: null,
          confirmedOrders: null,
          note: null,
          fxRateUsed: 280,
          postedOrders: 0,
        },
      ],
      { fxRate: 280, restFrom: null },
    );

    expect(
      toCanonicalOrderProjectionDay({
        basis: 'posted',
        reportDay: day.date,
        day,
        defaultReturnRate: 10,
      }),
    ).toEqual({
      basis: 'posted',
      reportDay: '2026-08-15',
      grossProfit: null,
      adSpend: 28_000,
      estimatedReturnRate: 10,
      estimatedReturnedOrders: 0,
      estimatedReturnLoss: null,
      projectedProfit: null,
    });
  });

  it('uses first-confirmed orders while retaining the canonical planning calculator', async () => {
    const dialect = new PgDialect();
    const execute = vi.fn(async (query) => {
      const built = dialect.sqlToQuery(query);
      expect(built.params).toContain(2);
      expect(built.params).toContain('2026-08-08');
      expect(built.params).toContain('2026-08-15');
      return {
        rows: [
          {
            date: '2026-08-15',
            cohort_orders: 10,
            cost_complete_orders: 10,
            gross_profit_dzd: 100_000,
            realized_gross_profit_dzd: 0,
            return_exposed_gross_profit_dzd: 100_000,
            return_exposed_orders: 10,
          },
        ],
      };
    });
    const selection = {
      from: vi.fn(() => selection),
      where: vi.fn(() => selection),
      groupBy: vi.fn(() => selection),
      orderBy: vi.fn(async () => []),
    };
    const db = {
      execute,
      select: vi.fn(() => selection),
      query: { profitTrackerSettings: { findFirst: vi.fn(async () => undefined) } },
    };

    const projections = await getCanonicalOrderProjectionDays(
      { startDate: '2026-08-15', endDate: '2026-08-15', basis: 'confirmed' },
      { db: db as never },
    );

    expect(projections).toEqual([
      {
        basis: 'confirmed',
        reportDay: '2026-08-15',
        grossProfit: 100_000,
        adSpend: null,
        estimatedReturnRate: 10,
        estimatedReturnedOrders: 1,
        estimatedReturnLoss: 10_000,
        projectedProfit: null,
      },
    ]);
  });
});
