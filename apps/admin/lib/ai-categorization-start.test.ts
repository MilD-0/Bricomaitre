import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ startOwnedJob: vi.fn() }));

vi.mock('@bric/runtime/jobs', () => ({
  startOwnedJob: mocks.startOwnedJob,
  getLatestOwnedJob: vi.fn(),
  requestJobCancellation: vi.fn(),
}));

import { ADMIN_AI_CATEGORIZATION_QUEUE, startAiCategorizationJob } from './background-jobs';

describe('catalog categorization job start', () => {
  it('uses a global active scope so two administrators cannot classify the catalog concurrently', async () => {
    mocks.startOwnedJob.mockResolvedValue({
      kind: 'started',
      job: {
        id: 'job-1',
        queue: ADMIN_AI_CATEGORIZATION_QUEUE,
        kind: 'ai-product-categorization',
        status: 'queued',
        progress: { phase: 'queued', current: 0, total: 0, percentage: 0 },
        errorMessage: null,
        downloadUrl: null,
        resultSummary: null,
      },
    });

    await startAiCategorizationJob('admin@example.com', {
      scope: 'all_active',
      confidenceThreshold: 0.75,
      batchSize: 25,
      autoApply: false,
      actor: { email: 'admin@example.com', name: 'Admin' },
    });

    expect(mocks.startOwnedJob).toHaveBeenCalledWith(
      expect.objectContaining({
        queueName: ADMIN_AI_CATEGORIZATION_QUEUE,
        kind: 'ai-product-categorization',
        activeScope: 'global',
      }),
    );
  });
});
