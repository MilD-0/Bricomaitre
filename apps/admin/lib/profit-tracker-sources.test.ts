import { describe, expect, it } from 'vitest';

import { resolveProfitTrackerDaySources } from './profit-tracker';

const automatic = {
  date: '2026-08-15',
  postedOrders: 10,
  costCompleteOrders: 8,
  grossProfitDzd: 80_000,
};

describe('profit tracker source precedence', () => {
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
  });
});
