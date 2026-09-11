import { describe, expect, it, vi } from 'vitest';

import {
  adminAiOffPipelineSalesMutationSchema,
  manageAdminAiOffPipelineSales,
  queryAdminAiOffPipelineSales,
} from './admin-ai-off-pipeline-sales';

const requestId = '680ff81f-a911-4d9c-b07c-1459e560b56a';

describe('Admin AI off-pipeline sales', () => {
  it('requires exact financial inputs and rejects order-pipeline fields', () => {
    expect(() =>
      adminAiOffPipelineSalesMutationSchema.parse({
        operations: [
          {
            action: 'create',
            requestId,
            description: 'Direct counter sale',
            recognizedOn: '2026-09-01',
            amountCollectedDzd: 18_000,
            feesDzd: 500,
          },
        ],
      }),
    ).toThrow();
    expect(() =>
      adminAiOffPipelineSalesMutationSchema.parse({
        operations: [
          {
            action: 'create',
            requestId,
            description: 'Direct counter sale',
            recognizedOn: '2026-09-01',
            amountCollectedDzd: 18_000,
            feesDzd: 500,
            productCostDzd: 11_000,
            orderStatus: 'completed',
          },
        ],
      }),
    ).toThrow();
  });

  it('passes the authenticated actor to audited mutations and refreshes once', async () => {
    const actor = { email: 'operator@example.com', name: 'Operator' };
    const create = vi.fn().mockResolvedValue({
      status: 'created',
      current: { id: 41, realizedProfitDzd: 6_500 },
      replayed: false,
    });
    const refreshFacts = vi.fn().mockResolvedValue(true);
    const result = await manageAdminAiOffPipelineSales(
      {
        operations: [
          {
            action: 'create',
            requestId,
            reference: 'DS-2026-09-01',
            description: 'Direct counter sale',
            recognizedOn: '2026-09-01',
            amountCollectedDzd: 18_000,
            feesDzd: 500,
            productCostDzd: 11_000,
          },
        ],
      },
      actor,
      {
        create,
        update: vi.fn(),
        delete: vi.fn(),
        refreshFacts,
      },
    );

    expect(create).toHaveBeenCalledWith(
      expect.not.objectContaining({ action: expect.anything() }),
      actor,
    );
    expect(result).toMatchObject({ changedCount: 1, requestedCount: 1 });
    expect(refreshFacts).toHaveBeenCalledOnce();
  });

  it('returns the ledger boundary with exact query results', async () => {
    const list = vi.fn().mockResolvedValue({
      items: [{ id: 41, reference: 'DS-2026-09-01' }],
      pagination: { totalItems: 1 },
    });
    const result = await queryAdminAiOffPipelineSales({ search: 'DS-2026-09-01' }, { list });
    expect(result.kind).toBe('off_pipeline_sales');
    expect(result.boundary).toContain('does not create or change orders');
    expect(result.items).toHaveLength(1);
  });
});
