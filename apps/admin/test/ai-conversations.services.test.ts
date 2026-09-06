import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { afterAll, expect, it, vi } from 'vitest';
import { getDb, getPool } from '@bric/db/client';
import { aiConversations, aiMessages } from '@bric/db/schema';

const session = vi.hoisted(() => ({ owner: '' }));
vi.mock('../lib/auth', () => ({ auth: async () => ({ user: { email: session.owner } }) }));
vi.mock('../lib/rbac', () => ({
  requireAppAccess: async () => ({
    response: null,
    session: await (await import('../lib/auth')).auth(),
  }),
}));

import { GET as list } from '../app/api/ai/conversations/route';
import {
  GET as detail,
  PATCH as rename,
  DELETE as remove,
} from '../app/api/ai/conversations/[id]/route';
import { PATCH as feedback } from '../app/api/ai/messages/[id]/feedback/route';

afterAll(async () => {
  await getPool().end();
});

it('enforces account and message-role boundaries throughout the saved conversation lifecycle', async () => {
  const db = getDb();
  const marker = randomUUID();
  session.owner = `${marker}@example.invalid`;
  const rows = await db
    .insert(aiConversations)
    .values([
      {
        surface: 'admin',
        actorId: session.owner,
        sessionKey: `${marker}-owned`,
        title: 'Owned chat',
      },
      {
        surface: 'admin',
        actorId: `foreign-${session.owner}`,
        sessionKey: `${marker}-foreign`,
        title: 'Private chat',
      },
      {
        surface: 'storefront',
        actorId: session.owner,
        sessionKey: `${marker}-storefront`,
        title: 'Other surface',
      },
    ])
    .returning();
  const [owned, foreign, storefront] = rows;
  try {
    const [question, answer, privateAnswer] = await db
      .insert(aiMessages)
      .values([
        {
          conversationId: owned!.id,
          role: 'user',
          content: { text: 'Find catalog gaps' },
          createdAt: new Date('2026-01-01T00:00:00Z'),
        },
        {
          conversationId: owned!.id,
          role: 'assistant',
          content: {
            text: 'Literal needle_%',
            terminal: true,
            jobId: 'job-42',
            toolResults: [{ toolName: 'inspect_inventory', output: { items: [] } }],
          },
          createdAt: new Date('2026-01-01T00:00:01Z'),
        },
        { conversationId: foreign!.id, role: 'assistant', content: { text: 'Private answer' } },
        {
          conversationId: storefront!.id,
          role: 'assistant',
          content: { text: 'Other surface answer' },
        },
        { conversationId: owned!.id, role: 'tool', content: { internal: true } },
      ])
      .returning();
    const context = (id: number) => ({ params: Promise.resolve({ id: String(id) }) });
    const request = (method = 'GET', body?: unknown) =>
      new NextRequest('http://localhost/api/ai/conversations', {
        method,
        ...(body === undefined
          ? {}
          : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
      });

    const listed = await (await list(request())).json();
    expect(listed.conversations.map((row: { id: number }) => row.id)).toEqual([owned!.id]);
    const searched = await (
      await list(new NextRequest('http://localhost/api/ai/conversations?q=needle_%25'))
    ).json();
    expect(searched.conversations.map((row: { id: number }) => row.id)).toEqual([owned!.id]);
    const escaped = await (
      await list(new NextRequest('http://localhost/api/ai/conversations?q=need_e'))
    ).json();
    expect(escaped.conversations).toEqual([]);

    const saved = await (await detail(request(), context(owned!.id))).json();
    expect(saved.messages).toEqual([
      { role: 'user', content: 'Find catalog gaps', messageRecordId: question!.id },
      {
        role: 'assistant',
        content: 'Literal needle_%',
        messageRecordId: answer!.id,
        terminal: true,
        jobId: 'job-42',
        toolResults: [{ toolName: 'inspect_inventory', output: { items: [] } }],
      },
    ]);
    for (const inaccessible of [foreign!, storefront!]) {
      expect((await detail(request(), context(inaccessible.id))).status).toBe(404);
      expect(
        (await rename(request('PATCH', { title: 'Forbidden rename' }), context(inaccessible.id)))
          .status,
      ).toBe(404);
      expect((await remove(request('DELETE'), context(inaccessible.id))).status).toBe(404);
    }
    for (const forbidden of [question!, privateAnswer!]) {
      expect(
        (await feedback(request('PATCH', { feedback: 'helpful' }), context(forbidden.id))).status,
      ).toBe(404);
      expect(
        (await db.select().from(aiMessages).where(eq(aiMessages.id, forbidden.id)))[0]!.content,
      ).toEqual(forbidden.content);
    }
    expect(
      (await feedback(request('PATCH', { feedback: 'not_helpful' }), context(answer!.id))).status,
    ).toBe(200);
    expect(
      (await db.select().from(aiMessages).where(eq(aiMessages.id, answer!.id)))[0]!.content,
    ).toMatchObject({
      ...(answer!.content as object),
      feedback: 'not_helpful',
      feedbackAt: expect.any(String),
    });
    expect(
      (await rename(request('PATCH', { title: '  Weekly operations  ' }), context(owned!.id)))
        .status,
    ).toBe(200);
    expect(
      (await db.select().from(aiConversations).where(eq(aiConversations.id, owned!.id)))[0]!.title,
    ).toBe('Weekly operations');
    expect((await remove(request('DELETE'), context(owned!.id))).status).toBe(200);
    expect(
      await db.select().from(aiMessages).where(eq(aiMessages.conversationId, owned!.id)),
    ).toEqual([]);
    expect((await remove(request('DELETE'), context(owned!.id))).status).toBe(404);
  } finally {
    await db.delete(aiConversations).where(
      inArray(
        aiConversations.id,
        rows.map((row) => row.id),
      ),
    );
  }
});
