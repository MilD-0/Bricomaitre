import { describe, expect, it, vi } from 'vitest';

const { refreshAnalyticsFactsMock, syncProfitTrackerMetaRowsMock } = vi.hoisted(() => ({
  refreshAnalyticsFactsMock: vi.fn().mockResolvedValue({ dailyFacts: 0 }),
  syncProfitTrackerMetaRowsMock: vi.fn().mockResolvedValue([]),
}));

vi.mock('./profit-tracker', () => ({
  syncProfitTrackerMetaRows: syncProfitTrackerMetaRowsMock,
}));

vi.mock('./analytics-facts', () => ({
  refreshAnalyticsFacts: refreshAnalyticsFactsMock,
}));

function emptyMetaPage() {
  return new Response(JSON.stringify({ data: [] }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

import {
  fetchMetaAdsInsightRows,
  mapMetaAdsInsightRow,
  MetaAdsSyncError,
  readMetaAdsConfig,
  syncMetaAdsInsights,
} from './meta-ads-insights';

describe('Meta Ads Insights ingestion', () => {
  it('requires a dedicated token and numeric ad account', () => {
    expect(() => readMetaAdsConfig({})).toThrowError(MetaAdsSyncError);
    expect(
      readMetaAdsConfig({
        META_ADS_ACCESS_TOKEN: 'token',
        META_AD_ACCOUNT_ID: 'act_123456789',
        META_ADS_GRAPH_API_VERSION: 'invalid',
      }),
    ).toEqual({ accessToken: 'token', accountId: '123456789', apiVersion: 'v25.0' });
  });

  it('uses one prioritized purchase action instead of double-counting overlapping Meta totals', () => {
    const mapped = mapMetaAdsInsightRow(
      {
        date_start: '2026-08-16',
        account_id: '123456789',
        campaign_id: 'campaign-1',
        adset_id: 'adset-1',
        ad_id: 'ad-1',
        attribution_setting: '7d_click,1d_view',
        spend: '12.50',
        impressions: '1000',
        actions: [
          { action_type: 'offsite_conversion.fb_pixel_purchase', value: '3' },
          { action_type: 'omni_purchase', value: '4' },
          { action_type: 'landing_page_view', value: '80' },
        ],
        outbound_clicks: [{ action_type: 'outbound_click', value: '64' }],
        unique_outbound_clicks: [{ action_type: 'outbound_click', value: '58' }],
        video_play_actions: [{ action_type: 'video_view', value: '500' }],
        video_p25_watched_actions: [{ action_type: 'video_view', value: '320' }],
        video_p100_watched_actions: [{ action_type: 'video_view', value: '90' }],
        video_avg_time_watched_actions: [{ action_type: 'video_view', value: '7.25' }],
        quality_ranking: 'ABOVE_AVERAGE_10',
        engagement_rate_ranking: 'UNKNOWN',
        action_values: [
          { action_type: 'offsite_conversion.fb_pixel_purchase', value: '15000' },
          { action_type: 'omni_purchase', value: '20000' },
        ],
      },
      { currency: 'EUR', timezone: 'Africa/Algiers' },
      new Date('2026-08-17T00:00:00.000Z'),
    );

    expect(mapped).toMatchObject({
      purchases: '3.0000',
      purchaseValue: '15000.00',
      landingPageViews: '80.0000',
      outboundClicks: '64.0000',
      uniqueOutboundClicks: '58.0000',
      videoPlays: '500.0000',
      videoP25Watched: '320.0000',
      videoP100Watched: '90.0000',
      videoAverageWatchSeconds: '7.2500',
      qualityRanking: 'ABOVE_AVERAGE_10',
      engagementRateRanking: null,
      attributionWindows: ['7d_click', '1d_view'],
      accountCurrency: 'EUR',
    });
  });

  it('fetches every cursor page with bearer auth and account-timezone dates', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ id: 'act_123456789', currency: 'EUR', timezone_name: 'Africa/Algiers' }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [
              {
                date_start: '2026-08-16',
                account_id: '123456789',
                campaign_id: 'campaign-1',
                adset_id: 'adset-1',
                ad_id: 'ad-1',
                spend: '4.50',
              },
            ],
            paging: { next: 'https://graph.facebook.com/v25.0/page-2?after=cursor' },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockImplementation(() => Promise.resolve(emptyMetaPage()));

    const loaded = await fetchMetaAdsInsightRows({
      config: readMetaAdsConfig({
        META_ADS_ACCESS_TOKEN: 'dedicated-token',
        META_AD_ACCOUNT_ID: '123456789',
      }),
      fetchImpl: fetchMock,
      now: new Date('2026-08-17T00:00:00.000Z'),
      lookbackDays: 2,
    });

    expect(loaded).toMatchObject({
      since: '2026-08-16',
      until: '2026-08-17',
      pagesFetched: 6,
      account: { id: '123456789', currency: 'EUR', timezone: 'Africa/Algiers' },
    });
    expect(loaded.rows).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(7);
    for (const [url, init] of fetchMock.mock.calls) {
      expect(String(url)).not.toContain('dedicated-token');
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer dedicated-token');
    }
    const insightFields = new URL(String(fetchMock.mock.calls[1]?.[0])).searchParams.get('fields');
    expect(insightFields).toContain('outbound_clicks');
    expect(insightFields).toContain('video_p100_watched_actions');
    expect(insightFields).toContain('quality_ranking');
  });

  it('chunks long ad-level ranges so Meta can serve a 90-day synchronization', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ id: 'act_123456789', currency: 'EUR', timezone_name: 'Africa/Algiers' }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
      .mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ data: [] }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        ),
      );

    const loaded = await fetchMetaAdsInsightRows({
      config: readMetaAdsConfig({
        META_ADS_ACCESS_TOKEN: 'dedicated-token',
        META_AD_ACCOUNT_ID: '123456789',
      }),
      fetchImpl: fetchMock,
      now: new Date('2026-08-19T00:00:00.000Z'),
      since: '2026-05-22',
      until: '2026-08-19',
      lookbackDays: 90,
    });

    expect(loaded).toMatchObject({
      since: '2026-05-22',
      until: '2026-08-19',
      pagesFetched: 11,
    });
    const ranges = fetchMock.mock.calls
      .slice(1, 4)
      .map(([url]) => JSON.parse(new URL(String(url)).searchParams.get('time_range') ?? '{}'));
    expect(ranges).toEqual([
      { since: '2026-05-22', until: '2026-06-20' },
      { since: '2026-06-21', until: '2026-07-20' },
      { since: '2026-07-21', until: '2026-08-19' },
    ]);
  });

  it('retries a transient Meta response without changing the requested range', async () => {
    const wait = vi.fn().mockResolvedValue(undefined);
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { code: 2, message: 'busy' } }), {
          status: 503,
          headers: { 'content-type': 'application/json', 'retry-after': '1' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ id: 'act_123456789', currency: 'EUR', timezone_name: 'Africa/Algiers' }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockImplementation(() => Promise.resolve(emptyMetaPage()));

    await expect(
      fetchMetaAdsInsightRows({
        config: readMetaAdsConfig({
          META_ADS_ACCESS_TOKEN: 'token',
          META_AD_ACCOUNT_ID: '123456789',
        }),
        fetchImpl: fetchMock,
        now: new Date('2026-08-17T00:00:00.000Z'),
        lookbackDays: 1,
        wait,
      }),
    ).resolves.toMatchObject({ pagesFetched: 5, rows: [], breakdownRows: [] });
    expect(wait).toHaveBeenCalledWith(1_000);
  });

  it('retries an empty successful response before accepting provider data', async () => {
    const wait = vi.fn().mockResolvedValue(undefined);
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('', { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ id: 'act_123456789', currency: 'EUR', timezone_name: 'Africa/Algiers' }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
      .mockImplementation(() => Promise.resolve(emptyMetaPage()));

    await expect(
      fetchMetaAdsInsightRows({
        config: readMetaAdsConfig({
          META_ADS_ACCESS_TOKEN: 'token',
          META_AD_ACCOUNT_ID: '123456789',
        }),
        fetchImpl: fetchMock,
        now: new Date('2026-08-17T00:00:00.000Z'),
        lookbackDays: 1,
        wait,
      }),
    ).resolves.toMatchObject({ pagesFetched: 5, rows: [], breakdownRows: [] });
    expect(wait).toHaveBeenCalledWith(500);
  });

  it('reports repeated malformed success payloads as a stable provider error', async () => {
    const wait = vi.fn().mockResolvedValue(undefined);
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 200 }));

    await expect(
      fetchMetaAdsInsightRows({
        config: readMetaAdsConfig({
          META_ADS_ACCESS_TOKEN: 'token',
          META_AD_ACCOUNT_ID: '123456789',
        }),
        fetchImpl: fetchMock,
        now: new Date('2026-08-17T00:00:00.000Z'),
        lookbackDays: 1,
        wait,
      }),
    ).rejects.toMatchObject({ code: 'meta_ads_invalid_response', status: 200 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(wait).toHaveBeenCalledTimes(2);
  });

  it('rejects impossible calendar dates before requesting Insights', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ id: 'act_123456789', currency: 'EUR', timezone_name: 'Africa/Algiers' }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );

    await expect(
      fetchMetaAdsInsightRows({
        config: readMetaAdsConfig({
          META_ADS_ACCESS_TOKEN: 'token',
          META_AD_ACCOUNT_ID: '123456789',
        }),
        fetchImpl: fetchMock,
        now: new Date('2026-08-17T00:00:00.000Z'),
        since: '2026-02-31',
        lookbackDays: 1,
      }),
    ).rejects.toMatchObject({ code: 'invalid_date_range' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('atomically replaces a fetched range even when Meta now returns no rows', async () => {
    const runReturning = vi.fn().mockResolvedValue([{ id: 42 }]);
    const deleteWhere = vi.fn().mockResolvedValue(undefined);
    const updateWhere = vi.fn().mockResolvedValue(undefined);
    const transaction = vi.fn(async (callback: (tx: unknown) => Promise<void>) =>
      callback({
        delete: vi.fn(() => ({ where: deleteWhere })),
        insert: vi.fn(() => ({ values: vi.fn() })),
      }),
    );
    const db = {
      insert: vi.fn(() => ({ values: vi.fn(() => ({ returning: runReturning })) })),
      transaction,
      update: vi.fn(() => ({ set: vi.fn(() => ({ where: updateWhere })) })),
    };
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ id: 'act_123456789', currency: 'EUR', timezone_name: 'Africa/Algiers' }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockImplementation(() => Promise.resolve(emptyMetaPage()));

    await expect(
      syncMetaAdsInsights({
        db: db as never,
        env: { META_ADS_ACCESS_TOKEN: 'token', META_AD_ACCOUNT_ID: '123456789' },
        fetchImpl: fetchMock,
        now: new Date('2026-08-17T00:00:00.000Z'),
        lookbackDays: 2,
      }),
    ).resolves.toMatchObject({ rows: 0, since: '2026-08-16', until: '2026-08-17' });

    expect(transaction).toHaveBeenCalledOnce();
    expect(deleteWhere).toHaveBeenCalledTimes(3);
    expect(syncProfitTrackerMetaRowsMock).toHaveBeenCalledWith([], db, {
      since: '2026-08-16',
      until: '2026-08-17',
      accountCurrency: 'EUR',
      syncedAt: new Date('2026-08-17T00:00:00.000Z'),
    });
    expect(updateWhere).toHaveBeenCalledOnce();
    expect(refreshAnalyticsFactsMock).toHaveBeenCalledWith({
      db,
      now: new Date('2026-08-17T00:00:00.000Z'),
    });
  });

  it('persists large breakdown results in bounded database batches', async () => {
    const runReturning = vi.fn().mockResolvedValue([{ id: 42 }]);
    const deleteWhere = vi.fn().mockResolvedValue(undefined);
    const insertValues = vi.fn().mockResolvedValue(undefined);
    const insert = vi.fn(() => ({ values: insertValues }));
    const updateWhere = vi.fn().mockResolvedValue(undefined);
    const transaction = vi.fn(async (callback: (tx: unknown) => Promise<void>) =>
      callback({
        delete: vi.fn(() => ({ where: deleteWhere })),
        insert,
      }),
    );
    const db = {
      insert: vi.fn(() => ({ values: vi.fn(() => ({ returning: runReturning })) })),
      transaction,
      update: vi.fn(() => ({ set: vi.fn(() => ({ where: updateWhere })) })),
    };
    const breakdownRows = Array.from({ length: 600 }, (_, index) => ({
      date_start: '2026-08-17',
      account_id: '123456789',
      campaign_id: 'campaign-1',
      adset_id: 'adset-1',
      ad_id: `ad-${index + 1}`,
      publisher_platform: 'facebook',
      platform_position: 'feed',
      impression_device: 'mobile_app',
      spend: '1.00',
    }));
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ id: 'act_123456789', currency: 'EUR', timezone_name: 'Africa/Algiers' }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(emptyMetaPage())
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: breakdownRows }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockImplementation(() => Promise.resolve(emptyMetaPage()));

    await expect(
      syncMetaAdsInsights({
        db: db as never,
        env: { META_ADS_ACCESS_TOKEN: 'token', META_AD_ACCOUNT_ID: '123456789' },
        fetchImpl: fetchMock,
        now: new Date('2026-08-17T00:00:00.000Z'),
        lookbackDays: 1,
      }),
    ).resolves.toMatchObject({ breakdownRows: 600 });

    expect(insert).toHaveBeenCalledTimes(3);
    expect(insertValues.mock.calls.map(([rows]) => rows.length)).toEqual([250, 250, 100]);
  });
});
