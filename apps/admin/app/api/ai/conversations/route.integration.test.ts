import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rows: [] as unknown[], limits: [] as number[] }));

vi.mock('@bric/db/client', () => ({
  hasDb: () => true,
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({
            limit: async (limit: number) => {
              mocks.limits.push(limit);
              return mocks.rows;
            },
          }),
        }),
      }),
    }),
  }),
}));
vi.mock('../../../../lib/auth', () => ({
  auth: async () => ({ user: { email: 'owner@bricomaitre.com' } }),
}));
vi.mock('../../../../lib/rbac', () => ({ requireAppAccess: async () => null }));

import { GET } from './route';

describe('GET /api/ai/conversations', () => {
  beforeEach(() => {
    mocks.rows = [];
    mocks.limits = [];
  });

  it('returns the signed-in admin account conversations', async () => {
    mocks.rows = [
      {
        id: 4,
        sessionKey: 'key-4',
        title: 'Catalog gaps',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const response = await GET(new NextRequest('http://localhost/api/ai/conversations'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      conversations: [expect.objectContaining({ id: 4, title: 'Catalog gaps' })],
      query: '',
    });
  });

  it('accepts full-history search and a bounded result limit', async () => {
    const response = await GET(
      new NextRequest('http://localhost/api/ai/conversations?q=Arabic%20titles&limit=500'),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ query: 'Arabic titles' });
    expect(mocks.limits).toEqual([100]);
  });
});
