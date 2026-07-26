import { describe, expect, it, vi } from 'vitest';

import { runAiCategorizationJob, type AiCategorizationDependencies, type AiCategorizationPayload } from './background-jobs';

const categories = [
  { id: 10, name: 'Drills', nameAr: null, parentId: null, parentName: null },
  { id: 20, name: 'Saws', nameAr: null, parentId: null, parentName: null },
];

function payload(overrides: Partial<AiCategorizationPayload> = {}): AiCategorizationPayload {
  return {
    __jobMeta: { id: 'job-1', ownerKey: 'admin@example.com', queueName: 'admin-ai-categorization', activeScope: 'owner' },
    scope: 'all_active',
    confidenceThreshold: 0.75,
    batchSize: 2,
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

describe('catalog categorization background job', () => {
  it('enumerates the complete catalog with a stable cursor and reconciles every outcome', async () => {
    const products = [
      { id: 1, title: 'Cordless drill', description: null, sku: 'D1', brand: null, categoryId: null, category: null },
      { id: 2, title: 'Existing drill', description: null, sku: 'D2', brand: null, categoryId: 10, category: 'Drills' },
      { id: 3, title: 'Unclear tool', description: null, sku: 'U1', brand: null, categoryId: null, category: null },
      { id: 4, title: 'Pending saw', description: null, sku: 'S1', brand: null, categoryId: null, category: null },
      { id: 5, title: 'Broken input', description: null, sku: 'B1', brand: null, categoryId: null, category: null },
    ];
    const classifiedIds: number[] = [];
    const proposed: Array<{ productId: number; categoryId: number }> = [];
    const dependencies: AiCategorizationDependencies = {
      classifier: {
        classify: vi.fn(async (input) => {
          classifiedIds.push(input.product.id);
          if (input.product.id === 5) throw new Error('provider failed');
          if (input.product.id === 3) return {
            decision: { categoryId: null, confidence: 0.4, ambiguous: true, reasoning: 'Insufficient evidence.' },
            usage: {},
            model: 'test-model',
          };
          return {
            decision: { categoryId: 10, confidence: 0.95, ambiguous: false, reasoning: 'Drill evidence.' },
            usage: { totalTokens: 10 },
            model: 'test-model',
          };
        }),
      },
      listCategories: async () => categories,
      countProducts: async () => products.length,
      listProductsAfter: async (_scope, lastId, limit) => products.filter((product) => product.id > lastId).slice(0, limit),
      listPendingProductIds: async () => new Set([4]),
      proposeCategory: vi.fn(async (input) => {
        proposed.push({ productId: input.productId, categoryId: input.categoryId });
        return { id: 100 + input.productId };
      }),
      applyProposal: vi.fn(),
    };
    const jobHelpers = helpers();

    await expect(runAiCategorizationJob(payload(), jobHelpers, dependencies)).resolves.toMatchObject({
      total: 5,
      processed: 5,
      proposed: 1,
      applied: 0,
      unchanged: 1,
      ambiguous: 1,
      alreadyProposed: 1,
      failed: 1,
      accounted: 5,
      complete: true,
      ambiguousProductIds: [3],
      failedProductIds: [5],
    });
    expect(classifiedIds).toEqual([1, 2, 3, 5]);
    expect(proposed).toEqual([{ productId: 1, categoryId: 10 }]);
    expect(jobHelpers.updateProgress).toHaveBeenLastCalledWith({ phase: 'classifying-products', current: 5, total: 5 });
  });

  it('treats low-confidence and out-of-taxonomy decisions as ambiguous', async () => {
    const decisions = [
      { categoryId: 10, confidence: 0.6, ambiguous: false, reasoning: 'Weak match.' },
      { categoryId: 999, confidence: 0.99, ambiguous: false, reasoning: 'Invalid category.' },
    ];
    const products = decisions.map((_, index) => ({ id: index + 1, title: `Product ${index + 1}`, description: null, sku: null, brand: null, categoryId: null, category: null }));
    const dependencies: AiCategorizationDependencies = {
      classifier: { classify: vi.fn(async () => ({ decision: decisions.shift()!, usage: {}, model: 'test-model' })) },
      listCategories: async () => categories,
      countProducts: async () => 2,
      listProductsAfter: async (_scope, lastId) => products.filter((product) => product.id > lastId),
      listPendingProductIds: async () => new Set(),
      proposeCategory: vi.fn(async () => ({ id: 1 })),
      applyProposal: vi.fn(),
    };

    await expect(runAiCategorizationJob(payload(), helpers(), dependencies)).resolves.toMatchObject({
      ambiguous: 2,
      proposed: 0,
      applied: 0,
      complete: true,
    });
    expect(dependencies.proposeCategory).not.toHaveBeenCalled();
  });

  it('fails truthfully when enumeration ends before the expected catalog total', async () => {
    const jobHelpers = helpers();
    const dependencies: AiCategorizationDependencies = {
      classifier: { classify: vi.fn() },
      listCategories: async () => categories,
      countProducts: async () => 3,
      listProductsAfter: async () => [],
      listPendingProductIds: async () => new Set(),
      proposeCategory: vi.fn(async () => ({ id: 1 })),
      applyProposal: vi.fn(),
    };

    await expect(runAiCategorizationJob(payload(), jobHelpers, dependencies)).rejects.toThrow('stopped after 0 of 3');
    expect(jobHelpers.updateSummary).toHaveBeenLastCalledWith(expect.objectContaining({
      total: 3,
      processed: 0,
      complete: false,
    }));
  });

  it('auto-applies through verified proposal review when the authorized job requests it', async () => {
    const applyProposal = vi.fn(async () => ({ status: 'applied', verified: true }));
    const dependencies: AiCategorizationDependencies = {
      classifier: {
        classify: vi.fn(async () => ({
          decision: { categoryId: 10, confidence: 0.95, ambiguous: false, reasoning: 'Clear drill match.' },
          usage: {},
          model: 'test-model',
        })),
      },
      listCategories: async () => categories,
      countProducts: async () => 1,
      listProductsAfter: async (_scope, lastId) => lastId === 0
        ? [{ id: 1, title: 'Drill', description: null, sku: null, brand: null, categoryId: null, category: null }]
        : [],
      listPendingProductIds: async () => new Set(),
      proposeCategory: vi.fn(async () => ({ id: 77 })),
      applyProposal,
    };

    await expect(runAiCategorizationJob(payload({ autoApply: true }), helpers(), dependencies)).resolves.toMatchObject({
      proposed: 0,
      applied: 1,
      complete: true,
    });
    expect(applyProposal).toHaveBeenCalledWith(77, { email: 'admin@example.com', name: 'Admin' });
  });
});
