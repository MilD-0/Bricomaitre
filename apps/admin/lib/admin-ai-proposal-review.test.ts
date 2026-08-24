import { describe, expect, it, vi } from 'vitest';

import { deleteExpiredAdminAiProposals, reviewAdminAiProposals } from './admin-ai-proposal-review';

describe('admin AI proposal review', () => {
  it('reviews exact authorized proposals and refreshes applied consumers once', async () => {
    const readTarget = vi.fn(async (proposalId: number) =>
      proposalId === 4
        ? { proposalType: 'product_content', entityType: 'products' }
        : { proposalType: 'entity_create', entityType: 'categories' },
    );
    const executeReview = vi.fn(async ({ proposalId }: { proposalId: number }) => ({
      id: proposalId,
      status: 'applied' as const,
    }));
    const refreshAppliedConsumers = vi.fn(async () => undefined);

    const result = await reviewAdminAiProposals(
      { proposalIds: [4, 9, 4], action: 'approve' },
      { email: 'admin@example.com', name: 'Admin' },
      ['products_write', 'brands_categories_write'],
      { readTarget, executeReview: executeReview as never, refreshAppliedConsumers },
    );

    expect(result).toMatchObject({
      action: 'approve',
      requestedCount: 2,
      reviewedCount: 2,
      appliedCount: 2,
      rejectedCount: 0,
      failed: [],
    });
    expect(executeReview).toHaveBeenCalledTimes(2);
    expect(executeReview).toHaveBeenCalledWith({
      proposalId: 4,
      action: 'approve',
      target: { proposalType: 'product_content', entityType: 'products' },
      actor: { email: 'admin@example.com', name: 'Admin' },
    });
    expect(refreshAppliedConsumers).toHaveBeenCalledOnce();
    expect(refreshAppliedConsumers).toHaveBeenCalledWith('admin-ai:proposal-review');
  });

  it('reports unauthorized and conflicted proposals without losing successful decisions', async () => {
    const executeReview = vi.fn(async ({ proposalId }: { proposalId: number }) => {
      if (proposalId === 3) throw new Error('Proposal changed after inspection.');
      return { id: proposalId, status: 'rejected' as const };
    });
    const refreshAppliedConsumers = vi.fn(async () => undefined);

    const result = await reviewAdminAiProposals(
      { proposalIds: [2, 3, 4], action: 'reject' },
      { email: 'admin@example.com' },
      ['products_write'],
      {
        readTarget: vi.fn(async (proposalId: number) =>
          proposalId === 2
            ? { proposalType: 'landing_page', entityType: 'landing_pages' }
            : { proposalType: 'product_content', entityType: 'products' },
        ),
        executeReview: executeReview as never,
        refreshAppliedConsumers,
      },
    );

    expect(result).toMatchObject({
      requestedCount: 3,
      reviewedCount: 1,
      appliedCount: 0,
      rejectedCount: 1,
      reviewed: [{ proposalId: 4, resource: 'products', result: { status: 'rejected' } }],
      failed: [
        { proposalId: 2, error: 'Missing permission for assets.' },
        { proposalId: 3, error: 'Proposal changed after inspection.' },
      ],
    });
    expect(refreshAppliedConsumers).not.toHaveBeenCalled();
  });

  it('deletes only exact expired proposals in authorized domains and preserves failures', async () => {
    const deleteExpired = vi.fn(async (proposalId: number) => {
      if (proposalId === 3) throw new Error('Only expired pending proposals can be deleted.');
      return { id: proposalId };
    });

    const result = await deleteExpiredAdminAiProposals(
      { proposalIds: [2, 3, 4, 2] },
      ['products_write'],
      {
        readTarget: vi.fn(async (proposalId: number) =>
          proposalId === 4
            ? { proposalType: 'landing_page', entityType: 'landing_pages' }
            : { proposalType: 'product_content', entityType: 'products' },
        ),
        deleteExpired,
      },
    );

    expect(result).toEqual({
      requestedCount: 3,
      deletedCount: 1,
      failedCount: 2,
      deleted: [{ proposalId: 2, resource: 'products' }],
      failed: [
        { proposalId: 3, error: 'Only expired pending proposals can be deleted.' },
        { proposalId: 4, error: 'Missing permission for assets.' },
      ],
    });
    expect(deleteExpired).toHaveBeenCalledTimes(2);
  });
});
