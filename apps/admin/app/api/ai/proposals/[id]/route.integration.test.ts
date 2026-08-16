import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  aiAccess: vi.fn(),
  mutationAccess: vi.fn(),
  hasDb: vi.fn(),
  auth: vi.fn(),
  review: vi.fn(),
  reviewAdmin: vi.fn(),
  proposalRow: vi.fn(),
  revalidateTags: vi.fn(),
  revalidateProducts: vi.fn(),
  refreshFeed: vi.fn(),
}));
vi.mock('../../../../../lib/rbac', () => ({
  requireAiAccess: mocks.aiAccess,
  requireMutationAccess: mocks.mutationAccess,
}));
vi.mock('@bric/db/client', () => ({
  hasDb: mocks.hasDb,
  getDb: () => ({
    select: () => ({ from: () => ({ where: () => ({ limit: mocks.proposalRow }) }) }),
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
  reviewAdminProposal: mocks.reviewAdmin,
}));
vi.mock('../../../../../lib/background-jobs', () => ({
  startProductCatalogFeedRefreshJob: mocks.refreshFeed,
}));
vi.mock('../../../../../lib/server-cache', () => ({
  CACHE_TAGS: { products: 'products', productsMeta: 'products-meta' },
  revalidateServerTags: mocks.revalidateTags,
}));
vi.mock('../../../../../lib/storefront-revalidate', () => ({
  revalidateStorefrontProducts: mocks.revalidateProducts,
}));

import { PATCH } from './route';

const request = (action: string) =>
  new NextRequest('http://localhost/api/ai/proposals/4', {
    method: 'PATCH',
    body: JSON.stringify({ action }),
    headers: { 'content-type': 'application/json' },
  });

describe('AI proposal review route', () => {
  beforeEach(() => {
    mocks.aiAccess.mockReset().mockResolvedValue(null);
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
      .mockResolvedValue([{ type: 'product_content', entityType: 'products' }]);
    mocks.revalidateTags.mockReset();
    mocks.revalidateProducts.mockReset().mockResolvedValue(undefined);
    mocks.refreshFeed.mockReset().mockResolvedValue(undefined);
  });

  it('uses asset access for a featured-products proposal', async () => {
    mocks.proposalRow.mockResolvedValue([
      { type: 'featured_products', entityType: 'featured_product_groups' },
    ]);
    const response = await PATCH(request('approve'), { params: Promise.resolve({ id: '4' }) });
    expect(response.status).toBe(200);
    expect(mocks.mutationAccess).toHaveBeenCalledWith('assets');
    expect(mocks.reviewAdmin).toHaveBeenCalled();
  });

  it('requires pricing apply access for a discount proposal', async () => {
    mocks.proposalRow.mockResolvedValue([{ type: 'product_discount', entityType: 'products' }]);
    const response = await PATCH(request('approve'), { params: Promise.resolve({ id: '4' }) });
    expect(response.status).toBe(200);
    expect(mocks.aiAccess).toHaveBeenCalledWith('ai_pricing_apply');
  });

  it('uses brands and categories access for taxonomy creation', async () => {
    mocks.proposalRow.mockResolvedValue([{ type: 'entity_create', entityType: 'categories' }]);
    const response = await PATCH(request('approve'), { params: Promise.resolve({ id: '4' }) });
    expect(response.status).toBe(200);
    expect(mocks.mutationAccess).toHaveBeenCalledWith('brandsCategories');
    expect(mocks.reviewAdmin).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'admin@example.com',
        actorName: 'Admin',
      }),
    );
  });

  it('requires AI apply and normal product-write access for approval', async () => {
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
    expect(mocks.aiAccess).toHaveBeenCalledWith('ai_catalog_apply');
    expect(mocks.mutationAccess).toHaveBeenCalledWith('products');
    expect(mocks.revalidateProducts).toHaveBeenCalled();
    expect(mocks.refreshFeed).toHaveBeenCalled();
  });

  it('allows rejection with proposal permission and no product mutation permission', async () => {
    mocks.review.mockResolvedValue({ id: 4, status: 'rejected' });
    const response = await PATCH(request('reject'), { params: Promise.resolve({ id: '4' }) });
    expect(response.status).toBe(200);
    expect(mocks.aiAccess).toHaveBeenCalledWith('ai_catalog_propose');
    expect(mocks.mutationAccess).not.toHaveBeenCalled();
    expect(mocks.revalidateProducts).not.toHaveBeenCalled();
  });
});
