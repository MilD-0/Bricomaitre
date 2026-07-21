import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  conversationRows: [] as unknown[],
  messageRows: [] as unknown[],
  selectCount: 0,
}));

vi.mock('../../../../../db/client', () => ({
  hasDb: () => true,
  getDb: () => ({
    select: () => {
      mocks.selectCount += 1;
      const rows = mocks.selectCount === 1 ? mocks.conversationRows : mocks.messageRows;
      return {
        from: () => ({
          where: () => ({
            limit: async () => rows,
            orderBy: () => ({ limit: async () => rows }),
          }),
        }),
      };
    },
  }),
}));
vi.mock('../../../../../lib/auth', () => ({ auth: async () => ({ user: { email: 'owner@bricomaitre.com' } }) }));
vi.mock('../../../../../lib/rbac', () => ({ requireAiUseAccess: async () => null }));

import { GET } from './route';

describe('GET /api/ai/conversations/:id', () => {
  beforeEach(() => {
    mocks.selectCount = 0;
    mocks.conversationRows = [];
    mocks.messageRows = [];
  });

  it('returns only valid saved user and assistant messages', async () => {
    mocks.conversationRows = [{ id: 8, sessionKey: 'key-8', title: 'Saved chat', createdAt: new Date(), updatedAt: new Date() }];
    mocks.messageRows = [
      { role: 'user', content: { text: 'Saved question' } },
      { role: 'assistant', content: { text: 'Saved answer' } },
      { role: 'tool', content: { result: true } },
    ];

    const response = await GET(new NextRequest('http://localhost/api/ai/conversations/8'), { params: Promise.resolve({ id: '8' }) });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      conversation: expect.objectContaining({ id: 8 }),
      messages: [
        { role: 'user', content: 'Saved question' },
        { role: 'assistant', content: 'Saved answer' },
      ],
    }));
  });

  it('does not expose a conversation outside the signed-in account query', async () => {
    const response = await GET(new NextRequest('http://localhost/api/ai/conversations/99'), { params: Promise.resolve({ id: '99' }) });

    expect(response.status).toBe(404);
  });
});
