import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  appAccess: vi.fn(),
  mutationAccess: vi.fn(),
  hasDb: vi.fn(),
  auth: vi.fn(),
  review: vi.fn(),
  reviewAdmin: vi.fn(),
  proposalRow: vi.fn(),
  deleteRows: vi.fn(),
  revalidateTags: vi.fn(),
  revalidateProducts: vi.fn(),
  refreshFeed: vi.fn(),
}));
vi.mock('../../../../../lib/rbac', () => ({
  requireAppAccess: mocks.appAccess,
  requireMutationAccess: mocks.mutationAccess,
}));
vi.mock('@bric/db/client', () => ({
  hasDb: mocks.hasDb,
  getDb: () => ({
    select: () => ({ from: () => ({ where: () => ({ limit: mocks.proposalRow }) }) }),
    delete: () => ({
      where: () => ({ returning: mocks.deleteRows }),
    }),
  }),
}));
vi.mock('../../../../../lib/auth', () => ({ auth: mocks.auth }));
vi.mock('../../../../../lib/ai-product-content', () => ({
  AiContentNotFoundError: class AiContentNotFoundError extends Error {},
  AiProposalConflictError: class AiProposalConflictError extends Error {},
  reviewProductContentProposal: mocks.review,
}));
vi.mock('../../../../../lib/ai-admin-capabilities', () => ({
  AiAdminCapabilityError: class AiAdminCapabilityError extends Error {},
  reviewProductCategoryProposal: mocks.reviewAdmin,
}));
vi.mock('../../../../../lib/background-jobs', () => ({
  startProductCatalogFeedRefreshJob: mocks.refreshFeed,
  refreshAppliedAiProposalConsumers: vi.fn(async () => {
    mocks.revalidateTags('products', 'products-meta');
    await mocks.revalidateProducts();
    await mocks.refreshFeed();
  }),
}));
vi.mock('../../../../../lib/server-cache', () => ({
  CACHE_TAGS: { products: 'products', productsMeta: 'products-meta' },
  revalidateServerTags: mocks.revalidateTags,
}));
vi.mock('../../../../../lib/storefront-revalidate', () => ({
  revalidateStorefrontProducts: mocks.revalidateProducts,
}));

import { DELETE, PATCH } from './route';
import { AiProposalReviewConflictError } from '../../../../../lib/ai-proposal-review';

const request = (action: string) =>
  new NextRequest('http://localhost/api/ai/proposals/4', {
    method: 'PATCH',
    body: JSON.stringify({ action }),
    headers: { 'content-type': 'application/json' },
  });

