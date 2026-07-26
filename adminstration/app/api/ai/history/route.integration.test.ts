import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ jobs: vi.fn() }));

vi.mock('../../../../lib/background-jobs', () => ({
  ADMIN_AI_CONTENT_QUEUE: 'admin-ai-content',
  ADMIN_AI_CATEGORIZATION_QUEUE: 'admin-ai-categorization',
  getLatestExportJob: mocks.jobs,
}));
vi.mock('../../../../db/client', () => ({
  hasDb: () => true,
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({ limit: async () => [] }),
        }),
      }),
    }),
  }),
}));
vi.mock('../../../../lib/auth', () => ({ auth: async () => ({ user: { email: 'admin@example.com', permissions: ['settings_manage'] } }) }));
vi.mock('../../../../lib/rbac', () => ({ requireAiUseAccess: async () => null }));

import { GET } from './route';

describe('GET /api/ai/history jobs', () => {
  beforeEach(() => {
    mocks.jobs.mockReset().mockImplementation(async (queue: string) => queue === 'admin-ai-categorization'
      ? { id: 'category-job', queue, kind: 'ai-product-categorization', status: 'running' }
      : null);
  });

  it('returns categorization and content jobs together', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      jobs: [{ id: 'category-job', kind: 'ai-product-categorization' }],
    });
    expect(mocks.jobs).toHaveBeenCalledWith('admin-ai-categorization', 'admin@example.com');
    expect(mocks.jobs).toHaveBeenCalledWith('admin-ai-content', 'admin@example.com');
  });

  it('does not mix unrelated system jobs into the assistant history for settings managers', async () => {
    const response = await GET();

    await expect(response.json()).resolves.toMatchObject({
      jobs: [{ id: 'category-job', kind: 'ai-product-categorization' }],
    });
    expect(mocks.jobs).toHaveBeenCalledTimes(2);
  });
});
