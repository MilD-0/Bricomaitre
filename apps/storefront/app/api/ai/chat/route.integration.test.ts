import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  provider: 'openrouter' as 'openrouter' | 'experientiallabs',
  rateLimit: {
    ok: true,
    limit: 12,
    remaining: 11,
    resetAt: Date.now() + 60_000,
    retryAfterSeconds: 0,
  },
  settings: {
    phoneDisplay: '0795 34 28 26',
    phoneHref: 'tel:+213795342826',
    phoneEnabled: true,
    aiAssistantEnabled: true,
    contactEmail: null,
    address: null,
    mapUrl: null,
    facebookUrl: null,
    aiModel: 'openai/gpt-5.6-luna',
    aiFallbackModel: null as string | null,
  },
  streamOptions: null as Record<string, unknown> | null,
  streamParts: [] as Array<Record<string, unknown>>,
  streamAttempts: null as Array<Array<Record<string, unknown>>> | null,
  result: { products: [] as unknown[], cartMutations: [] as unknown[] },
  recordRun: vi.fn(),
  createLanguageModel: vi.fn(() => 'storefront-language-model'),
}));

vi.mock('@bric/ai-core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@bric/ai-core')>()),
  assertAiConfigured: vi.fn(),
  createAiLanguageModel: mocks.createLanguageModel,
  getAiConfig: () => ({
    enabled: true,
    provider: mocks.provider,
    apiKey: 'test-key',
    requestTimeoutMs: 30_000,
    maxRetries: 2,
  }),
}));

vi.mock('ai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('ai')>()),
  streamText: (options: Record<string, unknown>) => {
    mocks.streamOptions = options;
    const parts = mocks.streamAttempts?.shift() ?? mocks.streamParts;
    return {
      stream: (async function* () {
        for (const part of parts) yield part;
      })(),
    };
  },
  stepCountIs: () => 'bounded-steps',
}));

vi.mock('@/lib/shopping-assistant-rate-limit', () => ({
  enforceShoppingAssistantRateLimit: async () => mocks.rateLimit,
  shoppingAssistantRateLimitHeaders: () => ({ 'retry-after': '60' }),
}));

vi.mock('@/lib/shopping-assistant-tools', () => ({
  buildShoppingAssistantTools: () => ({
    tools: { search_catalog: { description: 'live catalog' } },
    result: () => mocks.result,
  }),
}));

vi.mock('@/lib/storefront-api', () => ({
  getStorefrontAssistantSettings: async () => mocks.settings,
  recordStorefrontAssistantRun: mocks.recordRun,
}));

import { POST } from './route';

