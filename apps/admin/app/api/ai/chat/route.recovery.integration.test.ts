import { APICallError } from 'ai';
import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

const mocks = vi.hoisted(() => ({
  provider: 'openrouter' as 'openrouter' | 'experientiallabs',
  authEmail: 'operator@bricomaitre.com' as string | null,
  denied: null as NextResponse | null,
  hasDb: true,
  permissions: [] as string[],
  selectResults: [] as unknown[][],
  insertedValues: [] as unknown[],
  updatedValues: [] as unknown[],
  streamOptions: null as Record<string, unknown> | null,
  streamParts: [] as Array<Record<string, unknown>>,
  streamCalls: 0,
  createLanguageModel: vi.fn(() => 'language-model'),
  generateText: vi.fn(),
  configOverrides: {} as Record<string, unknown>,
}));

vi.mock('@bric/ai-core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@bric/ai-core')>()),
  createAiLanguageModel: mocks.createLanguageModel,
  getAiConfig: () => ({
    enabled: true,
    provider: mocks.provider,
    maxRetries: 5,
    ...mocks.configOverrides,
  }),
}));

vi.mock('ai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('ai')>()),
  generateText: mocks.generateText,
  streamText: (options: Record<string, unknown>) => {
    mocks.streamCalls += 1;
    mocks.streamOptions = options;
    return {
      stream: (async function* () {
        for (const part of mocks.streamParts) yield part;
      })(),
    };
  },
  tool: (definition: unknown) => definition,
}));

vi.mock('@bric/db/client', () => ({
  hasDb: () => mocks.hasDb,
  getDb: () => ({
    async transaction<T>(operation: (tx: unknown) => Promise<T>): Promise<T> {
      return operation(this);
    },
    select: () => {
      const rows = mocks.selectResults.shift() ?? [];
      return {
        from: () => ({
          where: () => ({
            limit: async () => rows,
            orderBy: () => ({ limit: async () => rows }),
          }),
        }),
      };
    },
    insert: () => ({
      values: (values: unknown) => {
        mocks.insertedValues.push(values);
        return {
          returning: async () => {
            const record = values as Record<string, unknown>;
            if ('sessionKey' in record) return [{ id: 101, title: record.title }];
            if (record.task === 'admin_chat') return [{ id: 202 }];
            if (record.role === 'assistant') return [{ id: 303 }];
            return [{ id: 404 }];
          },
        };
      },
    }),
    update: () => ({
      set: (values: unknown) => {
        mocks.updatedValues.push(values);
        return { where: async () => undefined };
      },
    }),
  }),
}));

vi.mock('@/lib/auth', () => ({
  auth: async () => ({
    user: mocks.authEmail
      ? { email: mocks.authEmail, name: 'Operator', permissions: mocks.permissions }
      : undefined,
  }),
}));
vi.mock('@/lib/rbac', () => ({
  requireAppAccess: async () => {
    const response = mocks.denied;
    return {
      response,
      session: response ? null : await (await import('@/lib/auth')).auth(),
    };
  },
}));

const conversationKey = '8f572d91-3ed6-4ad5-b2a5-e1928a2c3c82';

