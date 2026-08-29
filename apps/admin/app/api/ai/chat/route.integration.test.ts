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
  generateProductContent: vi.fn(),
  getProductContentJobStatus: vi.fn(),
  categorizeCatalog: vi.fn(),
  getCatalogCategorizationStatus: vi.fn(),
  adjustInventory: vi.fn(),
  scanInventory: vi.fn(),
  receiveInventory: vi.fn(),
  updateInventoryState: vi.fn(),
  manageTaxonomy: vi.fn(),
  inspectAssets: vi.fn(),
  manageAssets: vi.fn(),
  reorderAssets: vi.fn(),
  inspectLandingPages: vi.fn(),
  startLandingPageWork: vi.fn(),
  setLandingPageActive: vi.fn(),
  getLandingPageJobStatus: vi.fn(),
  queryOrders: vi.fn(),
  inspectOrders: vi.fn(),
  inspectEcotrackShipments: vi.fn(),
  createOrder: vi.fn(),
  updateOrderStatuses: vi.fn(),
  updateOrderDetails: vi.fn(),
  deleteOrders: vi.fn(),
  loadEcotrackRequirements: vi.fn(),
  previewEcotrackPosting: vi.fn(),
  startEcotrackPosting: vi.fn(),
  manageEcotrackShipments: vi.fn(),
  changeEcotrackShipments: vi.fn(),
  inspectShoppingList: vi.fn(),
  saveShoppingList: vi.fn(),
  applyShoppingListInventory: vi.fn(),
  issueTrackingLinks: vi.fn(),
  previewOrderExport: vi.fn(),
  startOrderExport: vi.fn(),
  inspectStorefrontConfiguration: vi.fn(),
  updateStorefrontSettings: vi.fn(),
  updateStorefrontAnnouncement: vi.fn(),
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
vi.mock('../../../../lib/admin-ai-product-jobs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../lib/admin-ai-product-jobs')>()),
  generateAdminAiProductContent: mocks.generateProductContent,
  getAdminAiProductContentJobStatus: mocks.getProductContentJobStatus,
  startAdminAiCatalogCategorization: mocks.categorizeCatalog,
  getAdminAiCatalogCategorizationStatus: mocks.getCatalogCategorizationStatus,
}));
vi.mock('../../../../lib/admin-ai-inventory', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../lib/admin-ai-inventory')>()),
  adjustAdminInventory: mocks.adjustInventory,
  scanAdminInventory: mocks.scanInventory,
  receiveAdminInventory: mocks.receiveInventory,
  updateAdminInventoryState: mocks.updateInventoryState,
}));
vi.mock('../../../../lib/admin-ai-taxonomy', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../lib/admin-ai-taxonomy')>()),
  manageAdminAiTaxonomy: mocks.manageTaxonomy,
}));
vi.mock('../../../../lib/admin-ai-assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../lib/admin-ai-assets')>()),
  inspectAdminAiAssets: mocks.inspectAssets,
  manageAdminAiAsset: mocks.manageAssets,
  reorderAdminAiAssets: mocks.reorderAssets,
}));
vi.mock('../../../../lib/admin-ai-landing-pages', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../lib/admin-ai-landing-pages')>()),
  inspectAdminAiLandingPages: mocks.inspectLandingPages,
  setAdminAiLandingPagePublication: mocks.setLandingPageActive,
}));
vi.mock('../../../../lib/admin-ai-landing-page-jobs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../lib/admin-ai-landing-page-jobs')>()),
  startAdminAiLandingPageWork: mocks.startLandingPageWork,
  getAdminAiLandingPageJobStatus: mocks.getLandingPageJobStatus,
}));
vi.mock('../../../../lib/admin-ai-order-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../lib/admin-ai-order-query')>()),
  queryAdminOrders: mocks.queryOrders,
  inspectAdminOrderDetails: mocks.inspectOrders,
}));
vi.mock('../../../../lib/admin-ai-ecotrack-shipments', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../lib/admin-ai-ecotrack-shipments')>()),
  inspectAdminAiEcotrackShipments: mocks.inspectEcotrackShipments,
  manageAdminAiEcotrackShipments: mocks.manageEcotrackShipments,
  changeAdminAiEcotrackShipments: mocks.changeEcotrackShipments,
}));
vi.mock('../../../../lib/admin-ai-orders', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../lib/admin-ai-orders')>()),
  createAdminAiOrder: mocks.createOrder,
  updateAdminOrderStatuses: mocks.updateOrderStatuses,
  updateAdminOrderDetailsFromTool: mocks.updateOrderDetails,
  deleteAdminAiOrders: mocks.deleteOrders,
}));
vi.mock('../../../../lib/admin-ai-ecotrack', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../lib/admin-ai-ecotrack')>()),
  loadAdminAiEcotrackRequirements: mocks.loadEcotrackRequirements,
  previewAdminAiEcotrackPosting: mocks.previewEcotrackPosting,
  startAdminAiEcotrackPosting: mocks.startEcotrackPosting,
}));
vi.mock('../../../../lib/admin-ai-shopping-list', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../lib/admin-ai-shopping-list')>()),
  inspectAdminAiShoppingList: mocks.inspectShoppingList,
  saveAdminAiShoppingList: mocks.saveShoppingList,
  applyAdminAiShoppingListInventory: mocks.applyShoppingListInventory,
}));
vi.mock('../../../../lib/admin-ai-order-tracking', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../lib/admin-ai-order-tracking')>()),
  issueAdminAiOrderTrackingLinks: mocks.issueTrackingLinks,
}));
vi.mock('../../../../lib/admin-ai-order-exports', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../lib/admin-ai-order-exports')>()),
  previewAdminAiOrderExport: mocks.previewOrderExport,
  startAdminAiOrderExport: mocks.startOrderExport,
}));
vi.mock('../../../../lib/admin-ai-storefront', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../lib/admin-ai-storefront')>()),
  inspectAdminStorefrontConfiguration: mocks.inspectStorefrontConfiguration,
  updateAdminStorefrontSettingsFromTool: mocks.updateStorefrontSettings,
  updateAdminStorefrontAnnouncement: mocks.updateStorefrontAnnouncement,
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

  it('exposes only Storefront configuration under settings permission', async () => {
    mocks.permissions = ['settings_manage'];
    mocks.inspectStorefrontConfiguration.mockResolvedValue({
      settings: { contactPhone: '0550000000', aiAssistantEnabled: true },
      announcement: { messageFr: 'Bienvenue', messageAr: 'مرحبا', active: true },
      configuredAiModels: ['openai/gpt-5.6-luna'],
    });
    mocks.updateStorefrontSettings.mockResolvedValue({ ok: true });
    mocks.updateStorefrontAnnouncement.mockResolvedValue({ ok: true });

    const response = await POST(
      request({ message: 'Check the Storefront configuration.', conversationKey }),
    );
    await response.text();
    const tools = (
      mocks.streamOptions as { tools: Record<string, { execute: (input: unknown) => unknown }> }
    ).tools;

    expect(Object.keys(tools)).toEqual([
      'read_system_guidance',
      'inspect_storefront_configuration',
      'update_storefront_settings',
      'update_storefront_announcement',
      'present_admin_ui',
    ]);
    expect(tools.read_system_guidance.execute({ topics: ['storefront'] })).toMatchObject({
      topics: [{ topic: 'storefront' }],
    });
    expect(() => tools.read_system_guidance.execute({ topics: ['orders'] })).toThrow();
    await expect(tools.inspect_storefront_configuration.execute({})).resolves.toMatchObject({
      configuredAiModels: ['openai/gpt-5.6-luna'],
    });
    await expect(
      tools.update_storefront_settings.execute({
        operations: [{ field: 'contactEmail', value: 'hello@bricomaitre.com' }],
      }),
    ).resolves.toEqual({ ok: true });
    await expect(
      tools.update_storefront_announcement.execute({
        messageFr: 'Bienvenue',
        messageAr: 'مرحبا',
        active: true,
      }),
    ).resolves.toEqual({ ok: true });

    expect(mocks.inspectStorefrontConfiguration).toHaveBeenCalledOnce();
    expect(mocks.updateStorefrontSettings).toHaveBeenCalledOnce();
    expect(mocks.updateStorefrontAnnouncement).toHaveBeenCalledWith(
      { messageFr: 'Bienvenue', messageAr: 'مرحبا', active: true },
      'operator@bricomaitre.com',
    );
  });

  it('exposes small asset tools and the progressive landing-page workflow', async () => {
    mocks.permissions = ['assets_write'];
    mocks.inspectAssets.mockResolvedValue({ kind: 'admin_assets', banners: { items: [] } });
    mocks.manageAssets.mockResolvedValue({ ok: true, operation: 'update' });
    mocks.reorderAssets.mockResolvedValue({
      ok: true,
      kind: 'banner',
      before: [1, 2],
      after: [2, 1],
    });
    mocks.inspectLandingPages.mockResolvedValue({
      kind: 'admin_landing_pages',
      view: 'summary',
      items: [],
    });
    mocks.startLandingPageWork.mockResolvedValue({
      kind: 'landing_page_job_started',
      ok: true,
    });
    mocks.setLandingPageActive.mockResolvedValue({ ok: true, changed: true });
    mocks.getLandingPageJobStatus.mockResolvedValue({
      kind: 'landing_page_job_status',
      job: null,
    });

    const response = await POST(
      request({ message: 'Check the Storefront assets.', conversationKey }),
    );
    await response.text();
    const tools = (
      mocks.streamOptions as { tools: Record<string, { execute: (input: unknown) => unknown }> }
    ).tools;

    expect(Object.keys(tools)).toEqual([
      'read_system_guidance',
      'find_products',
      'find_brands',
      'find_categories',
      'inspect_assets',
      'manage_assets',
      'reorder_assets',
      'inspect_landing_pages',
      'start_landing_page_work',
      'set_landing_page_active',
      'get_landing_page_job_status',
      'present_admin_ui',
    ]);
    expect(tools.read_system_guidance.execute({ topics: ['assets'] })).toMatchObject({
      topics: [{ topic: 'assets' }],
    });
    expect(tools.read_system_guidance.execute({ topics: ['landing_pages'] })).toMatchObject({
      topics: [{ topic: 'landing_pages' }],
    });
    expect(() => tools.read_system_guidance.execute({ topics: ['storefront'] })).toThrow();
    await expect(
      tools.inspect_assets.execute({ kind: 'banner', ids: [], active: true, limit: 20 }),
    ).resolves.toMatchObject({ kind: 'admin_assets' });
    await expect(
      tools.manage_assets.execute({
        operation: 'update',
        asset: { kind: 'banner', id: 1, changes: { active: false } },
      }),
    ).resolves.toMatchObject({ ok: true, operation: 'update' });
    await expect(
      tools.reorder_assets.execute({ kind: 'banner', orderedIds: [2, 1] }),
    ).resolves.toMatchObject({ ok: true, after: [2, 1] });
    await expect(tools.inspect_landing_pages.execute({ view: 'summary' })).resolves.toMatchObject({
      kind: 'admin_landing_pages',
    });
    await expect(
      tools.start_landing_page_work.execute({
        operation: 'create',
        productId: 12,
        locale: 'fr',
      }),
    ).resolves.toMatchObject({ kind: 'landing_page_job_started' });
    await expect(
      tools.set_landing_page_active.execute({
        landingPageId: 41,
        expectedRevision: 3,
        active: true,
      }),
    ).resolves.toMatchObject({ ok: true });
    await expect(tools.get_landing_page_job_status.execute({})).resolves.toMatchObject({
      kind: 'landing_page_job_status',
    });

    expect(mocks.manageAssets).toHaveBeenCalledWith(expect.any(Object), {
      email: 'operator@bricomaitre.com',
      name: 'Operator',
    });
    expect(mocks.startLandingPageWork).toHaveBeenCalledWith(expect.any(Object), {
      ownerKey: 'operator@bricomaitre.com',
      actor: { email: 'operator@bricomaitre.com', name: 'Operator' },
      conversationId: 101,
    });
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
      'inspect_order_shopping_list',
      'save_order_shopping_list',
      'get_order_tracking_links',
      'preview_order_export',
      'start_order_export',
      'create_order',
      'update_order_status',
      'update_order_details',
      'delete_orders',
      'load_ecotrack_requirements',
      'preview_ecotrack_posting',
      'post_orders_to_ecotrack',
      'manage_ecotrack_shipments',
      'change_ecotrack_shipments',
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
    mocks.scanInventory.mockResolvedValue({ kind: 'barcode', item: { id: 12 } });
    mocks.receiveInventory.mockResolvedValue({ ok: true, complete: true, items: [] });
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
      'scan_inventory',
      'receive_inventory',
      'update_inventory_state',
      'generate_product_content',
      'get_product_content_job_status',
      'categorize_catalog',
      'get_catalog_categorization_status',
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
    await expect(tools.scan_inventory.execute({ query: 'DRILL-12' })).resolves.toMatchObject({
      kind: 'barcode',
    });
    await expect(
      tools.receive_inventory.execute({
        source: 'barcode_scan',
        orderId: null,
        items: [{ productId: 12, quantity: 2 }],
      }),
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

  it('passes the operator auto-apply setting only to specific product generation jobs', async () => {
    mocks.permissions = ['products_write'];
    mocks.generateProductContent.mockResolvedValue({
      ok: true,
      kind: 'product_content_proposals',
    });
    mocks.getProductContentJobStatus.mockResolvedValue({
      kind: 'product_content_job_status',
      job: null,
    });
    mocks.categorizeCatalog.mockResolvedValue({
      ok: true,
      kind: 'catalog_categorization_job_started',
    });
    mocks.getCatalogCategorizationStatus.mockResolvedValue({
      kind: 'catalog_categorization_job_status',
      job: null,
    });

    const response = await POST(
      request({
        message: 'Generate missing Arabic content.',
        conversationKey,
        autoAcceptProposals: true,
      }),
    );
    await response.text();
    const tools = (
      mocks.streamOptions as {
        tools: Record<string, { description: string; execute: (input: unknown) => unknown }>;
      }
    ).tools;
    const context = {
      ownerKey: 'operator@bricomaitre.com',
      actor: { email: 'operator@bricomaitre.com', name: 'Operator' },
      conversationId: 101,
      autoApply: true,
    };

    expect(tools.generate_product_content.description).toContain('auto-apply is enabled');
    await expect(
      tools.generate_product_content.execute({
        scope: 'all_missing',
        productIds: [],
        fields: ['titleAr'],
      }),
    ).resolves.toMatchObject({ kind: 'product_content_proposals' });
    await expect(tools.get_product_content_job_status.execute({})).resolves.toMatchObject({
      kind: 'product_content_job_status',
    });
    await expect(
      tools.categorize_catalog.execute({
        scope: 'uncategorized',
        confidenceThreshold: 0.8,
        batchSize: 25,
      }),
    ).resolves.toMatchObject({ kind: 'catalog_categorization_job_started' });
    await expect(tools.get_catalog_categorization_status.execute({})).resolves.toMatchObject({
      kind: 'catalog_categorization_job_status',
    });

    expect(mocks.generateProductContent).toHaveBeenCalledWith(expect.any(Object), context);
    expect(mocks.categorizeCatalog).toHaveBeenCalledWith(expect.any(Object), context);
    expect(mocks.getProductContentJobStatus).toHaveBeenCalledWith('operator@bricomaitre.com');
    expect(mocks.getCatalogCategorizationStatus).toHaveBeenCalledWith('operator@bricomaitre.com');
  });

  it('executes native order support workflows with exact permission and job context', async () => {
    mocks.permissions = ['orders_write', 'products_write'];
    mocks.inspectShoppingList.mockResolvedValue({
      kind: 'order_shopping_list_preview',
      summary: { orderCount: 2 },
    });
    mocks.saveShoppingList.mockResolvedValue({ ok: true, action: 'created' });
    mocks.applyShoppingListInventory.mockResolvedValue({ ok: true, applied: [] });
    mocks.issueTrackingLinks.mockResolvedValue({ ok: true, items: [] });
    mocks.previewOrderExport.mockResolvedValue({ kind: 'order_export_preview', rowCount: 2 });
    mocks.startOrderExport.mockResolvedValue({ ok: true, kind: 'order_export_started' });

    const response = await POST(request({ message: 'Handle this support work.', conversationKey }));
    await response.text();
    const tools = (
      mocks.streamOptions as { tools: Record<string, { execute: (input: unknown) => unknown }> }
    ).tools;
    const actor = { email: 'operator@bricomaitre.com', name: 'Operator' };

    expect(tools.apply_order_shopping_list_inventory).toBeDefined();
    await expect(
      tools.inspect_order_shopping_list.execute({
        sourceMode: 'confirmed',
        orderIds: [],
        title: null,
        query: '',
        page: 1,
        limit: 25,
      }),
    ).resolves.toMatchObject({ kind: 'order_shopping_list_preview' });
    await expect(
      tools.save_order_shopping_list.execute({
        sourceMode: 'confirmed',
        orderIds: [],
        title: null,
      }),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      tools.apply_order_shopping_list_inventory.execute({
        sourceMode: 'confirmed',
        orderIds: [],
        selection: 'all',
        draftIds: [],
      }),
    ).resolves.toMatchObject({ ok: true });
    await expect(tools.get_order_tracking_links.execute({ orderIds: [91] })).resolves.toMatchObject(
      { ok: true },
    );
    await expect(
      tools.preview_order_export.execute({ mode: 'confirmed', orderIds: [] }),
    ).resolves.toMatchObject({ kind: 'order_export_preview' });
    await expect(
      tools.start_order_export.execute({ mode: 'confirmed', orderIds: [] }),
    ).resolves.toMatchObject({ kind: 'order_export_started' });

    expect(mocks.saveShoppingList).toHaveBeenCalledWith(expect.any(Object), actor);
    expect(mocks.applyShoppingListInventory).toHaveBeenCalledWith(expect.any(Object), actor);
    expect(mocks.issueTrackingLinks).toHaveBeenCalledWith({ orderIds: [91] }, 'en');
    expect(mocks.previewOrderExport).toHaveBeenCalledWith(expect.any(Object), expect.any(Date));
    expect(mocks.startOrderExport).toHaveBeenCalledWith(
      { mode: 'confirmed', orderIds: [] },
      { ownerKey: 'operator@bricomaitre.com', conversationId: 101 },
      expect.any(Date),
    );
  });

  it('executes order and EcoTrack actions through their canonical permission-scoped adapters', async () => {
    mocks.permissions = ['orders_write'];
    mocks.createOrder.mockResolvedValue({ ok: true, order: { id: 91 } });
    mocks.updateOrderStatuses.mockResolvedValue({ ok: true, items: [{ orderId: 91 }] });
    mocks.updateOrderDetails.mockResolvedValue({ ok: true, items: [{ id: 91 }] });
    mocks.deleteOrders.mockResolvedValue({ ok: true, deleted: [{ id: 92 }] });
    mocks.loadEcotrackRequirements.mockResolvedValue({ kind: 'ecotrack_requirements' });
    mocks.previewEcotrackPosting.mockResolvedValue({ kind: 'ecotrack_posting_preview' });
    mocks.startEcotrackPosting.mockResolvedValue({ ok: true, kind: 'ecotrack_posting_started' });
    mocks.manageEcotrackShipments.mockResolvedValue({ ok: true, action: 'dispatch' });
    mocks.changeEcotrackShipments.mockResolvedValue({ ok: true, items: [{ orderId: 91 }] });

    const response = await POST(request({ message: 'Handle these orders.', conversationKey }));
    await response.text();
    const tools = (
      mocks.streamOptions as { tools: Record<string, { execute: (input: unknown) => unknown }> }
    ).tools;
    const actor = { email: 'operator@bricomaitre.com', name: 'Operator' };

    await expect(
      tools.create_order.execute({
        firstName: null,
        lastName: null,
        email: null,
        phoneNumber1: '0555000000',
        phoneNumber2: null,
        productIds: [12],
        delivery: 'stop_desk',
        wilayaId: 16,
        commune: 'Alger Centre',
        homeAddress: null,
        note: null,
        promoCode: null,
      }),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      tools.update_order_status.execute({
        items: [{ orderId: 91, status: 'no_answer', noAnswerCount: 2 }],
      }),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      tools.update_order_details.execute({
        items: [{ orderId: 91, operations: [{ field: 'commune', value: 'Bab Ezzouar' }] }],
      }),
    ).resolves.toMatchObject({ ok: true });
    await expect(tools.delete_orders.execute({ orderIds: [92] })).resolves.toMatchObject({
      ok: true,
    });
    await expect(
      tools.load_ecotrack_requirements.execute({
        orderIds: [91],
        provider: 'delivro',
        providerMessage: 'commune invalide',
        wilayaId: 16,
        communeQuery: 'Bab Ezzouar',
      }),
    ).resolves.toMatchObject({ kind: 'ecotrack_requirements' });
    await expect(
      tools.preview_ecotrack_posting.execute({
        scope: 'selected',
        orderIds: [91],
        businessDate: null,
      }),
    ).resolves.toMatchObject({ kind: 'ecotrack_posting_preview' });
    await expect(
      tools.post_orders_to_ecotrack.execute({
        scope: 'selected',
        orderIds: [91],
        businessDate: null,
        provider: 'delivro',
      }),
    ).resolves.toMatchObject({ kind: 'ecotrack_posting_started' });
    await expect(
      tools.manage_ecotrack_shipments.execute({
        action: 'dispatch',
        orderIds: [91],
        askCollection: false,
      }),
    ).resolves.toMatchObject({ action: 'dispatch' });
    await expect(
      tools.change_ecotrack_shipments.execute({
        items: [
          {
            orderId: 91,
            mode: 'auto',
            operations: [{ field: 'commune', value: 'Bab Ezzouar' }],
          },
        ],
      }),
    ).resolves.toMatchObject({ ok: true });

    expect(mocks.createOrder).toHaveBeenCalledWith(expect.any(Object), actor);
    expect(mocks.updateOrderStatuses).toHaveBeenCalledWith(expect.any(Object), actor);
    expect(mocks.updateOrderDetails).toHaveBeenCalledWith(expect.any(Object), actor);
    expect(mocks.deleteOrders).toHaveBeenCalledWith({ orderIds: [92] }, actor);
    expect(mocks.previewEcotrackPosting).toHaveBeenCalledWith(expect.any(Object), {
      now: expect.any(Date),
    });
    expect(mocks.startEcotrackPosting).toHaveBeenCalledWith(expect.any(Object), {
      ownerKey: 'operator@bricomaitre.com',
      actor,
      conversationId: 101,
      now: expect.any(Date),
    });
    expect(mocks.manageEcotrackShipments).toHaveBeenCalledWith(expect.any(Object), actor);
    expect(mocks.changeEcotrackShipments).toHaveBeenCalledWith(expect.any(Object), actor);
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
