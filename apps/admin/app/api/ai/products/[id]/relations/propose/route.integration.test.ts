import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  mutationAccess: vi.fn(),
  hasDb: vi.fn(),
  auth: vi.fn(),
  propose: vi.fn(),
}));

vi.mock('../../../../../../../lib/rbac', () => ({ requireMutationAccess: mocks.mutationAccess }));
vi.mock('@bric/db/client', () => ({ hasDb: mocks.hasDb }));
vi.mock('../../../../../../../lib/auth', () => ({ auth: mocks.auth }));
vi.mock('../../../../../../../lib/ai-product-knowledge', () => ({
  AiProductNotFoundError: class AiProductNotFoundError extends Error {},
  UnsupportedProductRelationError: class UnsupportedProductRelationError extends Error {},
  proposeProductRelation: mocks.propose,
}));

import { POST } from './route';

function request(body: unknown) {
  return new NextRequest('http://localhost/api/ai/products/1/relations/propose', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

describe('admin product relation AI proposal route', () => {
  beforeEach(() => {
    mocks.mutationAccess.mockReset().mockResolvedValue(null);
    mocks.hasDb.mockReset().mockReturnValue(true);
    mocks.auth.mockReset().mockResolvedValue({ user: { email: 'admin@example.com' } });
    mocks.propose.mockReset().mockResolvedValue({ id: 9, status: 'proposed' });
  });

  it('derives proposal access from product management', async () => {
    mocks.mutationAccess.mockResolvedValue(
      NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    );

    const response = await POST(request({ targetProductId: 2 }), {
      params: Promise.resolve({ id: '1' }),
    });

    expect(response.status).toBe(403);
    expect(mocks.propose).not.toHaveBeenCalled();
  });

  it('rejects malformed proposal requests', async () => {
    const response = await POST(request({ targetProductId: 0 }), {
      params: Promise.resolve({ id: '1' }),
    });

    expect(response.status).toBe(400);
    expect(mocks.propose).not.toHaveBeenCalled();
  });

  it('rejects self-relations before spending model tokens', async () => {
    const response = await POST(request({ targetProductId: 1 }), {
      params: Promise.resolve({ id: '1' }),
    });

    expect(response.status).toBe(400);
    expect(mocks.propose).not.toHaveBeenCalled();
  });

  it('creates a proposal without applying the product relationship', async () => {
    const response = await POST(request({ targetProductId: 2, context: 'Check fitting size.' }), {
      params: Promise.resolve({ id: '1' }),
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ proposal: { id: 9, status: 'proposed' } });
    expect(mocks.propose).toHaveBeenCalledWith({
      sourceProductId: 1,
      targetProductId: 2,
      adminContext: 'Check fitting size.',
      actorId: 'admin@example.com',
    });
  });

  it('fails closed when AI is unavailable', async () => {
    mocks.propose.mockRejectedValue(new Error('AI is disabled'));

    const response = await POST(request({ targetProductId: 2 }), {
      params: Promise.resolve({ id: '1' }),
    });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: 'AI is disabled' });
  });

  it('rejects a generated relation when catalog evidence is too weak', async () => {
    const { UnsupportedProductRelationError } =
      await import('../../../../../../../lib/ai-product-knowledge');
    const error = new UnsupportedProductRelationError();
    error.message = 'Insufficient relationship evidence.';
    mocks.propose.mockRejectedValue(error);

    const response = await POST(request({ targetProductId: 2 }), {
      params: Promise.resolve({ id: '1' }),
    });

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      error: 'Insufficient relationship evidence.',
    });
  });
});