function request(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/ai/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function events(value: string) {
  return value
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

describe('POST /api/ai/chat model-led runtime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.provider = 'openrouter';
    mocks.authEmail = 'operator@bricomaitre.com';
    mocks.denied = null;
    mocks.hasDb = true;
    mocks.permissions = [];
    mocks.selectResults = [[], []];
    mocks.insertedValues = [];
    mocks.updatedValues = [];
    mocks.streamOptions = null;
    mocks.configOverrides = {};
    mocks.streamParts = [
      { type: 'text-delta', text: 'A useful answer.' },
      {
        type: 'finish',
        totalUsage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 },
      },
    ];
    mocks.generateText.mockResolvedValue({
      text: 'Recovered answer.',
      usage: { inputTokens: 10, outputTokens: 3, totalTokens: 13 },
    });
  });

  it.each([
    [true, false],
    [false, false],
    [false, true],
  ])(
    'never hides committed effects when complete=%s and narration rejects=%s',
    async (complete, narrationRejects) => {
      mocks.streamCalls = 0;
      mocks.permissions = ['products_write'];
      mocks.streamParts = [
        {
          type: 'tool-call',
          toolCallId: 'tool-1',
          toolName: 'adjust_inventory',
          input: { mode: 'increase', items: [{ productId: 12, quantity: 1 }] },
        },
        {
          type: 'tool-result',
          toolCallId: 'tool-1',
          toolName: 'adjust_inventory',
          input: { mode: 'increase', items: [{ productId: 12, quantity: 1 }] },
          output: {
            ok: complete,
            items: [{ productId: 12, previousQuantity: 2, nextQuantity: 3 }],
            skipped: complete ? [] : [{ productId: 13, reason: 'insufficient_stock' }],
          },
        },
      ];
      mocks.generateText.mockResolvedValueOnce({
        text: '',
        usage: { inputTokens: 10, outputTokens: 0, totalTokens: 10 },
      });

      if (narrationRejects)
        mocks.generateText.mockReset().mockRejectedValueOnce(new Error('Narration unavailable'));
      const response = await POST(request({ message: 'Add one unit.', conversationKey }));
      const body = events(await response.text());

      expect(mocks.streamCalls).toBe(1);
      expect(JSON.stringify(body)).not.toContain('I retrieved the application data');
      expect(body).toEqual(
        expect.arrayContaining([
          {
            type: 'text-delta',
            delta: `1 item(s) applied, ${complete ? 0 : 1} skipped or failed. Changes were saved, but I couldn't finish the report. Review each action result before retrying only the failed items.`,
          },
          expect.objectContaining({
            type: 'result',
            toolResults: [expect.objectContaining({ toolName: 'adjust_inventory' })],
          }),
        ]),
      );
    },
  );

  it('keeps failed tool outcomes in durable evidence for later reasoning', async () => {
    mocks.permissions = ['analytics_manage'];
    mocks.streamParts = [
      {
        type: 'tool-call',
        toolCallId: 'tool-1',
        toolName: 'query_analytics',
        input: { view: 'money', range: '30d' },
      },
      {
        type: 'tool-error',
        toolCallId: 'tool-1',
        toolName: 'query_analytics',
        input: { view: 'money', range: '30d' },
        error: new Error('Analytics unavailable'),
      },
      { type: 'text-delta', text: 'Analytics is unavailable right now.' },
    ];

    const response = await POST(request({ message: 'Check profit.', conversationKey }));
    const body = events(await response.text());
    const failedToolOutcome = {
      type: 'tool-error',
      toolCallId: 'tool-1',
      toolName: 'query_analytics',
      input: { view: 'money', range: '30d' },
      errorCode: 'Error',
    };

    expect(body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'status', phase: 'failed' }),
        expect.objectContaining({ type: 'result', toolResults: [failedToolOutcome] }),
      ]),
    );
    expect(mocks.insertedValues).toContainEqual(
      expect.objectContaining({
        role: 'assistant',
        content: {
          text: 'Analytics is unavailable right now.',
          toolResults: [failedToolOutcome],
        },
      }),
    );
  });

  it('reports a permanent provider refusal without repeating the empty turn', async () => {
    mocks.streamCalls = 0;
    mocks.streamParts = [
      {
        type: 'error',
        error: new APICallError({
          message: 'Account restricted',
          url: 'https://provider.invalid',
          requestBodyValues: undefined,
          statusCode: 429,
          isRetryable: false,
        }),
      },
    ];
    const response = await POST(request({ message: 'Hello', conversationKey }));
    const body = events(await response.text());
    expect(mocks.streamCalls).toBe(1);
    expect(mocks.generateText).not.toHaveBeenCalled();
    expect(body).toContainEqual(
      expect.objectContaining({
        type: 'error',
        message:
          'The AI service rejected the request. Check the provider configuration and account limits.',
      }),
    );
  });

  it('persists an interrupted answer and returns the same durable message to the client', async () => {
    mocks.streamParts = [
      { type: 'text-delta', text: 'The partial answer' },
      { type: 'error', error: new Error('Provider disconnected') },
    ];

    const response = await POST(request({ message: 'Explain this.', conversationKey }));
    const body = events(await response.text());
    const failure = body.find((event) => event.type === 'error');

    expect(failure).toMatchObject({
      type: 'error',
      code: 'admin_ai_failed',
      message: 'The partial answer\n\nThis response stopped before completion.',
      messageId: 303,
      conversation: { id: 101, sessionKey: conversationKey },
    });
    expect(mocks.insertedValues).toContainEqual(
      expect.objectContaining({
        role: 'assistant',
        content: expect.objectContaining({
          text: 'The partial answer\n\nThis response stopped before completion.',
          outcome: { status: 'failed', errorCode: 'Error' },
        }),
      }),
    );
  });

  it('records a provider-aborted stream as cancelled instead of completed', async () => {
    mocks.streamParts = [{ type: 'abort', reason: 'Provider stopped the stream' }];

    const response = await POST(request({ message: 'Investigate this.', conversationKey }));
    const body = events(await response.text());

    expect(body).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'error', code: 'admin_ai_failed' })]),
    );
    expect(mocks.updatedValues).toContainEqual(
      expect.objectContaining({ status: 'cancelled', errorCode: 'request_aborted' }),
    );
    expect(mocks.insertedValues).toContainEqual(
      expect.objectContaining({
        role: 'assistant',
        content: expect.objectContaining({
          outcome: { status: 'cancelled', errorCode: 'request_aborted' },
        }),
      }),
    );
  });
});
