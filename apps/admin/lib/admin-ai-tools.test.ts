import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createProduct: vi.fn(),
  startOrderExport: vi.fn(),
  updateAnnouncement: vi.fn(),
  inspectShipments: vi.fn(),
}));

vi.mock('./admin-ai-products', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./admin-ai-products')>()),
  createAdminAiProduct: mocks.createProduct,
}));
vi.mock('./admin-ai-order-exports', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./admin-ai-order-exports')>()),
  startAdminAiOrderExport: mocks.startOrderExport,
}));
vi.mock('./admin-ai-storefront', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./admin-ai-storefront')>()),
  updateAdminStorefrontAnnouncement: mocks.updateAnnouncement,
}));
vi.mock('./admin-ai-ecotrack-shipments', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./admin-ai-ecotrack-shipments')>()),
  inspectAdminAiEcotrackShipments: mocks.inspectShipments,
}));

import { buildAdminAiTools } from './admin-ai-tools';
import { suites } from '../scripts/ai-eval-scenarios';
import { scenarioToolCoverage } from '../scripts/ai-eval-coverage';

const allPermissions = [
  'products_write',
  'orders_write',
  'assets_write',
  'brands_categories_write',
  'analytics_manage',
  'settings_manage',
] as const;

describe('Admin AI live tool construction', () => {
  beforeEach(() => vi.clearAllMocks());

  it('assigns every registered tool to an operator scenario without stale tool names', () => {
    const tools = buildAdminAiTools({
      permissions: allPermissions,
      locale: 'en',
      runtime: { kind: 'evaluation' },
    });
    const scenarios = Object.values(suites).flat();
    const expected = new Set(scenarios.flatMap((scenario) => scenario.expectedTools ?? []));
    expect([...expected].sort()).toEqual(Object.keys(tools).sort());
    expect(new Set(scenarios.map(({ id }) => id)).size).toBe(scenarios.length);
  });

  it('keeps missing calls and dry-run receipts distinct from verified writes', () => {
    expect(
      scenarioToolCoverage(
        ['query_orders', 'create_order', 'update_order_status'],
        [
          { toolName: 'query_orders', output: { items: [] } },
          { toolName: 'create_order', output: { kind: 'evaluation_noop', applied: false } },
        ],
      ),
    ).toEqual({
      expected: ['query_orders', 'create_order', 'update_order_status'],
      returned: ['create_order', 'query_orders'],
      dryRun: ['create_order'],
      missing: ['update_order_status'],
      writesVerified: false,
    });
  });

  it('constructs the tool surface directly from permissions', () => {
    expect(
      Object.keys(
        buildAdminAiTools({
          permissions: ['settings_manage'],
          locale: 'fr',
          runtime: { kind: 'evaluation' },
        }),
      ).sort(),
    ).toEqual(
      [
        'inspect_storefront_configuration',
        'present_admin_ui',
        'read_system_guidance',
        'update_storefront_announcement',
        'update_storefront_settings',
      ].sort(),
    );
    expect(
      buildAdminAiTools({ permissions: [], locale: 'en', runtime: { kind: 'evaluation' } }),
    ).toEqual({});
  });

  it('suppresses application mutations during evaluations', async () => {
    const tools = buildAdminAiTools({
      permissions: allPermissions,
      locale: 'en',
      runtime: { kind: 'evaluation' },
    }) as unknown as Record<string, { execute: (input: unknown) => Promise<unknown> }>;
    for (const [toolName, input] of [
      ['create_product', { title: 'Evaluation drill', price: 12_345 }],
      ['start_order_export', { mode: 'confirmed', orderIds: [] }],
      [
        'update_storefront_announcement',
        { messageFr: 'Bienvenue', messageAr: 'مرحبا', active: true },
      ],
      [
        'manage_off_pipeline_sales',
        {
          operations: [
            {
              action: 'create',
              requestId: '680ff81f-a911-4d9c-b07c-1459e560b56a',
              description: 'Evaluation sale',
              recognizedOn: '2026-09-01',
              amountCollectedDzd: 18_000,
              feesDzd: 500,
              productCostDzd: 11_000,
            },
          ],
        },
      ],
    ] as const) {
      await expect(tools[toolName]!.execute(input)).resolves.toMatchObject({
        kind: 'evaluation_noop',
        applied: false,
        receivedInput: input,
      });
    }
    expect(mocks.createProduct).not.toHaveBeenCalled();
    expect(mocks.startOrderExport).not.toHaveBeenCalled();
    expect(mocks.updateAnnouncement).not.toHaveBeenCalled();
    await tools.inspect_ecotrack_shipments!.execute({ scope: 'exact', orderIds: [91] });
    expect(mocks.inspectShipments).toHaveBeenCalledWith(
      { scope: 'exact', orderIds: [91] },
      { refresh: false },
    );
  });

  it('hands live actor and job context to canonical workflows', async () => {
    const actor = { email: 'operator@bricomaitre.com', name: 'Operator' };
    const now = new Date('2026-08-29T08:00:00.000Z');
    mocks.createProduct.mockResolvedValue({ ok: true });
    mocks.startOrderExport.mockResolvedValue({ ok: true });
    mocks.updateAnnouncement.mockResolvedValue({ ok: true });
    const tools = buildAdminAiTools({
      permissions: ['products_write', 'orders_write', 'settings_manage'],
      locale: 'en',
      now,
      runtime: {
        kind: 'live',
        exportOwnerKey: 'authenticated-user-id',
        actorId: actor.email,
        actor,
        conversationId: 101,
        autoAcceptProposals: false,
      },
    }) as unknown as Record<string, { execute: (input: unknown) => unknown }>;

    const product = { title: 'Evaluation drill', price: 12_345 };
    await tools.create_product.execute(product);
    await tools.inspect_ecotrack_shipments.execute({ scope: 'exact', orderIds: [91] });
    expect(mocks.inspectShipments).toHaveBeenCalledWith(
      { scope: 'exact', orderIds: [91] },
      { refresh: true },
    );
    await tools.start_order_export.execute({ mode: 'confirmed', orderIds: [] });
    await tools.update_storefront_announcement.execute({
      messageFr: 'Bienvenue',
      messageAr: 'مرحبا',
      active: true,
    });

    expect(mocks.createProduct).toHaveBeenCalledWith({ product }, actor);
    expect(mocks.startOrderExport).toHaveBeenCalledWith(
      { mode: 'confirmed', orderIds: [] },
      { ownerKey: 'authenticated-user-id', conversationId: 101 },
      now,
    );
    expect(mocks.updateAnnouncement).toHaveBeenCalledWith(
      { messageFr: 'Bienvenue', messageAr: 'مرحبا', active: true },
      actor.email,
    );
  });
});
