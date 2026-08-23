import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  jobs: vi.fn(),
  permissions: ['products_write'] as string[],
}));

vi.mock('../../../../lib/ai-background-jobs', () => ({
  allowedAdminBackgroundJobTypes: (permissions: string[]) => [
    ...(permissions.includes('products_write')
      ? ['ai_categorization', 'ai_content', 'product_export', 'catalog_feed_refresh']
      : []),
    ...(permissions.includes('analytics_manage')
      ? ['stats_import', 'ad_cost_import', 'reporting_refresh']
      : []),
  ],
  listAdminBackgroundJobs: mocks.jobs,
}));
vi.mock('../../../../lib/auth', () => ({
  auth: async () => ({ user: { email: 'admin@example.com', permissions: mocks.permissions } }),
}));
vi.mock('../../../../lib/permissions', () => ({
  normalizePermissions: (permissions: string[] | undefined) => permissions ?? [],
}));
vi.mock('../../../../lib/rbac', () => ({ requireAppAccess: async () => null }));

import { GET } from './route';

describe('GET /api/ai/history jobs', () => {
  beforeEach(() => {
    mocks.permissions = ['products_write'];
    mocks.jobs.mockReset().mockResolvedValue([
      {
        id: 'category-job',
        queue: 'admin-ai-categorization',
        kind: 'ai-product-categorization',
        type: 'ai_categorization',
        status: 'running',
      },
      {
        id: 'feed-job',
        queue: 'admin-product-catalog-feed',
        kind: 'product-catalog-feed-refresh',
        type: 'catalog_feed_refresh',
        status: 'completed',
      },
    ]);
  });

  it('returns all background work allowed by the admin domain permissions', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      jobs: [
        { id: 'category-job', type: 'ai_categorization' },
        { id: 'feed-job', type: 'catalog_feed_refresh' },
      ],
    });
    expect(mocks.jobs).toHaveBeenCalledWith(30, [
      'ai_categorization',
      'ai_content',
      'product_export',
      'catalog_feed_refresh',
    ]);
  });

  it('does not expose background work to settings-only admins', async () => {
    mocks.permissions = ['settings_manage'];
    mocks.jobs.mockResolvedValue([]);
    const response = await GET();

    await expect(response.json()).resolves.toMatchObject({
      jobs: [],
    });
    expect(mocks.jobs).toHaveBeenCalledWith(30, []);
  });
});
