import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getConfig: vi.fn(),
  resolveModel: vi.fn(),
  createModel: vi.fn(),
  streamText: vi.fn(),
  rateLimit: vi.fn(),
  catalog: vi.fn(),
  meta: vi.fn(),
  detail: vi.fn(),
  settings: vi.fn(),
  recordRun: vi.fn(),
}));

vi.mock('@bric/ai-core', () => ({
  getAiConfig: mocks.getConfig,
  resolveAiModel: mocks.resolveModel,
  createAiLanguageModel: mocks.createModel,
}));
vi.mock('ai', () => ({
  streamText: mocks.streamText,
  stepCountIs: vi.fn(() => 'stop-condition'),
  tool: vi.fn((definition) => definition),
}));
vi.mock('@/lib/shopping-assistant-rate-limit', () => ({
  enforceShoppingAssistantRateLimit: mocks.rateLimit,
  shoppingAssistantRateLimitHeaders: vi.fn(() => ({ 'retry-after': '30' })),
}));
vi.mock('@/lib/storefront-api', () => ({
  fetchStorefrontCatalog: mocks.catalog,
  fetchStorefrontCatalogMeta: mocks.meta,
  fetchStorefrontProductDetail: mocks.detail,
  getStorefrontSettings: mocks.settings,
  recordStorefrontAssistantRun: mocks.recordRun,
}));

import { POST } from './route';

const catalogProduct = {
  id: 12,
  slug: 'perceuse-beton',
  mongoId: null,
  title: 'Perceuse béton',
  titleAr: 'مثقاب خرسانة',
  description: 'Pour percer la maçonnerie',
  descriptionAr: null,
  sku: 'PB-1',
  barcode: null,
  price: '12500.00',
  oldPrice: null,
  active: true,
  inStock: true,
  availabilityStatus: 'in_stock',
  inventoryQuantity: 4,
  brandId: 2,
  categoryId: 3,
  images: [],
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
};

function request(body: unknown) {
  return new NextRequest('http://localhost/api/ai/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-real-ip': '127.0.0.1' },
    body: JSON.stringify(body),
  });
}

async function streamEvents(response: Response) {
  return (await response.text()).trim().split('\n').map((line) => JSON.parse(line) as Record<string, unknown>);
}

