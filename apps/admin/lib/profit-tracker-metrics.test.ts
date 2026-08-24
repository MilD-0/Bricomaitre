import { describe, expect, it } from 'vitest';

import {
  applyProfitTrackerRollforward,
  buildProfitTrackerWeeks,
  computeProfitTrackerMetrics,
  operatingCostBetween,
  operatingCostForDay,
  summarizeProfitTracker,
  type ProfitTrackerDayInput,
  type ProfitTrackerOperatingCost,
} from './profit-tracker-metrics';

const baseDay: ProfitTrackerDayInput = {
  date: '2026-08-15',
  spendEur: 100,
  fbPurchases: 20,
  cpm: 5,
  ctr: 2,
  linkClicks: 500,
  landingPageViews: 400,
  grossProfitDzd: 100_000,
  returnRatePct: 10,
  confirmedOrders: 15,
  note: null,
  fxRateUsed: 280,
};

describe('profit tracker economics contract', () => {
  it('preserves the calculator adjusted-profit and profit-multiple formula', () => {
    expect(computeProfitTrackerMetrics(baseDay, 300)).toEqual({
      adCostDzd: 28_000,
      adjustedProfitDzd: 90_000,
      netProfitDzd: 62_000,
      profitX: 90_000 / 28_000,
      netProfitBeforeReturnsDzd: 72_000,
      profitXBeforeReturns: 100_000 / 28_000,
      costPerConfirmedDzd: 28_000 / 15,
      confirmationRatePct: 75,
      clickToPageRatePct: 80,
    });
  });

  it('uses the snapshotted daily FX instead of repricing history with the current setting', () => {
    expect(computeProfitTrackerMetrics(baseDay, 350).adCostDzd).toBe(28_000);
  });

  it('returns no ratios when ad cost is zero', () => {
    const metrics = computeProfitTrackerMetrics({ ...baseDay, spendEur: 0 }, 280);
    expect(metrics.profitX).toBeNull();
    expect(metrics.profitXBeforeReturns).toBeNull();
    expect(metrics.costPerConfirmedDzd).toBe(0);
  });

  it('uses 100% as a global profit-suppression mode without hiding costs or activity', () => {
    expect(
      computeProfitTrackerMetrics(
        {
          ...baseDay,
          returnRatePct: 100,
          stateAdjustedProfitDzd: 80_000,
        },
        280,
      ),
    ).toEqual({
      adCostDzd: 28_000,
      adjustedProfitDzd: 0,
      netProfitDzd: 0,
      profitX: 0,
      netProfitBeforeReturnsDzd: 0,
      profitXBeforeReturns: 0,
      costPerConfirmedDzd: 28_000 / 15,
      confirmationRatePct: 75,
      clickToPageRatePct: 80,
    });
  });

  it('rolls a data-empty Friday into Saturday using Friday FX', () => {
    const days = applyProfitTrackerRollforward(
      [
        {
          ...baseDay,
          date: '2026-08-14',
          spendEur: 100,
          grossProfitDzd: null,
          returnRatePct: null,
          confirmedOrders: null,
          fxRateUsed: 270,
        },
        { ...baseDay, date: '2026-08-15', spendEur: 50, fxRateUsed: 280 },
      ],
      { fxRate: 350, restFrom: '2026-08-01' },
    );

    const saturday = days[0];
    const friday = days[1];
    expect(friday.isRestDay).toBe(true);
    expect(friday.rolledOutDzd).toBe(27_000);
    expect(friday.metrics.adCostDzd).toBe(0);
    expect(saturday.rolledInDzd).toBe(27_000);
    expect(saturday.metrics.adCostDzd).toBe(41_000);
    expect(saturday.metrics.profitX).toBe(90_000 / 41_000);
  });

  it('does not classify Friday as rest when website economics were entered', () => {
    const [friday] = applyProfitTrackerRollforward([{ ...baseDay, date: '2026-08-14' }], {
      fxRate: 280,
      restFrom: '2026-08-01',
    });
    expect(friday.isRestDay).toBe(false);
    expect(friday.metrics.adCostDzd).toBe(28_000);
  });

  it('leaves a trailing Friday carry unresolved until a later working day exists', () => {
    const [friday] = applyProfitTrackerRollforward(
      [
        {
          ...baseDay,
          date: '2026-08-14',
          grossProfitDzd: null,
          returnRatePct: null,
          confirmedOrders: null,
        },
      ],
      { fxRate: 280, restFrom: '2026-08-01' },
    );
    expect(friday.isRestDay).toBe(true);
    expect(friday.rolledOutDzd).toBe(28_000);
    expect(friday.rolledInDzd).toBe(0);
  });
});

