import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  jobs: vi.fn(),
  publish: vi.fn(),
  permissions: ['products_write'] as string[],
}));

vi.mock('../../../../lib/ai-background-jobs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../lib/ai-background-jobs')>()),
  listAdminBackgroundJobs: mocks.jobs,
}));
vi.mock('../../../../lib/auth', () => ({
  auth: async () => ({ user: { email: 'admin@example.com', permissions: mocks.permissions } }),
}));
vi.mock('../../../../lib/ai-task-followups', () => ({
  publishAiTaskTerminalMessage: mocks.publish,
}));
vi.mock('../../../../lib/rbac', () => ({
  requireAppAccess: async () => ({
    response: null,
    session: await (await import('../../../../lib/auth')).auth(),
  }),
}));

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
        conversationId: 42,
        status: 'running',
      },
      {
        id: 'feed-job',
        queue: 'admin-product-catalog-feed',
        kind: 'product-catalog-feed-refresh',
        type: 'catalog_feed_refresh',
        conversationId: 42,
        status: 'completed',
        progress: { phase: 'completed', current: 1, total: 1, percentage: 100 },
        errorMessage: null,
        resultSummary: { complete: true },
        downloadPath: '/exports/feed.csv',
      },
    ]);
    mocks.publish.mockReset().mockResolvedValue({ kind: 'existing' });
  });

  it('returns only assistant-originated background work allowed by domain permissions', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      jobs: [
        { id: 'category-job', type: 'ai_categorization' },
        { id: 'feed-job', type: 'catalog_feed_refresh' },
      ],
    });
    expect(mocks.jobs).toHaveBeenCalledWith(
      30,
      ['ai_categorization', 'ai_content', 'product_export', 'catalog_feed_refresh'],
      { origin: 'admin-ai-assistant' },
    );
    expect(mocks.publish).toHaveBeenCalledWith({
      conversationId: 42,
      jobId: 'feed-job',
      kind: 'product-catalog-feed-refresh',
      status: 'completed',
      progress: { phase: 'completed', current: 1, total: 1, percentage: 100 },
      summary: { complete: true },
      errorMessage: null,
      downloadPath: '/exports/feed.csv',
    });
  });

  it('does not expose background work to settings-only admins', async () => {
    mocks.permissions = ['settings_manage'];
    mocks.jobs.mockResolvedValue([]);
    const response = await GET();

    await expect(response.json()).resolves.toMatchObject({
      jobs: [],
    });
    expect(mocks.jobs).toHaveBeenCalledWith(30, [], { origin: 'admin-ai-assistant' });
  });
});
