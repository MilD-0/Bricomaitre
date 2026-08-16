import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  hasDb: vi.fn(),
  auth: vi.fn(),
  propose: vi.fn(),
}));
vi.mock('../../../../../../../lib/rbac', () => ({ requireAiAccess: mocks.access }));
vi.mock('@bric/db/client', () => ({ hasDb: mocks.hasDb }));
vi.mock('../../../../../../../lib/auth', () => ({ auth: mocks.auth }));
vi.mock('../../../../../../../lib/ai-product-content', () => ({
  AiContentNotFoundError: class AiContentNotFoundError extends Error {},
  AiProposalConflictError: class AiProposalConflictError extends Error {},
  proposeProductContent: mocks.propose,
}));

import { POST } from './route';

describe('AI product content proposal route', () => {
  beforeEach(() => {
    mocks.access.mockReset().mockResolvedValue(null);
    mocks.hasDb.mockReset().mockReturnValue(true);
    mocks.auth.mockReset().mockResolvedValue({ user: { email: 'admin@example.com' } });
    mocks.propose.mockReset().mockResolvedValue({ id: 3, status: 'proposed' });
  });

  const request = (body: unknown) =>
    new NextRequest('http://localhost/api/ai/products/1/content/propose', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    });

  it('requires the AI catalog proposal permission', async () => {
    mocks.access.mockResolvedValue(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));
    const response = await POST(request({}), { params: Promise.resolve({ id: '1' }) });
    expect(response.status).toBe(403);
    expect(mocks.propose).not.toHaveBeenCalled();
  });

  it('creates a missing-content proposal without changing the product', async () => {
    const response = await POST(request({ fields: ['titleAr', 'descriptionAr'] }), {
      params: Promise.resolve({ id: '1' }),
    });
    expect(response.status).toBe(201);
    expect(mocks.propose).toHaveBeenCalledWith({
      productId: 1,
      fields: ['titleAr', 'descriptionAr'],
      adminContext: undefined,
      actorId: 'admin@example.com',
    });
  });

  it('rejects unsupported product fields', async () => {
    const response = await POST(request({ fields: ['price'] }), {
      params: Promise.resolve({ id: '1' }),
    });
    expect(response.status).toBe(400);
    expect(mocks.propose).not.toHaveBeenCalled();
  });
});
