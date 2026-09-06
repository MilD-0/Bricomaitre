import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  getDb: vi.fn(),
  hasDb: vi.fn(),
  requireMutationAccess: vi.fn(),
  restore: vi.fn(),
  revalidateTags: vi.fn(),
  revalidateProducts: vi.fn(),
}));

vi.mock('@bric/db/client', () => ({ getDb: mocks.getDb, hasDb: mocks.hasDb }));
vi.mock('../../../../../../lib/auth', () => ({ auth: mocks.auth }));
vi.mock('../../../../../../lib/rbac', () => ({
  requireMutationAccess: mocks.requireMutationAccess,
}));
vi.mock('../../../../../../lib/product-update-workflow', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../../lib/product-update-workflow')>()),
  restoreProductThroughCanonicalWorkflow: mocks.restore,
}));
vi.mock('../../../../../../lib/server-cache', () => ({
  CACHE_TAGS: { products: 'products', productsMeta: 'products-meta' },
  revalidateServerTags: mocks.revalidateTags,
}));
vi.mock('../../../../../../lib/storefront-revalidate', () => ({
  revalidateStorefrontProducts: mocks.revalidateProducts,
}));

import { ProductMutationNotFoundError } from '../../../../../../lib/product-update-workflow';
import { POST } from '../route';

describe('POST /api/products/[id]/restore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasDb.mockReturnValue(true);
    mocks.getDb.mockReturnValue('database');
    mocks.requireMutationAccess.mockImplementation(async () => ({
      response: null,
      session: await mocks.auth(),
    }));
    mocks.auth.mockResolvedValue({ user: { email: 'admin@example.com', name: 'Admin' } });
    mocks.restore.mockResolvedValue({
      id: 21,
      title: 'Perceuse',
      active: false,
      inStock: false,
      availabilityStatus: 'out_of_stock',
      archived: false,
    });
    mocks.revalidateProducts.mockResolvedValue(undefined);
  });

  it('restores through the shared canonical workflow and refreshes product surfaces', async () => {
    const response = await POST(new Request('http://localhost/api/products/21/restore'), {
      params: Promise.resolve({ id: '21' }),
    });

    expect(response.status).toBe(200);
    expect(mocks.restore).toHaveBeenCalledWith('database', 21, {
      email: 'admin@example.com',
      name: 'Admin',
    });
    expect(mocks.revalidateTags).toHaveBeenCalledWith('products', 'products-meta');
    expect(mocks.revalidateProducts).toHaveBeenCalledOnce();
  });

  it('returns the canonical access, database, input, and missing-product failures', async () => {
    mocks.requireMutationAccess.mockImplementationOnce(async () => ({
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
      session: null,
    }));
    expect(
      (
        await POST(new Request('http://localhost/api/products/21/restore'), {
          params: Promise.resolve({ id: '21' }),
        })
      ).status,
    ).toBe(403);

    mocks.requireMutationAccess.mockImplementation(async () => ({
      response: null,
      session: await mocks.auth(),
    }));
    mocks.hasDb.mockReturnValueOnce(false);
    expect(
      (
        await POST(new Request('http://localhost/api/products/21/restore'), {
          params: Promise.resolve({ id: '21' }),
        })
      ).status,
    ).toBe(503);

    expect(
      (
        await POST(new Request('http://localhost/api/products/nope/restore'), {
          params: Promise.resolve({ id: 'nope' }),
        })
      ).status,
    ).toBe(400);

    mocks.restore.mockRejectedValueOnce(new ProductMutationNotFoundError(404));
    expect(
      (
        await POST(new Request('http://localhost/api/products/404/restore'), {
          params: Promise.resolve({ id: '404' }),
        })
      ).status,
    ).toBe(404);
  });
});
