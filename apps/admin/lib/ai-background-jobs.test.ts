import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  get: vi.fn(),
  cancel: vi.fn(),
}));

vi.mock('./background-jobs', () => ({
  ADMIN_AD_COST_IMPORT_QUEUE: 'admin-ad-cost-import',
  ADMIN_AI_CATEGORIZATION_QUEUE: 'admin-ai-categorization',
  ADMIN_AI_CONTENT_QUEUE: 'admin-ai-content',
  ADMIN_AI_LANDING_PAGE_QUEUE: 'admin-ai-landing-page',
  ADMIN_ECOTRACK_SHIPMENT_SYNC_QUEUE: 'admin-ecotrack-shipment-sync',
  ADMIN_ECOTRACK_SYNC_QUEUE: 'admin-ecotrack-sync',
  ADMIN_ORDER_ECOTRACK_QUEUE: 'admin-order-ecotrack',
  ADMIN_ORDER_EXPORT_QUEUE: 'admin-order-export',
  ADMIN_PRODUCT_CATALOG_FEED_QUEUE: 'admin-product-catalog-feed',
  ADMIN_PRODUCT_EXPORT_QUEUE: 'admin-product-export',
  ADMIN_REPORTING_REFRESH_QUEUE: 'admin-reporting-refresh',
  ADMIN_STATS_IMPORT_QUEUE: 'admin-stats-import',
  cancelBackgroundJob: mocks.cancel,
  getBackgroundJob: mocks.get,
  listRecentBackgroundJobs: mocks.list,
}));

import {
  allowedAdminBackgroundJobTypes,
  cancelAdminBackgroundJob,
  getAdminBackgroundJob,
  listAdminBackgroundJobs,
} from './ai-background-jobs';

describe('admin AI background job control', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists recent snapshots across every registered admin queue', async () => {
    mocks.list.mockResolvedValue([
      {
        id: 'job-1',
        queue: 'admin-ai-categorization',
        status: 'running',
      },
    ]);

    await expect(listAdminBackgroundJobs(25)).resolves.toEqual([
      expect.objectContaining({
        id: 'job-1',
        type: 'ai_categorization',
        cancellable: true,
      }),
    ]);

    expect(mocks.list).toHaveBeenCalledWith(
      expect.arrayContaining([
        'admin-ai-categorization',
        'admin-ai-landing-page',
        'admin-product-export',
        'admin-order-export',
        'admin-reporting-refresh',
      ]),
      25,
      {},
    );
  });

  it('maps each queue to its owning permission and limits list queries to that domain', async () => {
    expect(allowedAdminBackgroundJobTypes(['orders_write'])).toEqual([
      'order_export',
      'order_ecotrack',
    ]);
    expect(allowedAdminBackgroundJobTypes(['settings_manage'])).toEqual([]);
    expect(allowedAdminBackgroundJobTypes(['assets_write'])).toEqual(['ai_landing_page']);

    mocks.list.mockResolvedValue([{ id: 'job-2', queue: 'admin-order-export', status: 'queued' }]);
    await listAdminBackgroundJobs(10, ['order_export', 'order_ecotrack']);
    expect(mocks.list).toHaveBeenCalledWith(['admin-order-export', 'admin-order-ecotrack'], 10, {});
  });

  it('filters sidebar history to assistant-originated snapshots before applying the limit', async () => {
    mocks.list.mockResolvedValue([
      {
        id: 'scheduled-refresh',
        queue: 'admin-reporting-refresh',
        origin: null,
        status: 'completed',
      },
      {
        id: 'assistant-refresh',
        queue: 'admin-reporting-refresh',
        origin: 'admin-ai-assistant',
        status: 'completed',
      },
    ]);

    await expect(
      listAdminBackgroundJobs(30, ['reporting_refresh'], {
        origin: 'admin-ai-assistant',
      }),
    ).resolves.toEqual([
      expect.objectContaining({ id: 'assistant-refresh', type: 'reporting_refresh' }),
    ]);
    expect(mocks.list).toHaveBeenCalledWith(['admin-reporting-refresh'], 30, {
      origin: 'admin-ai-assistant',
    });
  });

  it('retrieves and cancels an exact cooperatively cancellable job', async () => {
    mocks.get.mockResolvedValue({ id: 'job-1', status: 'running' });
    mocks.cancel.mockResolvedValue({ id: 'job-1', status: 'running' });

    await expect(getAdminBackgroundJob('ai_categorization', 'job-1')).resolves.toMatchObject({
      id: 'job-1',
    });
    await expect(cancelAdminBackgroundJob('ai_categorization', 'job-1')).resolves.toEqual({
      job: { id: 'job-1', status: 'running' },
    });
    expect(mocks.get).toHaveBeenCalledWith('admin-ai-categorization', 'job-1');
    expect(mocks.cancel).toHaveBeenCalledWith('admin-ai-categorization', 'job-1');
  });

  it('refuses to claim cancellation support for non-cooperative jobs', async () => {
    mocks.get.mockResolvedValue({ id: 'job-2', status: 'running' });

    const result = await cancelAdminBackgroundJob('reporting_refresh', 'job-2');

    expect(result).toMatchObject({
      error: expect.stringContaining('does not support cooperative cancellation'),
    });
    expect(mocks.cancel).not.toHaveBeenCalled();

    await cancelAdminBackgroundJob('ai_landing_page', 'job-3');
    expect(mocks.get).toHaveBeenLastCalledWith('admin-ai-landing-page', 'job-3');
  });
});
