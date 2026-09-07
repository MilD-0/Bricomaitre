import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createProduct: vi.fn(),
  startOrderExport: vi.fn(),
  updateAnnouncement: vi.fn(),
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

import { buildAdminAiTools } from './admin-ai-tools';

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
