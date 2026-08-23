import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  conversationRows: [] as unknown[],
  messageRows: [] as unknown[],
  selectCount: 0,
  updatedValues: [] as unknown[],
  updateRows: [] as unknown[],
  deleteRows: [] as unknown[],
}));

vi.mock('@bric/db/client', () => ({
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
    update: () => ({
      set: (values: unknown) => {
        mocks.updatedValues.push(values);
        return { where: () => ({ returning: async () => mocks.updateRows }) };
      },
    }),
    delete: () => ({
      where: () => ({ returning: async () => mocks.deleteRows }),
    }),
  }),
}));
vi.mock('../../../../../lib/auth', () => ({
  auth: async () => ({ user: { email: 'owner@bricomaitre.com' } }),
}));
vi.mock('../../../../../lib/rbac', () => ({ requireAppAccess: async () => null }));

import { DELETE, GET, PATCH } from './route';

describe('GET /api/ai/conversations/:id', () => {
  beforeEach(() => {
    mocks.selectCount = 0;
    mocks.conversationRows = [];
    mocks.messageRows = [];
    mocks.updatedValues = [];
    mocks.updateRows = [];
    mocks.deleteRows = [];
  });

  it('returns only valid saved user and assistant messages', async () => {
    mocks.conversationRows = [
      {
        id: 8,
        sessionKey: 'key-8',
        title: 'Saved chat',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    mocks.messageRows = [
      { id: 72, role: 'tool', content: { result: true } },
      {
        id: 71,
        role: 'assistant',
        content: {
          text: 'Saved answer',
          feedback: 'helpful',
          toolResults: [
            { type: 'tool-result', toolName: 'inspect_inventory', output: { items: [] } },
          ],
        },
      },
      { id: 70, role: 'user', content: { text: 'Saved question' } },
    ];

    const response = await GET(new NextRequest('http://localhost/api/ai/conversations/8'), {
      params: Promise.resolve({ id: '8' }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        conversation: expect.objectContaining({ id: 8 }),
        messages: [
          { role: 'user', content: 'Saved question', messageRecordId: 70 },
          {
            role: 'assistant',
            content: 'Saved answer',
            messageRecordId: 71,
            feedback: 'helpful',
            toolResults: [
              { type: 'tool-result', toolName: 'inspect_inventory', output: { items: [] } },
            ],
          },
        ],
      }),
    );
  });

  it('does not expose a conversation outside the signed-in account query', async () => {
    const response = await GET(new NextRequest('http://localhost/api/ai/conversations/99'), {
      params: Promise.resolve({ id: '99' }),
    });

    expect(response.status).toBe(404);
  });

  it('renames an owned conversation', async () => {
    mocks.updateRows = [
      { id: 8, sessionKey: 'key-8', title: 'Weekly operations', updatedAt: new Date() },
    ];
    const response = await PATCH(
      new NextRequest('http://localhost/api/ai/conversations/8', {
        method: 'PATCH',
        body: JSON.stringify({ title: '  Weekly operations  ' }),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ id: '8' }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.updatedValues[0]).toMatchObject({ title: 'Weekly operations' });
    await expect(response.json()).resolves.toMatchObject({
      conversation: { id: 8, title: 'Weekly operations' },
    });
  });

  it('deletes an owned conversation and reports missing records', async () => {
    mocks.deleteRows = [{ id: 8 }];
    const deleted = await DELETE(new NextRequest('http://localhost/api/ai/conversations/8'), {
      params: Promise.resolve({ id: '8' }),
    });
    expect(deleted.status).toBe(200);
    await expect(deleted.json()).resolves.toEqual({ deleted: true, id: 8 });

    mocks.deleteRows = [];
    const missing = await DELETE(new NextRequest('http://localhost/api/ai/conversations/9'), {
      params: Promise.resolve({ id: '9' }),
    });
    expect(missing.status).toBe(404);
  });
});
