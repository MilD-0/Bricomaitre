import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { aiProposals, aiRuns, categories, products } from '@bric/db/schema';
const mocks = vi.hoisted(() => ({
  classify: vi.fn(),
  inserted: vi.fn(),
  updated: vi.fn(),
  getDb: vi.fn(),
}));
vi.mock('@bric/db/client', () => ({ getDb: mocks.getDb }));
vi.mock('@bric/ai-core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@bric/ai-core')>()),
  createProductCategorizationClassifier: () => ({ classify: mocks.classify }),
}));
import { runAiCategorizationJob } from './background-jobs';

describe('categorization invocation telemetry', () => {
  afterEach(() => vi.unstubAllEnvs());
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('AI_ADMIN_MODEL', 'test-model');
    const version = new Date(0);
    mocks.getDb.mockReturnValue({
      select: (selection: Record<string, unknown>) => {
        let table: unknown;
        const result = () =>
          table === categories
            ? [{ id: 10, name: 'Drills', nameAr: null, parentId: null, updatedAt: version }]
            : table === products
              ? 'value' in selection
                ? [{ value: 1 }]
                : [
                    {
                      id: 1,
                      title: 'Drill',
                      description: null,
                      sku: null,
                      brand: null,
                      categoryId: 10,
                      category: 'Drills',
                      updatedAt: version,
                    },
                  ]
              : [];
        const chain = {
          from: (value: unknown) => {
            table = value;
            return chain;
          },
          innerJoin: () => chain,
          leftJoin: () => chain,
          where: () => chain,
          orderBy: () => chain,
          limit: () => chain,
          then: (resolve: (rows: unknown[]) => unknown) => Promise.resolve(result()).then(resolve),
        };
        return chain;
      },
      insert: (table: unknown) => ({
        values: (value: unknown) => {
          mocks.inserted(table, value);
          return { returning: async () => [{ id: 77 }] };
        },
      }),
      update: (table: unknown) => ({
        set: (value: unknown) => {
          mocks.updated(table, value);
          return { where: async () => {} };
        },
      }),
    });
  });
  it.each(['unchanged', 'ambiguous', 'failure'])(
    'records an invocation even when its outcome is %s',
    async (outcome) => {
      if (outcome === 'failure')
        mocks.classify.mockRejectedValue(new Error('provider unavailable'));
      else
        mocks.classify.mockResolvedValue({
          decision: {
            categoryId: outcome === 'ambiguous' ? null : 10,
            ambiguous: outcome === 'ambiguous',
            confidence: 0.95,
            reasoning: 'Evidence',
          },
          model: 'model',
          usage: { inputTokens: 12, outputTokens: 3, totalTokens: 15 },
        });
      await runAiCategorizationJob(
        {
          __jobMeta: { id: 'test', ownerKey: 'operator', queueName: 'test', activeScope: 'owner' },
          scope: 'all_active',
          batchSize: 25,
          confidenceThreshold: 0.75,
          autoApply: false,
          actor: { email: 'operator@example.invalid' },
        },
        {
          updateProgress: async () => {},
          updateSummary: async () => {},
          throwIfCancelled: async () => {},
        },
      );
      expect(mocks.inserted).toHaveBeenCalledWith(
        aiRuns,
        expect.objectContaining({ status: 'running', actorId: 'operator@example.invalid' }),
      );
      expect(mocks.updated).toHaveBeenCalledWith(
        aiRuns,
        expect.objectContaining(
          outcome === 'failure'
            ? { status: 'failed', errorCode: 'Error' }
            : { status: 'completed', totalTokens: 15 },
        ),
      );
      expect(mocks.inserted.mock.calls.some(([table]) => table === aiProposals)).toBe(false);
    },
  );
});
