import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  ownedRows: [] as Array<{ id: number }>,
  updatedRows: [] as Array<{ id: number }>,
  updatedValues: [] as unknown[],
}));

vi.mock('@bric/db/client', () => ({
  hasDb: () => true,
  getDb: () => ({
    select: () => ({
      from: () => ({
        innerJoin: () => ({ where: () => ({ limit: async () => mocks.ownedRows }) }),
      }),
    }),
    update: () => ({
      set: (values: unknown) => {
        mocks.updatedValues.push(values);
        return { where: () => ({ returning: async () => mocks.updatedRows }) };
      },
    }),
  }),
}));
vi.mock('../../../../../../lib/auth', () => ({
  auth: async () => ({ user: { email: 'owner@bricomaitre.com' } }),
}));
vi.mock('../../../../../../lib/rbac', () => ({ requireAppAccess: async () => null }));

import { PATCH } from './route';

describe('PATCH /api/ai/messages/:id/feedback', () => {
  beforeEach(() => {
    mocks.ownedRows = [];
    mocks.updatedRows = [];
    mocks.updatedValues = [];
  });

  it('stores feedback on an owned assistant message', async () => {
    mocks.ownedRows = [{ id: 71 }];
    mocks.updatedRows = [{ id: 71 }];
    const response = await PATCH(
      new NextRequest('http://localhost/api/ai/messages/71/feedback', {
        method: 'PATCH',
        body: JSON.stringify({ feedback: 'not_helpful' }),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ id: '71' }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.updatedValues).toHaveLength(1);
    await expect(response.json()).resolves.toMatchObject({
      messageId: 71,
      feedback: 'not_helpful',
      feedbackAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    });
  });

  it('does not update non-assistant or non-owned messages', async () => {
    const response = await PATCH(
      new NextRequest('http://localhost/api/ai/messages/71/feedback', {
        method: 'PATCH',
        body: JSON.stringify({ feedback: 'helpful' }),
      }),
      { params: Promise.resolve({ id: '71' }) },
    );

    expect(response.status).toBe(404);
    expect(mocks.updatedValues).toEqual([]);
  });
});
