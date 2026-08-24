import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loadOrdersPageData: vi.fn(),
  buildPostingPreview: vi.fn(),
  readCatalog: vi.fn(),
  inspectOrders: vi.fn(),
  startPostingJob: vi.fn(),
}));

vi.mock('@bric/db/client', () => ({ getDb: () => 'database' }));
vi.mock('./admin-orders-data', () => ({ loadOrdersPageData: mocks.loadOrdersPageData }));
vi.mock('./admin-ai-domain', () => ({ inspectAdminOrders: mocks.inspectOrders }));
vi.mock('./ecotrack', () => ({
  buildEcotrackPostingPreview: mocks.buildPostingPreview,
  readEcotrackCatalog: mocks.readCatalog,
}));
vi.mock('./background-jobs', () => ({ startOrderEcotrackJob: mocks.startPostingJob }));

import {
  loadAdminAiEcotrackRequirements,
  previewAdminAiEcotrackPosting,
  resolveAdminAiEcotrackPostingScope,
  startAdminAiEcotrackPosting,
} from './admin-ai-ecotrack';

function ordersPage(items: Array<{ id: number; createdAt: string }>, page = 1, totalPages = 1) {
  return {
    items,
    writable: false,
    pagination: {
      page,
      limit: 100,
      totalItems: items.length,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };
}

describe('admin AI ECOTRACK posting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.buildPostingPreview.mockResolvedValue({
      totalRequested: 2,
      eligible: [
        {
          orderId: 11,
          customerName: 'Ada',
          destination: 'Alger Centre, 16',
          amount: '4500',
          payload: { reference: '11', telephone: '0555000000' },
        },
      ],
      skipped: [],
      invalid: [
        {
          orderId: 12,
          customerName: 'Grace',
          reason: 'invalid_commune',
          message: 'Commune is not active or could not be resolved.',
        },
      ],
    });
  });

  it('resolves today against Africa/Algiers and keeps every matching confirmed order', async () => {
    mocks.loadOrdersPageData
      .mockResolvedValueOnce(
        ordersPage(
          [
            { id: 11, createdAt: '2026-08-23T23:30:00.000Z' },
            { id: 12, createdAt: '2026-08-24T23:30:00.000Z' },
          ],
          1,
          2,
        ),
      )
      .mockResolvedValueOnce(ordersPage([{ id: 13, createdAt: '2026-08-24T08:00:00.000Z' }], 2, 2));

    await expect(
      resolveAdminAiEcotrackPostingScope(
        { scope: 'confirmed_today', orderIds: [], businessDate: null },
        new Date('2026-08-24T12:00:00.000Z'),
      ),
    ).resolves.toEqual({
      scope: 'confirmed_today',
      mode: 'confirmed',
      orderIds: [11, 13],
      businessDate: '2026-08-24',
      dateBasis: 'order_created_africa_algiers',
    });
    expect(mocks.loadOrdersPageData).toHaveBeenCalledTimes(2);
  });

  it('previews exact selected IDs without leaking complete provider payloads into chat context', async () => {
    const result = await previewAdminAiEcotrackPosting({
      scope: 'selected',
      orderIds: [11, 11, 12],
      businessDate: null,
    });

    expect(mocks.buildPostingPreview).toHaveBeenCalledWith('database', 'selected', [11, 12]);
    expect(result).toMatchObject({
      kind: 'ecotrack_posting_preview',
      providerChoiceRequired: true,
      eligibleCount: 1,
      invalidCount: 1,
      request: { orderIds: [11, 12] },
    });
    expect(result.eligible[0]).not.toHaveProperty('payload');
  });

  it('starts the canonical server-owned posting job with provider and conversation linkage', async () => {
    mocks.startPostingJob.mockResolvedValue({
      kind: 'started',
      job: { id: '9fc7d69d-bd4b-4ac8-ad62-cf633eccfb13', status: 'queued' },
    });

    await expect(
      startAdminAiEcotrackPosting(
        {
          provider: 'emir',
          scope: 'confirmed_today',
          orderIds: [11, 11],
          businessDate: null,
        },
        {
          ownerKey: 'admin@example.com',
          actor: { email: 'admin@example.com', name: 'Admin' },
          conversationId: 42,
          now: new Date('2026-08-24T12:00:00.000Z'),
        },
      ),
    ).resolves.toMatchObject({
      kind: 'ecotrack_posting_started',
      provider: 'emir',
      resolvedOrderCount: 1,
      job: { status: 'queued' },
    });
    expect(mocks.loadOrdersPageData).not.toHaveBeenCalled();
    expect(mocks.startPostingJob).toHaveBeenCalledWith(
      'admin@example.com',
      {
        mode: 'confirmed',
        provider: 'emir',
        orderIds: [11],
        actor: { email: 'admin@example.com', name: 'Admin' },
      },
      undefined,
      { conversationId: 42 },
    );
  });
});

describe('admin AI ECOTRACK requirements', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.inspectOrders.mockResolvedValue({
      items: [
        {
          id: 12,
          delivery: { state: 16, city: 'Bab Ezzour' },
        },
      ],
      requestedIds: [12],
      missingIds: [],
    });
    mocks.readCatalog.mockResolvedValue({
      wilayas: [{ wilayaId: 16, name: 'Alger' }],
      communes: [
        {
          communeId: 1604,
          wilayaId: 16,
          name: 'Bab Ezzouar',
          postalCode: '16042',
          hasStopDesk: true,
        },
        {
          communeId: 1601,
          wilayaId: 16,
          name: 'Alger Centre',
          postalCode: '16000',
          hasStopDesk: true,
        },
      ],
      serviceFees: [],
      weightFees: [],
      lastSync: { completedAt: new Date('2026-08-24T09:00:00.000Z') },
    });
  });

  it('loads current order evidence, documented field rules, and typo-tolerant live commune fixes', async () => {
    const result = await loadAdminAiEcotrackRequirements({
      orderIds: [12],
      provider: 'delivro',
      providerMessage: 'La commune est invalide',
      wilayaId: null,
      communeQuery: '',
    });

    expect(result.documentation).toMatchObject({
      repositoryGuide: 'docs/ecotrack-integration.md',
      provider: 'delivro',
    });
    expect(result.likelyRepairFields).toEqual(['commune']);
    expect(result.orderSuggestions).toEqual([
      expect.objectContaining({
        orderId: 12,
        communeMatches: [expect.objectContaining({ commune: 'Bab Ezzouar', wilayaId: 16 })],
      }),
    ]);
    expect(result.requirements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          reason: 'invalid_commune',
          repairFields: ['wilayaId', 'commune'],
        }),
      ]),
    );
  });
});