describe('AI proposal review route', () => {
  beforeEach(() => {
    mocks.appAccess.mockReset().mockResolvedValue(null);
    mocks.mutationAccess.mockReset().mockResolvedValue(null);
    mocks.hasDb.mockReset().mockReturnValue(true);
    mocks.auth
      .mockReset()
      .mockResolvedValue({ user: { email: 'admin@example.com', name: 'Admin' } });
    mocks.review
      .mockReset()
      .mockResolvedValue({ id: 4, status: 'applied', verified: true, product: { id: 1 } });
    mocks.reviewAdmin.mockReset().mockResolvedValue({
      id: 4,
      status: 'applied',
      verified: true,
      proposalType: 'featured_products',
    });
    mocks.proposalRow
      .mockReset()
      .mockResolvedValue([{ proposalType: 'product_content', entityType: 'products' }]);
    mocks.deleteRows.mockReset().mockResolvedValue([{ id: 4 }]);
    mocks.revalidateTags.mockReset();
    mocks.revalidateProducts.mockReset().mockResolvedValue(undefined);
    mocks.refreshFeed.mockReset().mockResolvedValue(undefined);
  });

  it('uses product access for category-assignment proposals', async () => {
    mocks.proposalRow.mockResolvedValue([
      { proposalType: 'product_category', entityType: 'products' },
    ]);
    const response = await PATCH(request('approve'), { params: Promise.resolve({ id: '4' }) });
    expect(response.status).toBe(200);
    expect(mocks.mutationAccess).toHaveBeenCalledWith('products');
    expect(mocks.reviewAdmin).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'admin@example.com',
        actorName: 'Admin',
      }),
    );
  });

  it('does not review retired generic proposal types', async () => {
    mocks.proposalRow.mockResolvedValue([{ proposalType: 'entity_edit', entityType: 'products' }]);

    const response = await PATCH(request('approve'), { params: Promise.resolve({ id: '4' }) });

    expect(response.status).toBe(404);
    expect(mocks.mutationAccess).not.toHaveBeenCalled();
    expect(mocks.reviewAdmin).not.toHaveBeenCalled();
  });

  it('requires the proposal domain permission for approval', async () => {
    mocks.mutationAccess.mockResolvedValue(
      NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    );
    const response = await PATCH(request('approve'), { params: Promise.resolve({ id: '4' }) });
    expect(response.status).toBe(403);
    expect(mocks.review).not.toHaveBeenCalled();
  });

  it('applies an approved proposal and refreshes catalog consumers', async () => {
    const response = await PATCH(request('approve'), { params: Promise.resolve({ id: '4' }) });
    expect(response.status).toBe(200);
    expect(mocks.appAccess).toHaveBeenCalledOnce();
    expect(mocks.mutationAccess).toHaveBeenCalledWith('products');
    expect(mocks.revalidateProducts).toHaveBeenCalled();
    expect(mocks.refreshFeed).toHaveBeenCalled();
  });

  it('requires the proposal domain permission for rejection', async () => {
    mocks.review.mockResolvedValue({ id: 4, status: 'rejected' });
    const response = await PATCH(request('reject'), { params: Promise.resolve({ id: '4' }) });
    expect(response.status).toBe(200);
    expect(mocks.appAccess).toHaveBeenCalledOnce();
    expect(mocks.mutationAccess).toHaveBeenCalledWith('products');
    expect(mocks.revalidateProducts).not.toHaveBeenCalled();
  });

  it('returns a machine-readable recovery action for stale proposal decisions', async () => {
    mocks.review.mockRejectedValue(
      new AiProposalReviewConflictError(
        'The product changed after this proposal was generated.',
        'proposal_stale',
      ),
    );

    const response = await PATCH(request('approve'), { params: Promise.resolve({ id: '4' }) });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: 'The product changed after this proposal was generated.',
      code: 'proposal_stale',
      proposalId: 4,
      nextAction: 'regenerate',
    });
    expect(mocks.revalidateProducts).not.toHaveBeenCalled();
  });

  it('deletes an expired pending proposal through its domain permission', async () => {
    const response = await DELETE(request('reject'), {
      params: Promise.resolve({ id: '4' }),
    });

    expect(response.status).toBe(200);
    expect(mocks.mutationAccess).toHaveBeenCalledWith('products');
    expect(mocks.deleteRows).toHaveBeenCalledOnce();
    await expect(response.json()).resolves.toEqual({ deleted: { id: 4 } });
  });

  it('does not delete retired generic proposal types', async () => {
    mocks.proposalRow.mockResolvedValue([{ proposalType: 'entity_edit', entityType: 'products' }]);

    const response = await DELETE(request('reject'), {
      params: Promise.resolve({ id: '4' }),
    });

    expect(response.status).toBe(404);
    expect(mocks.mutationAccess).not.toHaveBeenCalled();
    expect(mocks.deleteRows).not.toHaveBeenCalled();
  });

  it('keeps non-expired or already-reviewed proposals', async () => {
    mocks.deleteRows.mockResolvedValue([]);
    const response = await DELETE(request('reject'), {
      params: Promise.resolve({ id: '4' }),
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: 'Only expired pending proposals can be deleted.',
    });
  });
});