function request(body: unknown) {
  return new NextRequest('http://localhost/api/ai/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function validBody() {
  return {
    locale: 'fr',
    messages: [{ role: 'user', content: 'Où est ma commande ?' }],
    context: {
      pathname: '/fr/thank-you',
      currentProductToken: null,
      currentLandingPageSlug: null,
      currentOrderToken: 'private-order-token-1234567890',
      catalogQuery: null,
      cartItems: [],
    },
    telemetry: {
      journeyId: 'journey-1',
      sessionId: 'session-1',
      pagePath: '/fr/thank-you',
    },
  };
}

describe('POST /api/ai/chat', () => {
  beforeEach(() => {
    mocks.provider = 'openrouter';
    mocks.rateLimit = {
      ok: true,
      limit: 12,
      remaining: 11,
      resetAt: Date.now() + 60_000,
      retryAfterSeconds: 0,
    };
    mocks.settings.aiAssistantEnabled = true;
    mocks.settings.aiFallbackModel = null;
    mocks.streamOptions = null;
    mocks.streamAttempts = null;
    mocks.streamParts = [
      { type: 'tool-call', toolName: 'search_catalog' },
      { type: 'tool-result', toolName: 'search_catalog' },
      { type: 'text-delta', text: 'Voici le résultat.' },
      {
        type: 'finish',
        totalUsage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      },
    ];
    mocks.result = { products: [], cartMutations: [] };
    mocks.recordRun.mockReset().mockResolvedValue(undefined);
    mocks.createLanguageModel.mockClear();
  });

  it('accepts the env-selected ExperientialLabs provider with existing model settings', async () => {
    mocks.provider = 'experientiallabs';
    const response = await POST(request(validBody()));
    expect(response.status).toBe(200);
    await response.text();
    expect(mocks.createLanguageModel).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'experientiallabs' }),
      'storefront',
      { model: 'openai/gpt-5.6-luna' },
    );
  });

  it('streams a model-led turn with the real tool surface and a redacted page context', async () => {
    const response = await POST(request(validBody()));

    expect(response.status).toBe(200);
    const events = (await response.text())
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(events).toEqual([
      { type: 'status', status: 'thinking' },
      { type: 'tool', name: 'search_catalog', status: 'started' },
      { type: 'tool', name: 'search_catalog', status: 'completed' },
      { type: 'text-delta', delta: 'Voici le résultat.' },
      { type: 'result', products: [], cartMutations: [] },
    ]);
    expect(mocks.streamOptions).toMatchObject({
      model: 'storefront-language-model',
      tools: { search_catalog: { description: 'live catalog' } },
      toolChoice: 'auto',
      stopWhen: 'bounded-steps',
    });
    const modelInput = JSON.stringify((mocks.streamOptions as { messages: unknown }).messages);
    expect(modelInput).toContain('linkedOrderAvailable');
    expect(modelInput).not.toContain('private-order-token');
    expect(mocks.recordRun).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'completed',
        model: 'openai/gpt-5.6-luna',
        toolCalls: 1,
        toolNames: ['search_catalog'],
      }),
    );
  });

  it('rejects invalid requests before invoking the model', async () => {
    const response = await POST(request({ locale: 'en', messages: [] }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'invalid_assistant_request' });
    expect(mocks.createLanguageModel).not.toHaveBeenCalled();
  });

  it('enforces the public rate limit and the configured assistant switch', async () => {
    mocks.rateLimit.ok = false;
    const limited = await POST(request(validBody()));
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBe('60');

    mocks.rateLimit.ok = true;
    mocks.settings.aiAssistantEnabled = false;
    const disabled = await POST(request(validBody()));
    expect(disabled.status).toBe(404);
    await expect(disabled.json()).resolves.toEqual({ error: 'assistant_disabled' });
  });

  it('never publishes buffered cart changes when generation fails', async () => {
    mocks.result = {
      products: [],
      cartMutations: [{ action: 'remove', productId: 12, quantity: 0 }],
    };
    mocks.streamParts = [{ type: 'error', error: new Error('provider failure') }];

    const response = await POST(request(validBody()));
    const events = (await response.text())
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(events.at(-1)).toEqual({ type: 'error', code: 'assistant_unavailable' });
    expect(events).not.toContainEqual(expect.objectContaining({ type: 'result' }));
    expect(mocks.recordRun).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed', cartChanges: 0 }),
    );
  });

  it('uses the configured fallback only before the primary emits text or calls a tool', async () => {
    mocks.settings.aiFallbackModel = 'openai/gpt-5.6-luna-fallback';
    mocks.streamAttempts = [
      [],
      [
        { type: 'text-delta', text: 'Réponse de secours.' },
        { type: 'finish', totalUsage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 } },
      ],
    ];

    const response = await POST(request(validBody()));
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('Réponse de secours.');
    expect(mocks.createLanguageModel).toHaveBeenNthCalledWith(1, expect.anything(), 'storefront', {
      model: 'openai/gpt-5.6-luna',
    });
    expect(mocks.createLanguageModel).toHaveBeenNthCalledWith(2, expect.anything(), 'storefront', {
      model: 'openai/gpt-5.6-luna-fallback',
    });
    expect(mocks.recordRun).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'completed', model: 'openai/gpt-5.6-luna-fallback' }),
    );
  });

  it('does not retry another model after a tool call has begun', async () => {
    mocks.settings.aiFallbackModel = 'openai/gpt-5.6-luna-fallback';
    mocks.streamAttempts = [
      [
        { type: 'tool-call', toolName: 'search_catalog' },
        { type: 'error', error: new Error('failed after tool call') },
      ],
    ];

    const response = await POST(request(validBody()));
    const events = (await response.text())
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(mocks.createLanguageModel).toHaveBeenCalledTimes(1);
    expect(events.at(-1)).toEqual({ type: 'error', code: 'assistant_unavailable' });
  });
});
