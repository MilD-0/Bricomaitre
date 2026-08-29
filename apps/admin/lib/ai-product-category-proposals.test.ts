import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getDb: vi.fn() }));

vi.mock('@bric/db/client', () => ({ getDb: mocks.getDb }));

import {
  ProductCategoryProposalError,
  PRODUCT_CATEGORY_CHANGE_SCHEMA,
  proposeProductCategoryAssignment,
  reviewProductCategoryProposal,
} from './ai-product-category-proposals';

describe('product category proposals', () => {
  const sourceUpdatedAt = new Date('2026-07-25T00:00:00.000Z');
  const categoryUpdatedAt = new Date('2026-07-24T00:00:00.000Z');

  beforeEach(() => mocks.getDb.mockReset());

  it('accepts only one exact category assignment', () => {
    expect(PRODUCT_CATEGORY_CHANGE_SCHEMA.parse({ categoryId: 10 })).toEqual({ categoryId: 10 });
    expect(() => PRODUCT_CATEGORY_CHANGE_SCHEMA.parse({ categoryId: 10, active: false })).toThrow();
    expect(() => PRODUCT_CATEGORY_CHANGE_SCHEMA.parse({ categoryId: null })).toThrow();
  });

  it('creates the run and proposal in one transaction', async () => {
    const rows = [
      [{ id: 4, categoryId: null, updatedAt: sourceUpdatedAt }],
      [{ id: 10, updatedAt: categoryUpdatedAt }],
    ];
    const inserted: unknown[] = [];
    const tx = {
      insert: vi.fn(() => ({
        values: vi.fn((value: unknown) => {
          inserted.push(value);
          return { returning: vi.fn(async () => [{ id: inserted.length === 1 ? 70 : 90 }]) };
        }),
      })),
    };
    const db = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({ limit: vi.fn(async () => rows.shift() ?? []) })),
        })),
      })),
      transaction: vi.fn(async (callback: (transaction: typeof tx) => unknown) => callback(tx)),
    };
    mocks.getDb.mockReturnValue(db);

    await expect(
      proposeProductCategoryAssignment({
        productId: 4,
        categoryId: 10,
        actorId: 'admin@example.com',
        reasoning: 'Clear category match.',
        model: 'test-model',
        promptVersion: 'test-v1',
      }),
    ).resolves.toMatchObject({ id: 90, status: 'proposed' });
    expect(db.transaction).toHaveBeenCalledOnce();
    expect(inserted).toHaveLength(2);
    expect(inserted[1]).toMatchObject({
      runId: 70,
      entityId: 4,
      payload: {
        changes: { categoryId: 10 },
        dependencies: { category: { id: 10, updatedAt: categoryUpdatedAt.toISOString() } },
      },
    });
  });

  function reviewDatabase(
    options: {
      proposal?: Record<string, unknown>;
      product?: Record<string, unknown>;
      category?: Record<string, unknown>;
      updateResults?: unknown[][];
    } = {},
  ) {
    const selectResults = [
      [
        {
          id: 9,
          status: 'proposed',
          proposalType: 'product_category',
          entityType: 'products',
          entityId: 4,
          sourceUpdatedAt,
          payload: {
            changes: { categoryId: 10 },
            dependencies: {
              category: { id: 10, updatedAt: categoryUpdatedAt.toISOString() },
            },
          },
          expiresAt: new Date('2099-07-27T00:00:00.000Z'),
          ...options.proposal,
        },
      ],
      [{ id: 4, title: 'Drill', categoryId: null, updatedAt: sourceUpdatedAt, ...options.product }],
      [{ id: 10, name: 'Drills', updatedAt: categoryUpdatedAt, ...options.category }],
    ];
    const updateResults = options.updateResults ?? [
      [{ id: 4, title: 'Drill', categoryId: 10, updatedAt: new Date() }],
      [{ id: 9, status: 'applied' }],
    ];
    const actionValues = vi.fn(async () => undefined);
    const tx = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => ({ for: vi.fn(async () => selectResults.shift() ?? []) })),
          })),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({ returning: vi.fn(async () => updateResults.shift() ?? []) })),
        })),
      })),
      insert: vi.fn(() => ({ values: actionValues })),
    };
    return {
      tx,
      actionValues,
      db: {
        transaction: vi.fn(async (callback: (transaction: typeof tx) => unknown) => callback(tx)),
      },
    };
  }

  it('applies a fresh assignment, records action history, then marks the proposal applied', async () => {
    const { db, actionValues } = reviewDatabase();
    mocks.getDb.mockReturnValue(db);

    await expect(
      reviewProductCategoryProposal({
        proposalId: 9,
        action: 'approve',
        actorId: 'admin@example.com',
        actorName: 'Admin',
      }),
    ).resolves.toMatchObject({ id: 9, status: 'applied', verified: true });
    expect(actionValues).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: 'products',
        entityType: 'products',
        entityId: 4,
        operation: 'update',
        createdBy: 'admin@example.com',
      }),
    );
  });

  it('does not mark the proposal applied when the assignment cannot be verified', async () => {
    const { db, tx } = reviewDatabase({
      updateResults: [[{ id: 4, categoryId: null }], [{ id: 9, status: 'applied' }]],
    });
    mocks.getDb.mockReturnValue(db);

    await expect(
      reviewProductCategoryProposal({ proposalId: 9, action: 'approve' }),
    ).rejects.toThrow(ProductCategoryProposalError);
    expect(tx.update).toHaveBeenCalledTimes(1);
  });

  it('rejects a category changed after generation', async () => {
    const { db, tx } = reviewDatabase({
      category: { updatedAt: new Date('2026-07-26T00:00:00.000Z') },
    });
    mocks.getDb.mockReturnValue(db);

    await expect(
      reviewProductCategoryProposal({ proposalId: 9, action: 'approve' }),
    ).rejects.toMatchObject({ code: 'proposal_dependency_changed', nextAction: 'regenerate' });
    expect(tx.update).not.toHaveBeenCalled();
  });

  it('does not apply legacy generic proposal types', async () => {
    const { db } = reviewDatabase({ proposal: { proposalType: 'product_discount' } });
    mocks.getDb.mockReturnValue(db);

    await expect(
      reviewProductCategoryProposal({ proposalId: 9, action: 'approve' }),
    ).rejects.toMatchObject({ code: 'proposal_already_reviewed' });
  });
});
