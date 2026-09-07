import { describe, expect, it, vi } from 'vitest';

import { runAiContentJob, type AiContentPayload } from './background-jobs';
import type { AiContentJobDependencies } from './ai-jobs/content';

function payload(overrides: Partial<AiContentPayload> = {}): AiContentPayload {
  return {
    __jobMeta: {
      id: 'content-job-1',
      ownerKey: 'admin@example.com',
      queueName: 'admin-ai-content',
      activeScope: 'owner',
    },
    productIds: null,
    fields: ['titleAr'],
    onlyMissing: true,
    autoApply: false,
    actor: { email: 'admin@example.com', name: 'Admin' },
    ...overrides,
  };
}

function helpers() {
  return {
    updateProgress: vi.fn(async () => undefined),
    updateSummary: vi.fn(async () => undefined),
    throwIfCancelled: vi.fn(async () => undefined),
  };
}

const products = [
  { id: 1, title: 'Drill', titleAr: null, description: null, descriptionAr: null },
  { id: 2, title: 'Saw', titleAr: 'منشار', description: null, descriptionAr: null },
  { id: 3, title: 'Hammer', titleAr: null, description: null, descriptionAr: null },
  { id: 4, title: 'Broken', titleAr: null, description: null, descriptionAr: null },
];

describe('AI product content background job', () => {
  it('reconciles generated, skipped, pending, and failed products', async () => {
    const dependencies: AiContentJobDependencies = {
      listProducts: vi.fn(async () => products),
      listPendingProductIds: vi.fn(async () => new Set([3])),
      propose: vi.fn(async ({ productId }) => {
        if (productId === 4) throw new Error('provider failed');
        return { id: 100 + productId };
      }),
      applyProposal: vi.fn(),
      refreshConsumers: vi.fn(async () => undefined),
    };
    const jobHelpers = helpers();

    await expect(runAiContentJob(payload(), jobHelpers, dependencies)).resolves.toEqual({
      processed: 4,
      proposed: 1,
      applied: 0,
      autoApplyFailed: 0,
      skipped: 1,
      alreadyProposed: 1,
      failed: 1,
      total: 4,
      accounted: 4,
      complete: true,
      failedProductIds: [4],
    });
    expect(dependencies.propose).toHaveBeenCalledWith({
      productId: 1,
      fields: ['titleAr'],
      context: undefined,
      actorId: 'admin@example.com',
    });
    expect(jobHelpers.updateProgress).toHaveBeenLastCalledWith({
      phase: 'generating-proposals',
      current: 4,
      total: 4,
    });
  });

  it('auto-applies generated proposals through verified review', async () => {
    const refreshConsumers = vi.fn(async () => undefined);
    const dependencies: AiContentJobDependencies = {
      listProducts: vi.fn(async () => [products[0]]),
      listPendingProductIds: vi.fn(async () => new Set<number>()),
      propose: vi.fn(async () => ({ id: 101 })),
      applyProposal: vi.fn(async () => ({ status: 'applied' as const, verified: true as const })),
      refreshConsumers,
    };

    await expect(
      runAiContentJob(payload({ autoApply: true }), helpers(), dependencies),
    ).resolves.toMatchObject({
      processed: 1,
      proposed: 0,
      applied: 1,
      autoApplyFailed: 0,
      accounted: 1,
      complete: true,
    });
    expect(dependencies.applyProposal).toHaveBeenCalledWith(101, {
      email: 'admin@example.com',
      name: 'Admin',
    });
    expect(refreshConsumers).toHaveBeenCalledOnce();
    expect(refreshConsumers).toHaveBeenCalledWith('ai-product-content:auto-apply');
  });

  it('leaves a proposal pending when verified auto-apply fails', async () => {
    const dependencies: AiContentJobDependencies = {
      listProducts: vi.fn(async () => [products[0]]),
      listPendingProductIds: vi.fn(async () => new Set<number>()),
      propose: vi.fn(async () => ({ id: 101 })),
      applyProposal: vi.fn(async () => {
        throw new Error('verification failed');
      }),
      refreshConsumers: vi.fn(async () => undefined),
    };

    await expect(
      runAiContentJob(payload({ autoApply: true }), helpers(), dependencies),
    ).resolves.toMatchObject({
      proposed: 1,
      applied: 0,
      autoApplyFailed: 1,
      complete: true,
    });
  });
});

it.each(['cancellation', 'progress failure'])(
  'refreshes committed products after %s',
  async (failure) => {
    const jobHelpers = helpers();
    const dependencies: AiContentJobDependencies = {
      listProducts: async () => [products[0], products[2]],
      listPendingProductIds: async () => new Set(),
      propose: async () => ({ id: 101 }),
      applyProposal: vi.fn(async () => ({ status: 'applied' as const, verified: true as const })),
      refreshConsumers: vi.fn(async () => undefined),
    };
    if (failure === 'cancellation')
      jobHelpers.throwIfCancelled
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Job cancelled.'));
    else jobHelpers.updateProgress.mockRejectedValueOnce(new Error('Redis unavailable'));
    await expect(
      runAiContentJob(payload({ autoApply: true }), jobHelpers, dependencies),
    ).rejects.toThrow();
    expect(dependencies.applyProposal).toHaveBeenCalledOnce();
    expect(dependencies.refreshConsumers).toHaveBeenCalledOnce();
  },
);
