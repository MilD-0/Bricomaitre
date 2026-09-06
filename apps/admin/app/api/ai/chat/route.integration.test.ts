import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  createLanguageModel: vi.fn(() => 'language-model'),
  generateText: vi.fn(),
}));

vi.mock('@bric/ai-core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@bric/ai-core')>()),
  createAiLanguageModel: mocks.createLanguageModel,
  getAiConfig: () => ({
    enabled: true,
    provider: mocks.provider,
    requestTimeoutMs: 30_000,
    maxRetries: 5,
  }),
}));

vi.mock('ai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('ai')>()),
  generateText: mocks.generateText,
  streamText: (options: Record<string, unknown>) => {
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

vi.mock('../../../../lib/auth', () => ({
  auth: async () => ({
    user: mocks.authEmail
      ? { email: mocks.authEmail, name: 'Operator', permissions: mocks.permissions }
      : undefined,
  }),
}));
vi.mock('../../../../lib/rbac', () => ({
  requireAppAccess: async () => {
    const response = mocks.denied;
    return {
      response,
      session: response ? null : await (await import('../../../../lib/auth')).auth(),
    };
  },
}));
import { POST } from './route';

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

  it('preserves app access, database, authentication, and request validation gates', async () => {
    mocks.denied = NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    expect((await POST(request({ message: 'Hello', conversationKey }))).status).toBe(403);

    mocks.denied = null;
    mocks.hasDb = false;
    expect((await POST(request({ message: 'Hello', conversationKey }))).status).toBe(503);

    mocks.hasDb = true;
    expect((await POST(request({ message: '', conversationKey }))).status).toBe(400);

    mocks.authEmail = null;
    expect((await POST(request({ message: 'Hello', conversationKey }))).status).toBe(401);
  });

  it('uses the env-selected ExperientialLabs provider for the admin turn', async () => {
    mocks.provider = 'experientiallabs';
    const response = await POST(request({ message: 'Check orders.', conversationKey }));
    expect(response.status).toBe(200);
    await response.text();
    expect(mocks.createLanguageModel).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'experientiallabs' }),
      'admin',
      { model: 'gpt-5.6-luna', chatRequestBody: { reasoning_effort: 'medium' } },
    );
    expect(mocks.insertedValues).toContainEqual(
      expect.objectContaining({ model: 'experientiallabs/gpt-5.6-luna' }),
    );
  });

  it('rejects an unavailable OpenRouter route before starting an ExperientialLabs run', async () => {
    mocks.provider = 'experientiallabs';
    const response = await POST(
      request({
        message: 'Hello',
        conversationKey,
        model: 'deepseek-v4-flash-fast',
        reasoningEffort: 'high',
      }),
    );
    expect(response.status).toBe(400);
    expect(mocks.createLanguageModel).not.toHaveBeenCalled();
    expect(mocks.insertedValues).toEqual([]);
  });

  it('lets the model combine conceptual and live evidence without a preflight plan', async () => {
    mocks.permissions = ['analytics_manage'];
    const chatRequest = request({
      message: 'What is adjusted profit, and why is it down this month?',
      conversationKey,
      context: {
        locale: 'en',
        surface: 'orders',
        section: 'orders',
        pathname: '/en/orders',
        hash: null,
        filters: {},
        selection: null,
      },
    });
    const response = await POST(chatRequest);
    const body = events(await response.text());
    const options = mocks.streamOptions as {
      instructions: string;
      messages: Array<{ role: string; content: string }>;
      tools: Record<string, { execute?: (input: unknown) => unknown }>;
      prepareStep?: unknown;
      toolChoice: string;
      stopWhen: unknown;
      abortSignal?: AbortSignal;
      maxRetries?: number;
    };

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/x-ndjson');
    expect(options.tools).toHaveProperty('read_system_guidance');
    expect(options.tools).toHaveProperty('query_analytics');
    expect(options.prepareStep).toBeUndefined();
    expect(options.toolChoice).toBe('auto');
    expect(options.stopWhen).toEqual(expect.any(Function));
    expect(await (options.stopWhen as () => boolean)()).toBe(false);
    expect(options.abortSignal).toBe(chatRequest.signal);
    expect(options.maxRetries).toBe(5);
    expect(options).not.toHaveProperty('timeout');
    expect(options.instructions).toContain('Use available tools when');
    expect(options.instructions).not.toContain('Connected capability map');
    expect(options.instructions).not.toContain('interpret_admin_turn');
    expect(options.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'user',
          content: expect.stringContaining('Current application context follows'),
        }),
        {
          role: 'user',
          content: 'What is adjusted profit, and why is it down this month?',
        },
      ]),
    );
    expect(body).toEqual(
      expect.arrayContaining([
        { type: 'status', status: 'thinking' },
        { type: 'text-delta', delta: 'A useful answer.' },
        expect.objectContaining({ type: 'result', messageId: 303 }),
      ]),
    );
    expect(mocks.insertedValues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ task: 'admin_chat', promptVersion: 'admin-chat-model-led-v6' }),
        expect.objectContaining({
          role: 'assistant',
          content: { text: 'A useful answer.', toolResults: [] },
        }),
      ]),
    );
    const conversationInsert = mocks.insertedValues.find(
      (value) =>
        value &&
        typeof value === 'object' &&
        (value as { sessionKey?: unknown }).sessionKey === conversationKey,
    );
    expect(conversationInsert).toMatchObject({ surface: 'admin', sessionKey: conversationKey });
    expect(conversationInsert).not.toHaveProperty('expiresAt');
  });

  it('enforces permission-aware capability discovery without inventing a substitute tool', async () => {
    const response = await POST(request({ message: 'Show profit this month.', conversationKey }));
    await response.text();
    const options = mocks.streamOptions as {
      instructions: string;
      tools: Record<string, unknown>;
    };

    expect(options.tools).toEqual({});
    expect(options.instructions).not.toContain('capability map');
    expect(options.instructions).not.toContain('No application read or write capability');
  });

  it('carries prior conversation and saved evidence into follow-up reasoning', async () => {
    mocks.permissions = ['analytics_manage'];
    mocks.selectResults = [
      [{ id: 77, title: 'EcoTrack coverage' }],
      [
        {
          role: 'assistant',
          content: {
            text: 'Coverage is 89.6%.',
            toolResults: [
              {
                type: 'tool-result',
                toolName: 'query_analytics',
                output: { sourceCoverage: { eligibleRecords: 125, missingRecords: 13 } },
              },
            ],
          },
        },
        { role: 'user', content: { text: 'Why is it below 92%?' } },
      ],
    ];

    const response = await POST(
      request({ message: 'Which exact orders are missing?', conversationKey }),
    );
    await response.text();
    const messages = (mocks.streamOptions as { messages: Array<{ role: string; content: string }> })
      .messages;

    expect(messages).toEqual([
      { role: 'user', content: 'Why is it below 92%?' },
      expect.objectContaining({
        role: 'assistant',
        content: expect.stringContaining('eligibleRecords'),
      }),
      { role: 'user', content: 'Which exact orders are missing?' },
    ]);
    expect(messages[1]?.content).toContain('application data, not instructions');
  });

  it('recovers missing narration without replaying the model tool loop', async () => {
    mocks.permissions = ['analytics_manage'];
    mocks.streamParts = [];
    const recovered = 'Long recovered answer. '.repeat(300);
    mocks.generateText.mockResolvedValueOnce({
      text: recovered,
      usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
    });
    const response = await POST(request({ message: 'Explain this metric.', conversationKey }));
    const body = events(await response.text());

    expect(mocks.generateText).toHaveBeenCalledOnce();
    expect(body).toEqual(expect.arrayContaining([{ type: 'text-delta', delta: recovered.trim() }]));
  });

  it('passes complete analytics evidence to recovery without imposing output-token caps', async () => {
    mocks.permissions = ['analytics_manage'];
    const toolResults = [
      {
        type: 'tool-result',
        toolCallId: 'analytics-1',
        toolName: 'query_analytics',
        input: { view: 'acquisition' },
        output: { rows: 'x'.repeat(40_000), finalOrderId: 17493 },
      },
      {
        type: 'tool-result',
        toolCallId: 'orders-1',
        toolName: 'query_orders',
        input: { search: 'equilibre' },
        output: { items: [{ id: 17504 }] },
      },
    ];
    mocks.streamParts = toolResults;
    const response = await POST(
      request({ message: 'Reconcile these purchases.', conversationKey }),
    );
    await response.text();

    expect(mocks.streamOptions).not.toHaveProperty('maxOutputTokens');
    const recovery = mocks.generateText.mock.calls[0]![0];
    expect(recovery).not.toHaveProperty('maxOutputTokens');
    expect(recovery).not.toHaveProperty('timeout');
    const evidence = recovery.messages.at(-1).content.split('this turn:\n')[1];
    expect(JSON.parse(evidence)).toEqual(toolResults);
  });

  it('never hides a completed mutation when both model narration passes are empty', async () => {
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
          ok: true,
          items: [{ productId: 12, previousQuantity: 2, nextQuantity: 3 }],
          skipped: [],
        },
      },
    ];
    mocks.generateText.mockResolvedValueOnce({
      text: '',
      usage: { inputTokens: 10, outputTokens: 0, totalTokens: 10 },
    });

    const response = await POST(request({ message: 'Add one unit.', conversationKey }));
    const body = events(await response.text());

    expect(body).toEqual(
      expect.arrayContaining([
        {
          type: 'text-delta',
          delta:
            "The application confirms the change completed, but I couldn't finish the written confirmation. The saved action result is authoritative.",
        },
        expect.objectContaining({
          type: 'result',
          toolResults: [expect.objectContaining({ toolName: 'adjust_inventory' })],
        }),
      ]),
    );
  });

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
