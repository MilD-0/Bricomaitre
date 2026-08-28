import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
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
  queryAnalytics: vi.fn(),
  queryAiStats: vi.fn(),
  updateAnalyticsSettings: vi.fn(),
  manageAnalyticsCosts: vi.fn(),
  manageAnalyticsDayOverrides: vi.fn(),
  syncAnalyticsSource: vi.fn(),
  findProducts: vi.fn(),
  queryProducts: vi.fn(),
  inspectProducts: vi.fn(),
  inspectArchivedProducts: vi.fn(),
  findBrands: vi.fn(),
  findCategories: vi.fn(),
  createProduct: vi.fn(),
  updateProducts: vi.fn(),
  archiveProducts: vi.fn(),
  restoreProducts: vi.fn(),
  adjustInventory: vi.fn(),
  updateInventoryState: vi.fn(),
  manageTaxonomy: vi.fn(),
  queryOrders: vi.fn(),
  inspectOrders: vi.fn(),
  inspectEcotrackShipments: vi.fn(),
}));

vi.mock('@bric/ai-core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@bric/ai-core')>()),
  createAiLanguageModel: mocks.createLanguageModel,
  getAiConfig: () => ({
    enabled: true,
    provider: 'openrouter',
    requestTimeoutMs: 30_000,
    maxRetries: 2,
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
  stepCountIs: () => 'eight-step-stop',
  tool: (definition: unknown) => definition,
}));