describe('profit tracker operating costs and rollups', () => {
  const costs: ProfitTrackerOperatingCost[] = [
    {
      name: 'Rent',
      amountDzd: 31_000,
      period: 'monthly',
      startDate: '2026-08-01',
      endDate: null,
    },
    {
      name: 'Equipment',
      amountDzd: 5_000,
      period: 'once',
      startDate: '2026-08-15',
      endDate: null,
    },
  ];

  it('allocates monthly costs across calendar days and one-time costs once', () => {
    expect(operatingCostForDay('2026-08-14', costs)).toBe(1_000);
    expect(operatingCostForDay('2026-08-15', costs)).toBe(6_000);
    expect(operatingCostBetween('2026-08-14', '2026-08-15', costs)).toBe(7_000);
  });

  it('summarizes true profit without changing the protected profit multiple', () => {
    const days = applyProfitTrackerRollforward([baseDay], {
      fxRate: 280,
      restFrom: null,
    });
    const summary = summarizeProfitTracker(days, costs, '2026-08-15', '2026-08-15');
    expect(summary.profitX).toBe(90_000 / 28_000);
    expect(summary.netProfitDzd).toBe(62_000);
    expect(summary.operatingCostDzd).toBe(6_000);
    expect(summary.trueProfitDzd).toBe(56_000);
  });

  it('keeps activity and cost facts while suppressing every rolled-up profit at 100%', () => {
    const days = applyProfitTrackerRollforward([{ ...baseDay, returnRatePct: 100 }], {
      fxRate: 280,
      restFrom: null,
    });
    const summary = summarizeProfitTracker(days, costs, '2026-08-15', '2026-08-15', true);
    const [week] = buildProfitTrackerWeeks(days, costs, '2026-08-15', true);

    expect(summary).toMatchObject({
      grossProfitDzd: 100_000,
      ratioAdCostDzd: 28_000,
      operatingCostDzd: 6_000,
      adjustedProfitDzd: 0,
      netProfitDzd: 0,
      trueProfitDzd: 0,
      profitX: 0,
      profitXBeforeReturns: 0,
    });
    expect(week).toMatchObject({
      adCostDzd: 28_000,
      operatingCostDzd: 7_000,
      adjustedProfitDzd: 0,
      netProfitDzd: 0,
      trueProfitDzd: 0,
      profitX: 0,
    });
  });

  it('keeps spend-only days in period ad cost, net profit, and Profit ×', () => {
    const days = applyProfitTrackerRollforward(
      [
        {
          ...baseDay,
          date: '2026-08-13',
          grossProfitDzd: null,
          returnRatePct: null,
          confirmedOrders: null,
        },
        { ...baseDay, date: '2026-08-15' },
      ],
      { fxRate: 280, restFrom: null },
    );
    const summary = summarizeProfitTracker(days, [], '2026-08-13', '2026-08-15');

    expect(summary.ratioAdCostDzd).toBe(56_000);
    expect(summary.adjustedProfitDzd).toBe(90_000);
    expect(summary.netProfitDzd).toBe(34_000);
    expect(summary.trueProfitDzd).toBe(34_000);
    expect(summary.profitX).toBe(90_000 / 56_000);
  });

  it('reports incomplete purchase-cost coverage without pricing from the current catalog', () => {
    const days = applyProfitTrackerRollforward(
      [{ ...baseDay, postedOrders: 10, costCompleteOrders: 8 }],
      { fxRate: 280, restFrom: null },
    );
    const summary = summarizeProfitTracker(days, [], '2026-08-15', '2026-08-15');
    expect(summary.postedOrders).toBe(10);
    expect(summary.costCompleteOrders).toBe(8);
    expect(summary.projectedCoveragePct).toBe(80);
  });

  it('starts reporting weeks on Friday so Friday spend and Saturday economics stay together', () => {
    const days = applyProfitTrackerRollforward(
      [
        {
          ...baseDay,
          date: '2026-08-14',
          grossProfitDzd: null,
          returnRatePct: null,
          confirmedOrders: null,
        },
        { ...baseDay, date: '2026-08-15' },
      ],
      { fxRate: 280, restFrom: '2026-08-01' },
    );
    const [week] = buildProfitTrackerWeeks(days, []);
    expect(week.weekStart).toBe('2026-08-14');
    expect(week.spendEur).toBe(200);
    expect(week.adCostDzd).toBe(56_000);
    expect(week.adjustedProfitDzd).toBe(90_000);
    expect(week.profitX).toBe(90_000 / 56_000);
  });

  it('does not charge future operating costs into an in-progress week', () => {
    const days = applyProfitTrackerRollforward([{ ...baseDay, date: '2026-08-15' }], {
      fxRate: 280,
      restFrom: null,
    });
    const [week] = buildProfitTrackerWeeks(days, costs, '2026-08-15');

    expect(week.weekStart).toBe('2026-08-14');
    expect(week.operatingCostDzd).toBe(7_000);
  });
});
