import { describe, expect, it, vi } from 'vitest';

import {
  adminAiAnalyticsSettingsPatchSchema,
  adminAiAnalyticsSyncSchema,
  manageAdminAiAnalyticsCosts,
  manageAdminAiAnalyticsDayOverrides,
  syncAdminAiAnalyticsSource,
  updateAdminAiAnalyticsSettings,
} from './admin-ai-analytics-actions';

describe('admin AI analytics actions', () => {
  it('changes only the assistant-controlled planning return rate and refreshes facts', async () => {
    const updateSettings = vi.fn(async (input) => ({ ...input }));
    const refreshFacts = vi.fn(async () => undefined);

    const result = await updateAdminAiAnalyticsSettings(
      { planningReturnRate: 24 },
      {
        getSettings: vi.fn(async () => ({ fxRate: 280, defaultReturnRate: 18, restFrom: null })),
        updateSettings,
        refreshFacts,
      },
    );

    expect(updateSettings).toHaveBeenCalledWith({
      fxRate: 280,
      defaultReturnRate: 24,
      restFrom: null,
    });
    expect(result).toEqual({
      kind: 'analytics_settings',
      previous: { planningReturnRate: 18 },
      current: { planningReturnRate: 24 },
      changedFields: ['planningReturnRate'],
    });
    expect(refreshFacts).toHaveBeenCalledOnce();
  });

  it('rejects operator-controlled Analytics settings', () => {
    expect(() =>
      adminAiAnalyticsSettingsPatchSchema.parse({ planningReturnRate: 24, fxRate: 1 }),
    ).toThrow();
    expect(() =>
      adminAiAnalyticsSettingsPatchSchema.parse({
        planningReturnRate: 24,
        fridayRestFrom: null,
      }),
    ).toThrow();
  });

  it('merges cost edits with canonical records and reports partial batch outcomes', async () => {
    const updateCost = vi.fn(async (id, input) => ({ id, ...input }));
    const createCost = vi.fn(async (input) => ({ id: 8, ...input }));
    const deleteCost = vi.fn(async (id) => id);
    const refreshFacts = vi.fn(async () => undefined);

    const result = await manageAdminAiAnalyticsCosts(
      {
        operations: [
          { action: 'update', id: 7, changes: { amountDzd: 42_000 } },
          { action: 'delete', id: 99 },
          {
            action: 'create',
            name: 'Warehouse',
            amountDzd: 30_000,
            period: 'monthly',
            startDate: '2026-08-01',
            endDate: null,
          },
        ],
      },
      {
        listCosts: vi.fn(async () => [
          {
            id: 7,
            name: 'Hosting',
            amountDzd: 20_000,
            period: 'monthly' as const,
            startDate: '2026-01-01',
            endDate: '2026-12-31',
          },
        ]),
        createCost,
        updateCost,
        deleteCost,
        refreshFacts,
      },
    );

    expect(updateCost).toHaveBeenCalledWith(7, {
      name: 'Hosting',
      amountDzd: 42_000,
      period: 'monthly',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
    });
    expect(deleteCost).not.toHaveBeenCalled();
    expect(createCost).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      requestedCount: 3,
      changedCount: 2,
      results: [
        { status: 'updated' },
        { id: 99, status: 'not_found' },
        { status: 'created', current: { id: 8 } },
      ],
    });
    expect(refreshFacts).toHaveBeenCalledOnce();
  });

  it('writes only named daily overrides and reports missing resets', async () => {
    const upsertDay = vi.fn(async (input) => ({ ...input, source: 'manual' }));
    const refreshFacts = vi.fn(async () => undefined);

    const result = await manageAdminAiAnalyticsDayOverrides(
      {
        operations: [
          {
            action: 'upsert',
            date: '2026-08-21',
            changes: { planningReturnRate: 21, note: 'Supplier closure' },
          },
          { action: 'reset', date: '2026-08-22' },
        ],
      },
      {
        upsertDay,
        deleteDay: vi.fn(async () => null),
        refreshFacts,
      },
    );

    expect(upsertDay).toHaveBeenCalledWith({
      date: '2026-08-21',
      returnRatePct: 21,
      note: 'Supplier closure',
    });
    expect(result).toMatchObject({
      changedCount: 1,
      results: [{ status: 'saved' }, { date: '2026-08-22', status: 'not_found' }],
    });
    expect(refreshFacts).toHaveBeenCalledOnce();
  });

  it('uses exact source ranges and enforces Meta’s existing 90-day cap', async () => {
    expect(
      adminAiAnalyticsSyncSchema.safeParse({
        source: 'meta',
        since: '2026-01-01',
        until: '2026-04-15',
      }).success,
    ).toBe(false);
    const syncMeta = vi.fn(async () => ({ rows: 31 }));
    const syncSearch = vi.fn(async () => ({ rows: 19 }));

    const result = await syncAdminAiAnalyticsSource(
      { source: 'meta', since: '2026-08-01', until: '2026-08-23' },
      { syncMeta, syncSearch },
    );

    expect(syncMeta).toHaveBeenCalledWith({
      since: '2026-08-01',
      until: '2026-08-23',
      lookbackDays: 23,
      trigger: 'manual-profit-tracker',
    });
    expect(result).toMatchObject({ source: 'meta', result: { rows: 31 } });

    const searchResult = await syncAdminAiAnalyticsSource(
      { source: 'searchConsole', since: '2026-08-05', until: '2026-08-20' },
      { syncMeta, syncSearch },
    );
    expect(syncSearch).toHaveBeenCalledWith({
      since: '2026-08-05',
      until: '2026-08-20',
      trigger: 'stats',
      inspectionLimit: 10,
    });
    expect(searchResult).toMatchObject({
      source: 'searchConsole',
      result: { rows: 19 },
    });
  });
});