describe('POST /api/ai/chat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rateLimit.mockResolvedValue({ ok: true, limit: 12, remaining: 11, resetAt: Date.now() + 60_000, retryAfterSeconds: 0 });
    mocks.getConfig.mockReturnValue({ requestTimeoutMs: 5_000, maxRetries: 1 });
    mocks.resolveModel.mockReturnValue('storefront-model-id');
    mocks.createModel.mockReturnValue('storefront-model');
    mocks.catalog.mockResolvedValue({ items: [catalogProduct], total: 1 });
    mocks.meta.mockResolvedValue({
      brands: [{ id: 2, name: 'Bric Pro' }],
      categories: [{ id: 3, name: 'Perçage' }],
    });
    mocks.settings.mockResolvedValue({ aiAssistantEnabled: true });
    mocks.recordRun.mockResolvedValue(undefined);
  });

  it('rejects invalid and rate-limited traffic before invoking the model', async () => {
    const invalid = await POST(request({ locale: 'en', messages: [] }));
    expect(invalid.status).toBe(400);

    mocks.rateLimit.mockResolvedValue({ ok: false, limit: 12, remaining: 0, resetAt: Date.now() + 30_000, retryAfterSeconds: 30 });
    const limited = await POST(request({ locale: 'fr', messages: [{ role: 'user', content: 'Une perceuse' }] }));
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBe('30');
    expect(mocks.createModel).not.toHaveBeenCalled();
  });

  it('fails closed before invoking AI when the admin disables the assistant', async () => {
    mocks.settings.mockResolvedValue({ aiAssistantEnabled: false });
    const response = await POST(request({ locale: 'fr', messages: [{ role: 'user', content: 'Une perceuse' }] }));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'assistant_disabled' });
    expect(mocks.createModel).not.toHaveBeenCalled();
    expect(mocks.catalog).not.toHaveBeenCalled();
  });

  it('grounds AI output in products returned by the canonical catalog tool', async () => {
    mocks.catalog.mockResolvedValueOnce({ items: [], total: 0 }).mockResolvedValue({ items: [catalogProduct], total: 1 });
    mocks.streamText.mockImplementation((options: {
      tools: { search_catalog: { execute: (input: { query: string; inStockOnly: boolean; limit: number }) => Promise<unknown> } };
    }) => ({
      stream: (async function* () {
        await options.tools.search_catalog.execute({ query: 'perceuse béton', inStockOnly: true, limit: 3 });
        yield { type: 'tool-call' };
        yield { type: 'text-delta', text: 'Cette perceuse est disponible ' };
        yield { type: 'text-delta', text: 'et correspond à votre recherche.' };
        yield { type: 'finish', totalUsage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 } };
      })(),
    }));

    const response = await POST(request({
      locale: 'fr',
      telemetry: {
        journeyId: 'journey-1',
        sessionId: 'session-1',
        pagePath: '/fr/products',
        intent: 'product_search',
      },
      messages: [{ role: 'user', content: 'Une perceuse pour le béton' }],
    }));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/x-ndjson');
    const events = await streamEvents(response);
    expect(events[0]).toEqual({ type: 'status', status: 'thinking' });
    expect(events.filter((event) => event.type === 'text-delta').map((event) => event.delta).join('')).toBe('Cette perceuse est disponible et correspond à votre recherche.');
    expect(events.at(-1)).toMatchObject({ type: 'result', mode: 'ai', products: [{ id: 12, token: 'perceuse-beton', brand: 'Bric Pro', category: 'Perçage' }] });
    expect(mocks.createModel).toHaveBeenCalledWith(expect.anything(), 'storefront');
    expect(mocks.catalog).toHaveBeenCalledWith(expect.objectContaining({ search: 'perceuse béton' }));
    expect(mocks.recordRun).toHaveBeenCalledWith(expect.objectContaining({
      telemetry: {
        journeyId: 'journey-1',
        sessionId: 'session-1',
        pagePath: '/fr/products',
        intent: 'product_search',
      },
      status: 'completed',
      mode: 'ai',
      model: 'storefront-model-id',
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
      toolCalls: 2,
      resultsCount: 1,
    }));
    expect(JSON.stringify(mocks.recordRun.mock.calls)).not.toContain('Une perceuse pour le béton');
  });

  it('skips the model planning round when a direct grounded catalog search succeeds', async () => {
    mocks.streamText.mockImplementation(() => ({
        stream: (async function* () {
          yield { type: 'text-delta', text: 'Voici une option disponible.' };
          yield { type: 'finish', totalUsage: { inputTokens: 8, outputTokens: 4, totalTokens: 12 } };
        })(),
      }));

    const response = await POST(request({ locale: 'fr', messages: [{ role: 'user', content: 'Une perceuse pour le béton' }] }));
    const events = await streamEvents(response);
    const modelOptions = mocks.streamText.mock.calls[0]?.[0] as Record<string, unknown>;

    expect(events.at(-1)).toMatchObject({ type: 'result', mode: 'ai', products: [{ id: 12 }] });
    expect(modelOptions).not.toHaveProperty('tools');
    expect(modelOptions.prompt).toContain('The application already searched the live catalog');
    expect(modelOptions.prompt).toContain('Perceuse béton');
    expect(mocks.catalog).toHaveBeenCalledTimes(1);
  });

  it('degrades to localized, deterministic catalog results when AI is unavailable', async () => {
    mocks.getConfig.mockImplementation(() => { throw new Error('AI disabled'); });

    const response = await POST(request({ locale: 'ar', messages: [{ role: 'user', content: 'مثقاب للخرسانة' }] }));
    expect(response.status).toBe(200);
    const events = await streamEvents(response);
    expect(events.filter((event) => event.type === 'text-delta').map((event) => event.delta).join('')).toContain('الكتالوج');
    expect(events.at(-1)).toMatchObject({ type: 'result', mode: 'fallback', products: [{ id: 12 }] });
    expect(mocks.recordRun).toHaveBeenCalledWith(expect.objectContaining({
      status: 'failed',
      mode: 'fallback',
      model: 'unconfigured',
    }));
  });
});
