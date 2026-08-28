import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Analytics2Payload } from './analytics2';

const { dbExecuteMock, getAnalytics2DataMock } = vi.hoisted(() => ({
  dbExecuteMock: vi.fn(),
  getAnalytics2DataMock: vi.fn(),
}));

vi.mock('@bric/db/client', () => ({
  getDb: () => ({ execute: dbExecuteMock }),
}));

vi.mock('./analytics2', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./analytics2')>()),
  getAnalytics2Data: getAnalytics2DataMock,
}));

import { queryAdminAnalytics } from './ai-analytics';

function payload(view: 'storefront' | 'money'): Analytics2Payload {
  return {
    view,
    filters: {
      view,
      range: '30d',
      startDate: '2026-07-25',
      endDate: '2026-08-23',
      grain: 'day',
      resolvedGrain: 'day',
      comparisonStartDate: '2026-06-25',
      comparisonEndDate: '2026-07-24',
    },
    generatedAt: '2026-08-23T12:00:00.000Z',
    referenceDate: '2026-08-23',
    reviewClock: false,
    data: { kind: view, metrics: [] } as never,
    effectiveRanges: [],
    sources: [],
    warnings: [],
    diagnostics: { queryDurationMs: 20, responseSizeBytes: 100 },
  };
}

describe('admin assistant analytics query execution', () => {
  beforeEach(() => {
    dbExecuteMock.mockReset();
    getAnalytics2DataMock.mockReset();
  });

  it('loads the Storefront deferred detail surface for assistant questions', async () => {
    getAnalytics2DataMock.mockResolvedValue(payload('storefront'));

    await queryAdminAnalytics({
      view: 'storefront',
      date: { kind: 'rolling', period: '30d' },
      grain: 'day',
    });

    expect(getAnalytics2DataMock).toHaveBeenCalledWith(
      expect.objectContaining({ view: 'storefront', range: '30d', grain: 'day' }),
      { includeStorefrontDetails: true },
    );
  });

  it('does not pay the Storefront detail cost for another workspace', async () => {
    getAnalytics2DataMock.mockResolvedValue(payload('money'));

    await queryAdminAnalytics({
      view: 'money',
      date: { kind: 'rolling', period: '30d' },
      grain: 'day',
    });

    expect(getAnalytics2DataMock).toHaveBeenCalledWith(expect.objectContaining({ view: 'money' }), {
      includeStorefrontDetails: false,
    });
    expect(dbExecuteMock).not.toHaveBeenCalled();
  });

  it('maps explicit assistant date scopes to canonical Analytics ranges', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-28T12:00:00.000Z'));
    getAnalytics2DataMock.mockResolvedValue(payload('money'));

    await queryAdminAnalytics({ view: 'money', date: { kind: 'day', date: '2026-08-10' } });
    await queryAdminAnalytics({
      view: 'money',
      date: { kind: 'range', from: '2026-08-10', to: '2026-08-17' },
    });
    await queryAdminAnalytics({ view: 'money', date: { kind: 'since', date: '2026-08-10' } });
    await queryAdminAnalytics({ view: 'money', date: { kind: 'through', date: '2026-08-25' } });

    expect(getAnalytics2DataMock.mock.calls.map(([query]) => query)).toEqual([
      expect.objectContaining({
        view: 'money',
        range: 'custom',
        startDate: '2026-08-10',
        endDate: '2026-08-10',
      }),
      expect.objectContaining({
        view: 'money',
        range: 'custom',
        startDate: '2026-08-10',
        endDate: '2026-08-17',
      }),
      expect.objectContaining({
        view: 'money',
        range: 'custom',
        startDate: '2026-08-10',
        endDate: '2026-08-28',
      }),
      expect.objectContaining({ view: 'money', range: 'all', endDate: '2026-08-25' }),
    ]);
    vi.useRealTimers();
  });

  it('adds an exact EcoTrack coverage drilldown only when the model asks for that evidence facet', async () => {
    getAnalytics2DataMock.mockResolvedValue(payload('money'));
    dbExecuteMock.mockResolvedValue({
      rows: [
        {
          eligible_records: 125,
          covered_records: 112,
          missing_records: 13,
          earliest_eligible_posted_date: '2026-07-25',
          latest_eligible_posted_date: '2026-08-20',
          gap_reasons: { no_canonical_state: 10, tracking_without_canonical_state: 3 },
          missing_orders: [
            {
              orderId: 91,
              firstPostedAt: '2026-08-20T10:00:00.000Z',
              currentLocalStatus: 6,
              localReference: null,
              localTrackingNumber: null,
              gapReason: 'no_canonical_state',
            },
          ],
        },
      ],
    });

    const result = await queryAdminAnalytics({
      view: 'money',
      date: { kind: 'rolling', period: '30d' },
      grain: 'day',
      sourceCoverage: { source: 'ecotrack', limit: 1 },
    });

    expect(dbExecuteMock).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      sourceCoverage: {
        source: 'ecotrack',
        eligibleRecords: 125,
        coveredRecords: 112,
        missingRecords: 13,
        coveragePct: 89.6,
        observedEligibleRange: { startDate: '2026-07-25', endDate: '2026-08-20' },
        gapReasons: expect.arrayContaining([
          { reason: 'no_canonical_state', count: 10 },
          { reason: 'tracking_without_canonical_state', count: 3 },
        ]),
        missingOrders: [
          {
            orderId: 91,
            firstPostedAt: '2026-08-20T10:00:00.000Z',
            currentLocalStatus: 6,
            eligibilityReason: expect.stringContaining('historical transition'),
            gapReason: 'no_canonical_state',
          },
        ],
        truncated: true,
      },
    });
  });
});
