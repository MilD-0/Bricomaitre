import { beforeEach, describe, expect, it, vi } from 'vitest';

const { readMetaAdsConfigMock, scheduleMock, validateMock, syncMetaAdsInsightsMock } = vi.hoisted(
  () => ({
    readMetaAdsConfigMock: vi.fn(),
    scheduleMock: vi.fn(),
    validateMock: vi.fn(),
    syncMetaAdsInsightsMock: vi.fn(),
  }),
);

vi.mock('node-cron', () => ({
  default: { schedule: scheduleMock, validate: validateMock },
}));

vi.mock('./meta-ads-insights', () => ({
  readMetaAdsConfig: readMetaAdsConfigMock,
  syncMetaAdsInsights: syncMetaAdsInsightsMock,
}));

describe('Meta Ads Insights scheduler', () => {
  beforeEach(() => {
    vi.resetModules();
    scheduleMock.mockReset().mockReturnValue({ stop: vi.fn() });
    validateMock.mockReset().mockReturnValue(true);
    readMetaAdsConfigMock.mockReset().mockReturnValue({});
    syncMetaAdsInsightsMock.mockReset().mockResolvedValue({ rows: 1 });
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('ADMIN_META_ADS_SYNC_ENABLED', 'true');
    delete process.env.ADMIN_META_ADS_SYNC_CRON;
    delete process.env.ADMIN_META_ADS_SYNC_TIMEZONE;
  });

  it('registers one opt-in schedule and runs the direct reporting sync', async () => {
    const {
      DEFAULT_META_ADS_SYNC_CRON,
      stopMetaAdsScheduler,
      runScheduledMetaAdsSync,
      startMetaAdsScheduler,
    } = await import('./meta-ads-scheduler');

    stopMetaAdsScheduler();
    startMetaAdsScheduler();
    startMetaAdsScheduler();
    expect(validateMock).toHaveBeenCalledWith(DEFAULT_META_ADS_SYNC_CRON);
    expect(scheduleMock).toHaveBeenCalledOnce();
    await vi.waitFor(() =>
      expect(syncMetaAdsInsightsMock).toHaveBeenCalledWith({ trigger: 'startup' }),
    );
    await expect(runScheduledMetaAdsSync('test')).resolves.toBe(true);
    expect(syncMetaAdsInsightsMock).toHaveBeenCalledWith({ trigger: 'test' });
  });

  it('does not register until shadow synchronization is explicitly enabled', async () => {
    vi.stubEnv('ADMIN_META_ADS_SYNC_ENABLED', 'false');
    const { stopMetaAdsScheduler, startMetaAdsScheduler } = await import('./meta-ads-scheduler');
    stopMetaAdsScheduler();
    expect(startMetaAdsScheduler()).toBeNull();
    expect(scheduleMock).not.toHaveBeenCalled();
  });

  it('fails startup when an enabled sync has incomplete credentials', async () => {
    readMetaAdsConfigMock.mockImplementation(() => {
      throw new Error('Meta Ads credentials are incomplete.');
    });
    const { stopMetaAdsScheduler, startMetaAdsScheduler } = await import('./meta-ads-scheduler');
    stopMetaAdsScheduler();

    expect(() => startMetaAdsScheduler()).toThrow('Meta Ads credentials are incomplete.');
    expect(scheduleMock).not.toHaveBeenCalled();
  });
});
