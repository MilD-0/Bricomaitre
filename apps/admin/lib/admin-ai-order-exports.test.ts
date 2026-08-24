import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  db: { marker: 'db' },
  loadOrderDetail: vi.fn(),
  loadOrdersPageData: vi.fn(),
  readCatalog: vi.fn(),
  startExport: vi.fn(),
}));

vi.mock('@bric/db/client', () => ({ getDb: () => mocks.db }));
vi.mock('./admin-orders-data', () => ({
  loadOrderDetail: mocks.loadOrderDetail,
  loadOrdersPageData: mocks.loadOrdersPageData,
}));
vi.mock('./ecotrack', () => ({ readEcotrackCatalog: mocks.readCatalog }));
vi.mock('./background-jobs', () => ({ startOrderExportJob: mocks.startExport }));

import {
  adminAiOrderExportScopeSchemaForMessage,
  previewAdminAiOrderExport,
  startAdminAiOrderExport,
} from './admin-ai-order-exports';
import type { OrderRecord } from './orders';

function order(id: number, createdAt: string, overrides: Partial<OrderRecord> = {}) {
  return {
    id,
    createdAt,
    updatedAt: createdAt,
    firstName: 'Ada',
    lastName: 'Lovelace',
    fullName: 'Ada Lovelace',
    phoneNumber1: '0550123456',
    phoneNumber2: null,
    cartProducts: ['12'],
    orderProducts: [
      {
        productId: 12,
        brandId: 2,
        rawValue: '12',
        title: 'Perceuse Bosch',
        unitPrice: 15_000,
        quantity: 1,
        lineTotal: 15_000,
        thumbnailUrl: null,
        missing: false,
      },
    ],
    delivery: 0,
    state: 16,
    city: 'Alger Centre',
    homeAddress: '12 rue des Outils',
    subtotalOverride: null,
    productSubtotal: 15_000,
    deliveryFee: 600,
    totalAmount: 15_600,
    note: null,
    confirmed: 2,
    noAnswerCount: 0,
    confirmedBy: null,
    confirmedByName: null,
    confirmedAt: null,
    hasStatusHistory: false,
    statusHistory: [],
    ...overrides,
  } as OrderRecord;
}

describe('admin AI order exports', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readCatalog.mockResolvedValue({
      wilayas: [{ wilayaId: 16, name: 'Alger' }],
      communes: [
        {
          communeId: 1601,
          wilayaId: 16,
          name: 'Alger Centre',
          postalCode: null,
          hasStopDesk: true,
        },
      ],
    });
    mocks.startExport.mockResolvedValue({
      kind: 'started',
      job: { id: 'job-1', status: 'queued', downloadPath: null },
    });
  });

  it('makes explicit confirmed and selected scopes structural provider constraints', () => {
    const confirmed = adminAiOrderExportScopeSchemaForMessage(
      'Exporte toutes les commandes confirmées.',
    );
    expect(confirmed.safeParse({ mode: 'confirmed', orderIds: [] }).success).toBe(true);
    expect(confirmed.safeParse({ mode: 'confirmed', orderIds: [31] }).success).toBe(false);

    const selected = adminAiOrderExportScopeSchemaForMessage(
      'Exporte les commandes sélectionnées.',
    );
    expect(selected.safeParse({ mode: 'selected', orderIds: [31] }).success).toBe(true);
    expect(selected.safeParse({ mode: 'selected', orderIds: [] }).success).toBe(false);
  });

  it('previews the complete recent-confirmed cohort and exposes stale exclusions', async () => {
    mocks.loadOrdersPageData.mockImplementation(async ({ page }) => ({
      items:
        page === 1
          ? [order(31, '2026-08-23T10:00:00.000Z')]
          : [order(30, '2026-08-10T10:00:00.000Z')],
      pagination: { page, totalPages: 2 },
    }));

    const result = await previewAdminAiOrderExport(
      { mode: 'confirmed', orderIds: [] },
      new Date('2026-08-24T12:00:00.000Z'),
    );

    expect(mocks.loadOrdersPageData).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      mode: 'confirmed',
      orderIds: [31],
      rowCount: 1,
      staleConfirmedOrderIds: [30],
      missingRequiredFields: [],
      previewRowsTruncated: false,
      completionEffect: 'exported orders transition to dispatched after the file is created',
    });
    expect(result.previewRows[0]).toMatchObject({
      reference: '31',
      wilaya: 'Alger',
      commune: 'Alger Centre',
    });
  });

  it('reloads the canonical selected scope before starting the background export', async () => {
    mocks.loadOrderDetail.mockImplementation(async (orderId: number) =>
      orderId === 31 ? order(31, '2026-08-23T10:00:00.000Z') : null,
    );

    const result = await startAdminAiOrderExport(
      { mode: 'selected', orderIds: [31, 404] },
      { ownerKey: 'admin@example.com', conversationId: 91 },
      new Date('2026-08-24T12:00:00.000Z'),
    );

    expect(mocks.startExport).toHaveBeenCalledWith(
      'admin@example.com',
      { mode: 'selected', orderIds: [31] },
      undefined,
      { conversationId: 91 },
    );
    expect(result).toMatchObject({
      kind: 'order_export_started',
      resolvedOrderCount: 1,
      missingOrderIds: [404],
      completionEffect: 'selected-order statuses are unchanged',
      job: { status: 'queued', downloadPath: null },
    });
  });
});
