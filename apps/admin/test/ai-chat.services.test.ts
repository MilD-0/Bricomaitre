import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { afterAll, afterEach, expect, it, vi } from 'vitest';
import { getDb, getPool } from '@bric/db/client';
import { aiConversations, aiMessages, aiRuns } from '@bric/db/schema';

const state = vi.hoisted(() => ({ actor: '', finish: null as Promise<void> | null }));
vi.mock('../lib/auth', () => ({
  auth: async () => ({ user: { email: state.actor, permissions: [] } }),
}));
vi.mock('../lib/rbac', () => ({ requireAppAccess: async () => null }));
vi.mock('@bric/ai-core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@bric/ai-core')>()),
  createAiLanguageModel: () => 'local-test-model',
  getAiConfig: () => ({ enabled: true, provider: 'openrouter', maxRetries: 0 }),
}));
vi.mock('ai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('ai')>()),
  streamText: () => ({
    stream: (async function* () {
      yield { type: 'text-delta', text: 'A completed answer.' };
      if (state.finish) await state.finish;
      yield { type: 'finish', totalUsage: { inputTokens: 2, outputTokens: 3, totalTokens: 5 } };
    })(),
  }),
}));
import { POST } from '../app/api/ai/chat/route';

function request() {
  return new NextRequest('http://localhost/api/ai/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message: 'Explain this.', conversationKey: randomUUID() }),
  });
}

afterEach(async () => {
  vi.restoreAllMocks();
  state.finish = null;
  const db = getDb();
  await db.delete(aiRuns).where(eq(aiRuns.actorId, state.actor));
  await db.delete(aiConversations).where(eq(aiConversations.actorId, state.actor));
});
afterAll(async () => {
  await getPool().end();
});

it('rolls back answer plus conversation touch together when the terminal transaction fails', async () => {
  state.actor = `${randomUUID()}@example.invalid`;
  const db = getDb();
  const transaction = db.transaction.bind(db);
  let count = 0;
  vi.spyOn(db, 'transaction').mockImplementation(((callback, options) =>
    transaction(async (tx) => {
      const result = await callback(tx);
      if (++count === 2) throw new Error('Injected terminal transaction failure');
      return result;
    }, options)) as typeof db.transaction);
  const response = await POST(request());
  const events = (await response.text())
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  expect(events.find((event) => event.type === 'error')).toMatchObject({
    message: 'A completed answer.\n\nThis response stopped before completion.',
  });
  const [conversation] = await db
    .select()
    .from(aiConversations)
    .where(eq(aiConversations.actorId, state.actor));
  const messages = await db
    .select()
    .from(aiMessages)
    .where(eq(aiMessages.conversationId, conversation!.id));
  expect(messages.filter((message) => message.role === 'assistant')).toHaveLength(1);
  expect(messages.find((message) => message.role === 'assistant')?.content).toMatchObject({
    outcome: { status: 'failed' },
  });
});

it('does not create a failed duplicate when the client closes before the durable result is sent', async () => {
  state.actor = `${randomUUID()}@example.invalid`;
  let finish!: () => void;
  state.finish = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const response = await POST(request());
  const reader = response.body!.getReader();
  await reader.read();
  await reader.read();
  await reader.cancel();
  finish();
  const db = getDb();
  await vi.waitFor(async () => {
    const [run] = await db.select().from(aiRuns).where(eq(aiRuns.actorId, state.actor));
    expect(run?.status).toBe('completed');
  });
  const [conversation] = await db
    .select()
    .from(aiConversations)
    .where(eq(aiConversations.actorId, state.actor));
  const messages = await db
    .select()
    .from(aiMessages)
    .where(eq(aiMessages.conversationId, conversation!.id));
  const answers = messages.filter((message) => message.role === 'assistant');
  expect(answers).toHaveLength(1);
  expect(answers[0]?.content).toEqual({ text: 'A completed answer.', toolResults: [] });
});
