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
  cartValidation: vi.fn(),
  assets: vi.fn(),
  detail: vi.fn(),
  orderByToken: vi.fn(),
  ecotrackCatalog: vi.fn(),
  productPromo: vi.fn(),
  landingPage: vi.fn(),
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
  fetchStorefrontCartValidation: mocks.cartValidation,
  fetchStorefrontAssets: mocks.assets,
  fetchStorefrontProductDetail: mocks.detail,
  fetchStorefrontOrderByToken: mocks.orderByToken,
  getStorefrontEcotrackCatalog: mocks.ecotrackCatalog,
  fetchStorefrontProductPromo: mocks.productPromo,
  getStorefrontLandingPage: mocks.landingPage,
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
  return (await response.text())
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

describe('POST /api/ai/chat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rateLimit.mockResolvedValue({
      ok: true,
      limit: 12,
      remaining: 11,
      resetAt: Date.now() + 60_000,
      retryAfterSeconds: 0,
    });
    mocks.getConfig.mockReturnValue({ requestTimeoutMs: 5_000, maxRetries: 1 });
    mocks.resolveModel.mockReturnValue('storefront-model-id');
    mocks.createModel.mockReturnValue('storefront-model');
    mocks.catalog.mockResolvedValue({ items: [catalogProduct], total: 1_043 });
    mocks.meta.mockResolvedValue({
      brands: [{ id: 2, name: 'Bric Pro' }],
      categories: [{ id: 3, name: 'Perçage' }],
    });
    mocks.settings.mockResolvedValue({
      aiAssistantEnabled: true,
      aiModel: 'storefront-model-id',
      aiFallbackModel: null,
    });
    mocks.cartValidation.mockResolvedValue({ items: [catalogProduct] });
    mocks.orderByToken.mockResolvedValue(null);
    mocks.ecotrackCatalog.mockResolvedValue({
      wilayas: [{ wilayaId: 16, name: 'Alger' }],
      communes: [
        {
          communeId: 1,
          wilayaId: 16,
          name: 'Bab Ezzouar',
          postalCode: '16042',
          hasStopDesk: true,
        },
      ],
      serviceFees: [
        {
          serviceType: 'livraison',
          wilayaId: 16,
          homeFee: '600.00',
          stopDeskFee: '450.00',
        },
      ],
      weightFees: [],
      lastSync: null,
    });
    mocks.productPromo.mockResolvedValue({
      ok: true,
      promo: {
        code: 'SAVE10',
        productId: 12,
        originalPrice: 12_500,
        promoPrice: 11_000,
        discountAmount: 1_500,
      },
    });
    mocks.landingPage.mockResolvedValue(null);
    mocks.assets.mockResolvedValue({
      banners: [],
      featuredGroups: [],
      productCards: [
        {
          id: 5,
          productId: 12,
          titleAr: 'مثقاب خرسانة احترافي',
          titleFr: 'Perceuse béton Pro',
          descriptionAr: 'لأعمال الخرسانة',
          descriptionFr: 'Conçue pour les travaux de maçonnerie',
          characteristicsAr: ['ظرف 13 مم'],
          characteristicsFr: ['Mandrin 13 mm', 'Poignée auxiliaire'],
          sortOrder: 1,
          active: true,
          createdAt: '2026-07-01T00:00:00.000Z',
          updatedAt: '2026-07-01T00:00:00.000Z',
        },
      ],
    });
    mocks.recordRun.mockResolvedValue(undefined);
  });

  it('rejects invalid and rate-limited traffic before invoking the model', async () => {
    const invalid = await POST(request({ locale: 'en', messages: [] }));
    expect(invalid.status).toBe(400);

    mocks.rateLimit.mockResolvedValue({
      ok: false,
      limit: 12,
      remaining: 0,
      resetAt: Date.now() + 30_000,
      retryAfterSeconds: 30,
    });
    const limited = await POST(
      request({ locale: 'fr', messages: [{ role: 'user', content: 'Une perceuse' }] }),
    );
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBe('30');
    expect(mocks.createModel).not.toHaveBeenCalled();
  });

  it('fails closed before invoking AI when the admin disables the assistant', async () => {
    mocks.settings.mockResolvedValue({ aiAssistantEnabled: false });
    const response = await POST(
      request({ locale: 'fr', messages: [{ role: 'user', content: 'Une perceuse' }] }),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'assistant_disabled' });
    expect(mocks.createModel).not.toHaveBeenCalled();
    expect(mocks.catalog).not.toHaveBeenCalled();
  });

  it('grounds AI output in products returned by the canonical catalog tool', async () => {
    let catalogToolResult: unknown;
    mocks.streamText.mockImplementation(
      (options: {
        tools: {
          search_catalog: {
            execute: (input: {
              search: string;
              stock: 'all' | 'in' | 'out';
              page: number;
              limit: number;
            }) => Promise<unknown>;
          };
          present_products: {
            execute: (input: { productIds: number[] }) => Promise<unknown>;
          };
        };
      }) => ({
        stream: (async function* () {
          catalogToolResult = await options.tools.search_catalog.execute({
            search: 'perceuse béton',
            stock: 'in',
            page: 42,
            limit: 24,
          });
          await options.tools.present_products.execute({ productIds: [12] });
          yield { type: 'tool-call', toolName: 'search_catalog' };
          yield { type: 'tool-result', toolName: 'search_catalog' };
          yield { type: 'text-delta', text: 'Cette perceuse est disponible ' };
          yield { type: 'text-delta', text: 'et correspond à votre recherche.' };
          yield {
            type: 'finish',
            totalUsage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
          };
        })(),
      }),
    );

    const response = await POST(
      request({
        locale: 'fr',
        telemetry: {
          journeyId: 'journey-1',
          sessionId: 'session-1',
          pagePath: '/fr/products',
          intent: 'product_search',
        },
        messages: [{ role: 'user', content: 'Une perceuse pour le béton' }],
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/x-ndjson');
    const events = await streamEvents(response);
    expect(events[0]).toEqual({ type: 'status', status: 'thinking' });
    expect(events).toEqual(
      expect.arrayContaining([
        { type: 'tool', name: 'search_catalog', status: 'started' },
        { type: 'tool', name: 'search_catalog', status: 'completed' },
      ]),
    );
    expect(
      events
        .filter((event) => event.type === 'text-delta')
        .map((event) => event.delta)
        .join(''),
    ).toBe('Cette perceuse est disponible et correspond à votre recherche.');
    expect(events.at(-1)).toMatchObject({
      type: 'result',
      mode: 'ai',
      products: [{ id: 12, token: 'perceuse-beton', brand: 'Bric Pro', category: 'Perçage' }],
    });
    expect(mocks.createModel).toHaveBeenCalledWith(expect.anything(), 'storefront', {
      model: 'storefront-model-id',
    });
    expect(mocks.catalog).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'perceuse béton', stock: 'in', page: 42, limit: 24 }),
    );
    expect(catalogToolResult).toMatchObject({
      total: 1_043,
      page: 42,
      limit: 24,
      hasMore: true,
      products: [
        expect.objectContaining({
          title: 'Perceuse béton Pro',
          sku: 'PB-1',
          description: 'Conçue pour les travaux de maçonnerie',
          characteristics: ['Mandrin 13 mm', 'Poignée auxiliaire'],
        }),
      ],
    });
    expect(mocks.recordRun).toHaveBeenCalledWith(
      expect.objectContaining({
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
        conversation: [{ role: 'user', content: 'Une perceuse pour le béton' }],
        response: 'Cette perceuse est disponible et correspond à votre recherche.',
        promptVersion: 'storefront-shopping-v3',
      }),
    );
  });

  it('keeps full catalog tools available when current page context is already grounded', async () => {
    mocks.streamText.mockImplementation(() => ({
      stream: (async function* () {
        yield { type: 'text-delta', text: 'Voici une option disponible.' };
        yield { type: 'finish', totalUsage: { inputTokens: 8, outputTokens: 4, totalTokens: 12 } };
      })(),
    }));

    const response = await POST(
      request({
        locale: 'fr',
        context: {
          pathname: '/fr/products',
          currentProductToken: null,
          cartItems: [],
          catalogQuery: {
            search: 'lampe',
            brandId: null,
            categoryId: null,
            discounted: false,
            stock: 'all',
            minPrice: null,
            maxPrice: null,
            sortKey: 'recommended',
            sortDirection: 'desc',
            page: 1,
            limit: 24,
          },
        },
        messages: [{ role: 'user', content: 'Je cherche une perceuse pour le béton' }],
      }),
    );
    const events = await streamEvents(response);
    const modelOptions = mocks.streamText.mock.calls[0]?.[0] as Record<string, unknown>;

    expect(events.at(-1)).toMatchObject({ type: 'result', mode: 'ai', products: [{ id: 12 }] });
    expect(modelOptions).toHaveProperty('tools.search_catalog');
    expect(modelOptions).toHaveProperty('tools.inspect_products');
    expect(modelOptions).toHaveProperty('tools.inspect_order');
    expect(modelOptions).toHaveProperty('tools.inspect_delivery_support');
    expect(modelOptions).toHaveProperty('tools.inspect_promotion');
    expect(modelOptions).toHaveProperty('tools.present_products');
    expect(modelOptions.maxOutputTokens).toBe(900);
    expect(
      (modelOptions.prepareStep as (input: { stepNumber: number }) => unknown)({ stepNumber: 0 }),
    ).toEqual({
      activeTools: ['search_catalog'],
      toolChoice: { type: 'tool', toolName: 'search_catalog' },
    });
    expect(modelOptions.prompt).toContain('complete public catalog');
    expect(modelOptions.prompt).toContain('"total":1043');
    expect(modelOptions.prompt).toContain('Perceuse béton');
    expect(mocks.catalog).toHaveBeenCalledTimes(1);
  });

  it('grounds delivery fees, commune coverage, and contact help in current public data', async () => {
    mocks.settings.mockResolvedValue({
      aiAssistantEnabled: true,
      aiModel: 'storefront-model-id',
      aiFallbackModel: null,
      phoneDisplay: '0795 34 28 26',
      phoneHref: 'tel:+213795342826',
      phoneEnabled: true,
      contactEmail: 'support@example.com',
      address: 'Bab Ezzouar, Alger',
      mapUrl: 'https://maps.example.com/shop',
      facebookUrl: 'https://facebook.com/shop',
    });
    let inspected: unknown;
    mocks.streamText.mockImplementation(
      (options: {
        tools: {
          inspect_delivery_support: { execute: (input: { query: string }) => Promise<unknown> };
        };
      }) => ({
        stream: (async function* () {
          inspected = await options.tools.inspect_delivery_support.execute({
            query: 'Bab Ezzouar',
          });
          yield { type: 'tool-call', toolName: 'inspect_delivery_support' };
          yield { type: 'tool-result', toolName: 'inspect_delivery_support' };
          yield { type: 'text-delta', text: 'Livraison à domicile : 600 DZD.' };
          yield { type: 'finish', totalUsage: {} };
        })(),
      }),
    );

    const response = await POST(
      request({
        locale: 'fr',
        messages: [{ role: 'user', content: 'Quels sont les frais de livraison à Bab Ezzouar ?' }],
      }),
    );
    const events = await streamEvents(response);
    const modelOptions = mocks.streamText.mock.calls[0]?.[0] as Record<string, unknown>;

    expect(events).toEqual(
      expect.arrayContaining([
        { type: 'tool', name: 'inspect_delivery_support', status: 'started' },
        { type: 'tool', name: 'inspect_delivery_support', status: 'completed' },
      ]),
    );
    expect(
      (modelOptions.prepareStep as (input: { stepNumber: number }) => unknown)({ stepNumber: 0 }),
    ).toEqual({
      activeTools: ['inspect_delivery_support'],
      toolChoice: { type: 'tool', toolName: 'inspect_delivery_support' },
    });
    expect(inspected).toMatchObject({
      contact: { email: 'support@example.com' },
      matchedWilayas: [
        {
          name: 'Alger',
          fees: { homeDeliveryDzd: '600.00', stopDeskDzd: '450.00' },
          communes: [{ name: 'Bab Ezzouar', hasStopDesk: true }],
        },
      ],
    });
    expect(mocks.ecotrackCatalog).toHaveBeenCalledTimes(1);
  });

  it('validates promotion codes against every grounded product requested by the model', async () => {
    let inspected: unknown;
    mocks.streamText.mockImplementation(
      (options: {
        tools: {
          inspect_promotion: {
            execute: (input: { productIds: number[]; code: string }) => Promise<unknown>;
          };
        };
      }) => ({
        stream: (async function* () {
          inspected = await options.tools.inspect_promotion.execute({
            productIds: [12],
            code: 'SAVE10',
          });
          yield { type: 'tool-call', toolName: 'inspect_promotion' };
          yield { type: 'tool-result', toolName: 'inspect_promotion' };
          yield { type: 'text-delta', text: 'Le code réduit ce produit de 1 500 DZD.' };
          yield { type: 'finish', totalUsage: {} };
        })(),
      }),
    );

    const response = await POST(
      request({
        locale: 'fr',
        context: { pathname: '/fr/cart', cartItems: [{ productId: 12, quantity: 1 }] },
        messages: [{ role: 'user', content: 'Le code SAVE10 marche-t-il sur cet article ?' }],
      }),
    );
    const events = await streamEvents(response);
    const modelOptions = mocks.streamText.mock.calls[0]?.[0] as Record<string, unknown>;

    expect(events).toEqual(
      expect.arrayContaining([
        { type: 'tool', name: 'inspect_promotion', status: 'started' },
        { type: 'tool', name: 'inspect_promotion', status: 'completed' },
      ]),
    );
    expect(
      (modelOptions.prepareStep as (input: { stepNumber: number }) => unknown)({ stepNumber: 0 }),
    ).toEqual({
      activeTools: ['inspect_promotion'],
      toolChoice: { type: 'tool', toolName: 'inspect_promotion' },
    });
    expect(mocks.productPromo).toHaveBeenCalledWith(12, 'SAVE10');
    expect(inspected).toMatchObject({
      code: 'SAVE10',
      checks: [{ productId: 12, result: { ok: true, promo: { discountAmount: 1_500 } } }],
    });
  });

  it('refreshes the linked order and forces order grounding on the confirmation journey', async () => {
    const order = {
      id: 84,
      confirmed: 7,
      noAnswerCount: 0,
      updatedAt: '2026-08-23T12:00:00.000Z',
      delivery: 0,
      state: 16,
      city: 'Alger',
      totalAmount: 18_000,
      orderProducts: [{ title: 'Perceuse béton', quantity: 1 }],
      statusHistory: [
        { id: 1, status: 7, noAnswerCount: 0, changedAt: '2026-08-23T12:00:00.000Z' },
      ],
    };
    mocks.orderByToken.mockResolvedValue(order);
    let inspected: unknown;
    mocks.streamText.mockImplementation(
      (options: { tools: { inspect_order: { execute: () => Promise<unknown> } } }) => ({
        stream: (async function* () {
          inspected = await options.tools.inspect_order.execute();
          yield { type: 'tool-call', toolName: 'inspect_order' };
          yield { type: 'tool-result', toolName: 'inspect_order' };
          yield { type: 'text-delta', text: 'Votre commande est en cours de livraison.' };
          yield {
            type: 'finish',
            totalUsage: { inputTokens: 12, outputTokens: 7, totalTokens: 19 },
          };
        })(),
      }),
    );

    const response = await POST(
      request({
        locale: 'fr',
        context: {
          pathname: '/fr/thank-you',
          currentOrderToken: 't'.repeat(32),
        },
        messages: [{ role: 'user', content: 'Où en est la livraison de ma commande ?' }],
      }),
    );
    const events = await streamEvents(response);
    const modelOptions = mocks.streamText.mock.calls[0]?.[0] as Record<string, unknown>;

    expect(events).toEqual(
      expect.arrayContaining([
        { type: 'tool', name: 'inspect_order', status: 'started' },
        { type: 'tool', name: 'inspect_order', status: 'completed' },
      ]),
    );
    expect(
      (modelOptions.prepareStep as (input: { stepNumber: number }) => unknown)({ stepNumber: 0 }),
    ).toEqual({
      activeTools: ['inspect_order'],
      toolChoice: { type: 'tool', toolName: 'inspect_order' },
    });
    expect(modelOptions.prompt).toContain('"statusLabelKey":"inDelivery"');
    expect(inspected).toMatchObject({
      id: 84,
      status: 7,
      statusLabelKey: 'inDelivery',
      city: 'Alger',
    });
    expect(mocks.orderByToken).toHaveBeenCalledTimes(2);
  });

  it('continues with the configured capability fallback when the primary model fails', async () => {
    mocks.settings.mockResolvedValue({
      aiAssistantEnabled: true,
      aiModel: 'primary-model',
      aiFallbackModel: 'fallback-model',
    });
    mocks.streamText
      .mockImplementationOnce(() => ({
        stream: (async function* () {
          yield { type: 'error', error: new Error('primary provider failed') };
        })(),
      }))
      .mockImplementationOnce(() => ({
        stream: (async function* () {
          yield { type: 'text-delta', text: 'Le modèle de secours répond.' };
          yield {
            type: 'finish',
            totalUsage: { inputTokens: 8, outputTokens: 5, totalTokens: 13 },
          };
        })(),
      }));

    const response = await POST(
      request({ locale: 'fr', messages: [{ role: 'user', content: 'Bonjour' }] }),
    );
    const events = await streamEvents(response);

    expect(events.at(-1)).toMatchObject({ type: 'result', mode: 'ai', products: [] });
    expect(mocks.createModel).toHaveBeenNthCalledWith(1, expect.anything(), 'storefront', {
      model: 'primary-model',
    });
    expect(mocks.createModel).toHaveBeenNthCalledWith(2, expect.anything(), 'storefront', {
      model: 'fallback-model',
    });
    expect(mocks.recordRun).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'completed', model: 'fallback-model' }),
    );
  });

  it('cancels provider generation and records the interrupted run when the shopper stops', async () => {
    let providerSignal: AbortSignal | undefined;
    mocks.streamText.mockImplementation((options: { abortSignal: AbortSignal }) => {
      providerSignal = options.abortSignal;
      return {
        stream: (async function* () {
          await new Promise<void>((_resolve, reject) => {
            if (options.abortSignal.aborted) {
              reject(new DOMException('Aborted', 'AbortError'));
              return;
            }
            options.abortSignal.addEventListener(
              'abort',
              () => reject(new DOMException('Aborted', 'AbortError')),
              { once: true },
            );
          });
          yield { type: 'text-delta', text: 'unreachable' };
        })(),
      };
    });

    const response = await POST(
      request({
        locale: 'fr',
        telemetry: {
          journeyId: 'journey-1',
          sessionId: 'session-1',
          pagePath: '/fr/products',
          intent: 'product_search',
        },
        messages: [{ role: 'user', content: 'Une perceuse' }],
      }),
    );
    const reader = response.body?.getReader();
    expect(reader).toBeDefined();
    await reader?.read();
    await reader?.cancel();

    await vi.waitFor(() => expect(providerSignal?.aborted).toBe(true));
    await vi.waitFor(() =>
      expect(mocks.recordRun).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'cancelled',
          conversation: [{ role: 'user', content: 'Une perceuse' }],
        }),
      ),
    );
  });

  it('degrades to localized, deterministic catalog results when AI is unavailable', async () => {
    mocks.getConfig.mockImplementation(() => {
      throw new Error('AI disabled');
    });

    const response = await POST(
      request({ locale: 'ar', messages: [{ role: 'user', content: 'مثقاب للخرسانة' }] }),
    );
    expect(response.status).toBe(200);
    const events = await streamEvents(response);
    expect(
      events
        .filter((event) => event.type === 'text-delta')
        .map((event) => event.delta)
        .join(''),
    ).toContain('الكتالوج');
    expect(events.at(-1)).toMatchObject({
      type: 'result',
      mode: 'fallback',
      products: [{ id: 12 }],
    });
    expect(mocks.recordRun).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        mode: 'fallback',
        model: 'unconfigured',
      }),
    );
  });
});