vi.mock('@bric/db/client', () => ({
  hasDb: () => mocks.hasDb,
  getDb: () => ({
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
vi.mock('../../../../lib/rbac', () => ({ requireAppAccess: async () => mocks.denied }));
vi.mock('../../../../lib/ai-analytics', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../lib/ai-analytics')>()),
  queryAdminAnalytics: mocks.queryAnalytics,
}));
vi.mock('../../../../lib/admin-ai-ai-stats', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../lib/admin-ai-ai-stats')>()),
  queryAdminAiStats: mocks.queryAiStats,
}));
vi.mock('../../../../lib/admin-ai-analytics-actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../lib/admin-ai-analytics-actions')>()),
  updateAdminAiAnalyticsSettings: mocks.updateAnalyticsSettings,
  manageAdminAiAnalyticsCosts: mocks.manageAnalyticsCosts,
  manageAdminAiAnalyticsDayOverrides: mocks.manageAnalyticsDayOverrides,
  syncAdminAiAnalyticsSource: mocks.syncAnalyticsSource,
}));
vi.mock('../../../../lib/admin-ai-catalog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../lib/admin-ai-catalog')>()),
  findAdminCatalogProducts: mocks.findProducts,
  inspectAdminCatalogProducts: mocks.inspectProducts,
  inspectAdminArchivedCatalogProducts: mocks.inspectArchivedProducts,
}));
vi.mock('../../../../lib/admin-ai-catalog-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../lib/admin-ai-catalog-query')>()),
  queryAdminCatalogProducts: mocks.queryProducts,
  queryAdminBrands: mocks.findBrands,
  queryAdminCategories: mocks.findCategories,
}));
vi.mock('../../../../lib/admin-ai-products', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../lib/admin-ai-products')>()),
  createAdminAiProduct: mocks.createProduct,
  updateAdminAiProducts: mocks.updateProducts,
  archiveAdminAiProducts: mocks.archiveProducts,
  restoreAdminAiProducts: mocks.restoreProducts,
}));
vi.mock('../../../../lib/admin-ai-inventory', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../lib/admin-ai-inventory')>()),
  adjustAdminInventory: mocks.adjustInventory,
  updateAdminInventoryState: mocks.updateInventoryState,
}));
vi.mock('../../../../lib/admin-ai-taxonomy', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../lib/admin-ai-taxonomy')>()),
  manageAdminAiTaxonomy: mocks.manageTaxonomy,
}));
vi.mock('../../../../lib/admin-ai-order-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../lib/admin-ai-order-query')>()),
  queryAdminOrders: mocks.queryOrders,
  inspectAdminOrderDetails: mocks.inspectOrders,
}));
vi.mock('../../../../lib/admin-ai-ecotrack-shipments', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../lib/admin-ai-ecotrack-shipments')>()),
  inspectAdminAiEcotrackShipments: mocks.inspectEcotrackShipments,
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

  it('lets the model combine conceptual and live evidence without a preflight plan', async () => {
    mocks.permissions = ['analytics_manage'];
    const response = await POST(
      request({
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
      }),
    );
    const body = events(await response.text());
    const options = mocks.streamOptions as {
      instructions: string;
      messages: Array<{ role: string; content: string }>;
      tools: Record<string, { execute?: (input: unknown) => unknown }>;
      prepareStep?: unknown;
      toolChoice: string;
      stopWhen: unknown;
    };

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/x-ndjson');
    expect(Object.keys(options.tools)).toEqual([
      'read_system_guidance',
      'query_analytics',
      'query_ai_stats',
      'update_analytics_settings',
      'manage_analytics_costs',
      'manage_analytics_day_overrides',
      'sync_analytics_source',
      'present_admin_ui',
    ]);
    expect(options.prepareStep).toBeUndefined();
    expect(options.toolChoice).toBe('auto');
    expect(options.stopWhen).toBe('eight-step-stop');
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

  it('exposes canonical tools as independent building blocks chosen by the model', async () => {
    mocks.permissions = ['analytics_manage'];
    mocks.queryAnalytics.mockResolvedValue({ kind: 'analytics2', view: 'money' });
    mocks.queryAiStats.mockResolvedValue({ kind: 'ai_stats', surface: 'operations' });
    const response = await POST(request({ message: 'Investigate this.', conversationKey }));
    await response.text();
    const tools = (
      mocks.streamOptions as { tools: Record<string, { execute: (input: unknown) => unknown }> }
    ).tools;

    expect(tools.read_system_guidance.execute({ topics: ['analytics_profit'] })).toMatchObject({
      kind: 'admin_system_guidance',
      topics: [{ topic: 'analytics_profit' }],
    });
    await expect(tools.query_analytics.execute({ view: 'money', range: '30d' })).resolves.toEqual({
      kind: 'analytics2',
      view: 'money',
    });
    await expect(
      tools.query_ai_stats.execute({
        surface: 'operations',
        date: { kind: 'rolling', period: '30d' },
      }),
    ).resolves.toEqual({ kind: 'ai_stats', surface: 'operations' });
    expect(mocks.queryAnalytics).toHaveBeenCalledWith({ view: 'money', range: '30d' });
    expect(mocks.queryAiStats).toHaveBeenCalledWith({
      surface: 'operations',
      date: { kind: 'rolling', period: '30d' },
    });
  });

  it('exposes canonical analytics mutations directly under analytics permission', async () => {
    mocks.permissions = ['analytics_manage'];
    mocks.updateAnalyticsSettings.mockResolvedValue({ kind: 'analytics_settings' });
    mocks.manageAnalyticsCosts.mockResolvedValue({ kind: 'analytics_costs' });
    mocks.manageAnalyticsDayOverrides.mockResolvedValue({ kind: 'analytics_day_overrides' });
    mocks.syncAnalyticsSource.mockResolvedValue({ kind: 'analytics_sync' });
    const response = await POST(
      request({ message: 'Make these analytics changes.', conversationKey }),
    );
    await response.text();
    const tools = (
      mocks.streamOptions as { tools: Record<string, { execute: (input: unknown) => unknown }> }
    ).tools;

    await expect(
      tools.update_analytics_settings.execute({ planningReturnRate: 24 }),
    ).resolves.toEqual({ kind: 'analytics_settings' });
    await expect(
      tools.manage_analytics_costs.execute({
        operations: [
          {
            action: 'create',
            name: 'Warehouse',
            amountDzd: 50_000,
            period: 'monthly',
            startDate: '2026-08-01',
          },
        ],
      }),
    ).resolves.toEqual({ kind: 'analytics_costs' });
    await expect(
      tools.manage_analytics_day_overrides.execute({
        operations: [{ action: 'upsert', date: '2026-08-28', changes: { note: 'Count verified' } }],
      }),
    ).resolves.toEqual({ kind: 'analytics_day_overrides' });
    await expect(
      tools.sync_analytics_source.execute({
        source: 'meta',
        since: '2026-08-01',
        until: '2026-08-28',
      }),
    ).resolves.toEqual({ kind: 'analytics_sync' });

    expect(mocks.updateAnalyticsSettings).toHaveBeenCalledWith({ planningReturnRate: 24 });
    expect(mocks.manageAnalyticsCosts).toHaveBeenCalledOnce();
    expect(mocks.manageAnalyticsDayOverrides).toHaveBeenCalledOnce();
    expect(mocks.syncAnalyticsSource).toHaveBeenCalledOnce();
  });

  it('exposes order knowledge and reads independently from broader product access', async () => {
    mocks.permissions = ['orders_write'];
    mocks.findProducts.mockResolvedValue({ items: [{ id: 12, title: 'Perceuse' }], total: 1 });
    mocks.queryOrders.mockResolvedValue({ kind: 'orders', items: [{ id: 91 }] });
    mocks.inspectOrders.mockResolvedValue({ kind: 'order_details', items: [{ id: 91 }] });
    mocks.inspectEcotrackShipments.mockResolvedValue({ kind: 'ecotrack_shipments', items: [] });
    let response = await POST(request({ message: 'Find the Perceuse.', conversationKey }));
    await response.text();
    let tools = (
      mocks.streamOptions as { tools: Record<string, { execute: (input: unknown) => unknown }> }
    ).tools;

    expect(Object.keys(tools)).toEqual([
      'read_system_guidance',
      'find_products',
      'query_orders',
      'inspect_orders',
      'inspect_ecotrack_shipments',
      'present_admin_ui',
    ]);
    expect(tools.read_system_guidance.execute({ topics: ['catalog'] })).toMatchObject({
      topics: [{ topic: 'catalog' }],
    });
    expect(() => tools.read_system_guidance.execute({ topics: ['analytics_profit'] })).toThrow();
    expect(tools.read_system_guidance.execute({ topics: ['orders'] })).toMatchObject({
      topics: [{ topic: 'orders' }],
    });
    await expect(tools.find_products.execute({ query: 'Perceuse' })).resolves.toMatchObject({
      items: [{ id: 12 }],
    });
    await expect(
      tools.query_orders.execute({
        filters: [{ field: 'current_in_house_status', statuses: ['confirmed'] }],
      }),
    ).resolves.toMatchObject({ kind: 'orders', items: [{ id: 91 }] });
    await expect(tools.inspect_orders.execute({ orderIds: [91] })).resolves.toMatchObject({
      kind: 'order_details',
    });
    await expect(
      tools.inspect_ecotrack_shipments.execute({ scope: 'exact', orderIds: [91] }),
    ).resolves.toMatchObject({ kind: 'ecotrack_shipments' });

    mocks.permissions = ['products_write'];
    mocks.inspectProducts.mockResolvedValue({
      kind: 'catalog_products',
      requestedIds: [12],
      missingIds: [],
      items: [{ id: 12 }],
    });
    mocks.queryProducts.mockResolvedValue({ kind: 'catalog_query', items: [{ id: 12 }] });
    mocks.inspectArchivedProducts.mockResolvedValue({
      kind: 'archived_catalog_products',
      items: [{ id: 13 }],
    });
    mocks.findBrands.mockResolvedValue({ kind: 'brand_query', items: [] });
    mocks.findCategories.mockResolvedValue({ kind: 'category_query', items: [] });
    mocks.createProduct.mockResolvedValue({ ok: true, created: { id: 14 } });
    mocks.updateProducts.mockResolvedValue({ ok: true, updatedCount: 1 });
    mocks.archiveProducts.mockResolvedValue({ ok: true, archivedCount: 1 });
    mocks.restoreProducts.mockResolvedValue({ ok: true, restoredCount: 1 });
    mocks.adjustInventory.mockResolvedValue({ ok: true, items: [] });
    mocks.updateInventoryState.mockResolvedValue({ ok: true, updatedCount: 1 });
    response = await POST(request({ message: 'Check product 12.', conversationKey }));
    await response.text();
    tools = (
      mocks.streamOptions as { tools: Record<string, { execute: (input: unknown) => unknown }> }
    ).tools;

    expect(Object.keys(tools)).toEqual([
      'read_system_guidance',
      'find_products',
      'find_brands',
      'find_categories',
      'query_products',
      'inspect_products',
      'inspect_archived_products',
      'create_product',
      'update_products',
      'archive_products',
      'restore_products',
      'adjust_inventory',
      'update_inventory_state',
      'present_admin_ui',
    ]);
    await expect(
      tools.query_products.execute({ inventoryMax: 0, sortBy: 'title' }),
    ).resolves.toMatchObject({ kind: 'catalog_query' });
    await expect(tools.inspect_products.execute({ productIds: [12] })).resolves.toMatchObject({
      kind: 'catalog_products',
      items: [{ id: 12 }],
    });
    await expect(
      tools.inspect_archived_products.execute({ productIds: [13] }),
    ).resolves.toMatchObject({ kind: 'archived_catalog_products' });
    await expect(
      tools.create_product.execute({ title: 'New product', price: 100 }),
    ).resolves.toMatchObject({ ok: true, created: { id: 14 } });
    await expect(
      tools.update_products.execute({ items: [{ productId: 12, changes: { price: 110 } }] }),
    ).resolves.toMatchObject({ ok: true, updatedCount: 1 });
    await expect(tools.archive_products.execute({ productIds: [12] })).resolves.toMatchObject({
      archivedCount: 1,
    });
    await expect(tools.restore_products.execute({ productIds: [13] })).resolves.toMatchObject({
      restoredCount: 1,
    });
    await expect(
      tools.adjust_inventory.execute({ mode: 'increase', items: [{ productId: 12, quantity: 2 }] }),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      tools.update_inventory_state.execute({
        items: [{ productId: 12, operations: [{ field: 'inStock', value: false }] }],
      }),
    ).resolves.toMatchObject({ updatedCount: 1 });
    expect(mocks.inspectProducts).toHaveBeenCalledWith({ productIds: [12] });
    expect(mocks.createProduct).toHaveBeenCalledWith(
      { product: expect.objectContaining({ title: 'New product', price: 100 }) },
      { email: 'operator@bricomaitre.com', name: 'Operator' },
    );
  });

  it('exposes direct taxonomy changes only with taxonomy permission', async () => {
    mocks.permissions = ['brands_categories_write'];
    mocks.manageTaxonomy.mockResolvedValue({ ok: true, operation: 'create', result: { id: 8 } });
    const response = await POST(request({ message: 'Create this brand.', conversationKey }));
    await response.text();
    const tools = (
      mocks.streamOptions as { tools: Record<string, { execute: (input: unknown) => unknown }> }
    ).tools;

    expect(Object.keys(tools)).toEqual([
      'read_system_guidance',
      'find_products',
      'find_brands',
      'find_categories',
      'manage_taxonomy',
      'present_admin_ui',
    ]);
    await expect(
      tools.manage_taxonomy.execute({
        operation: 'create',
        entity: { kind: 'brand', data: { name: 'Atelier Pro' } },
      }),
    ).resolves.toMatchObject({ ok: true, operation: 'create' });
    expect(mocks.manageTaxonomy).toHaveBeenCalledWith(
      expect.objectContaining({ operation: 'create' }),
      { email: 'operator@bricomaitre.com', name: 'Operator' },
    );
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
    const response = await POST(request({ message: 'Explain this metric.', conversationKey }));
    const body = events(await response.text());

    expect(mocks.generateText).toHaveBeenCalledOnce();
    expect(body).toEqual(
      expect.arrayContaining([{ type: 'text-delta', delta: 'Recovered answer.' }]),
    );
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
});
