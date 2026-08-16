import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rows: [] as unknown[] }));

vi.mock('@bric/db/client', () => ({
  hasDb: () => true,
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({ limit: async () => mocks.rows }),
        }),
      }),
    }),
  }),
}));
vi.mock('../../../../lib/auth', () => ({
  auth: async () => ({ user: { email: 'owner@bricomaitre.com' } }),
}));
vi.mock('../../../../lib/rbac', () => ({ requireAiUseAccess: async () => null }));

import { GET } from './route';

describe('GET /api/ai/conversations', () => {
  beforeEach(() => {
    mocks.rows = [];
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

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      conversations: [expect.objectContaining({ id: 4, title: 'Catalog gaps' })],
    });
  });
});
