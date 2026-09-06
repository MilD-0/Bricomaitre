import { and, eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it, vi } from 'vitest';

import { getDb, getPool } from '@bric/db/client';
import {
  actionLogs,
  aiProposals,
  aiRuns,
  brands,
  ecotrackOrderStates,
  orders,
  products,
} from '@bric/db/schema';
import {
  readStorefrontProducts,
  readStorefrontProductsForSelectionPage,
} from '@bric/storefront-core/catalog';
import { storefrontProductListQuerySchema } from '@bric/storefront-core/contracts';
import { ORDER_STATUS } from '@bric/storefront-core/order-domain';
import { OrderProductLookup, toOrderRecord } from '@bric/storefront-core/order-records';
import { searchAssetProductOptions } from '../lib/admin-assets-data';
import { loadActiveShipmentPageRows } from '../lib/admin-ecotrack-shipment-view';
import { loadConfirmedOrderIds, loadOrderRecordsByIds } from '../lib/admin-orders-data';
import { reviewProductContentProposal } from '../lib/ai-product-content';
import { persistEcotrackPostedOrderInTransaction } from '../lib/ecotrack-posting-persistence';
import { parseEcotrackShipmentListQuery } from '../lib/ecotrack-shipment-list';

vi.mock('../lib/server-cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/server-cache')>()),
  revalidateServerTags: vi.fn(),
}));

const runId = randomUUID();
const actor = { email: `commerce-${runId}@example.invalid`, name: 'Operator' };

afterAll(async () => {
  await getPool().end();
});

describe('persisted commerce workflows', () => {
  it('audits the persisted shipment ID and provider when creating and replacing a shipment', async () => {
    const db = getDb();
    const [row] = await db
      .insert(orders)
      .values({
        id: 8_000_000_000_000 + Math.floor(Math.random() * 1_000_000_000),
        phoneNumber1: '0550000111',
        inHouseStatus: ORDER_STATUS.CONFIRMED,
        productSubtotal: '1000',
        deliveryFee: '200',
        totalAmount: '1200',
      })
      .returning();
    try {
      for (const provider of ['delivro', 'emir'] as const) {
        const [current] = await db.select().from(orders).where(eq(orders.id, row!.id));
        await db.transaction((tx) =>
          persistEcotrackPostedOrderInTransaction(
            tx,
            {
              row: current!,
              record: toOrderRecord(current!, [], new OrderProductLookup()),
            },
            actor,
            {
              success: true,
              tracking: `${provider}-${runId}`,
              message: null,
              raw: { success: true },
            },
            provider,
          ),
        );
        const [shipment] = await db
          .select()
          .from(ecotrackOrderStates)
          .where(eq(ecotrackOrderStates.orderId, row!.id));
        const audits = await db
          .select()
          .from(actionLogs)
          .where(
            and(eq(actionLogs.entityId, row!.id), eq(actionLogs.entityType, 'ecotrackShipments')),
          );
        expect(shipment!.id).not.toBe(row!.id);
        expect(audits).toContainEqual(
          expect.objectContaining({
            operation: provider === 'delivro' ? 'create' : 'update',
            afterState: expect.objectContaining({
              id: shipment!.id,
              provider,
              trackingNumber: `${provider}-${runId}`,
            }),
            ...(provider === 'emir'
              ? { beforeState: expect.objectContaining({ provider: 'delivro' }) }
              : {}),
          }),
        );
      }
    } finally {
      await db.delete(orders).where(eq(orders.id, row!.id));
      await db.delete(actionLogs).where(eq(actionLogs.createdBy, actor.email));
    }
  });

  it('rejects expired and stale content proposals inside approval, then persists a valid approval', async () => {
    const db = getDb();
    const [product] = await db
      .insert(products)
      .values({ title: 'Original', slug: `proposal-${runId}`, price: '1000' })
      .returning();
    const [run] = await db
      .insert(aiRuns)
      .values({
        surface: 'admin',
        task: 'product_content_proposal',
        model: 'fixture',
        promptVersion: 'fixture',
      })
      .returning();
    try {
      for (const failure of ['proposal_expired', 'proposal_stale', null] as const) {
        const [proposal] = await db
          .insert(aiProposals)
          .values({
            runId: run!.id,
            proposalType: 'product_content',
            entityType: 'products',
            entityId: product!.id,
            sourceUpdatedAt:
              failure === 'proposal_stale'
                ? new Date(product!.updatedAt.getTime() - 1000)
                : product!.updatedAt,
            expiresAt: new Date(Date.now() + (failure === 'proposal_expired' ? -60_000 : 60_000)),
            payload: { changes: { title: 'Approved title' } },
          })
          .returning();
        const approval = reviewProductContentProposal({
          proposalId: proposal!.id,
          action: 'approve',
          actor,
        });
        if (failure) {
          await expect(approval).rejects.toMatchObject({ code: failure });
          const [unchanged] = await db.select().from(products).where(eq(products.id, product!.id));
          const [pending] = await db
            .select()
            .from(aiProposals)
            .where(eq(aiProposals.id, proposal!.id));
          expect(unchanged!.title).toBe('Original');
          expect(pending!.status).toBe('proposed');
          expect(
            await db
              .select()
              .from(actionLogs)
              .where(
                and(eq(actionLogs.entityId, product!.id), eq(actionLogs.createdBy, actor.email)),
              ),
          ).toEqual([]);
        } else {
          await expect(approval).resolves.toMatchObject({
            status: 'applied',
            verified: true,
            product: { title: 'Approved title' },
          });
          const [applied] = await db
            .select()
            .from(aiProposals)
            .where(eq(aiProposals.id, proposal!.id));
          expect(applied!.status).toBe('applied');
        }
      }
    } finally {
      await db.delete(aiProposals).where(eq(aiProposals.runId, run!.id));
      await db.delete(aiRuns).where(eq(aiRuns.id, run!.id));
      await db.delete(actionLogs).where(eq(actionLogs.createdBy, actor.email));
      await db.delete(products).where(eq(products.id, product!.id));
    }
  });

  it('selects confirmed cohorts at Algiers day boundaries and filters and paginates persisted shipments', async () => {
    const db = getDb();
    const created = await db
      .insert(orders)
      .values([
        {
          firstName: runId,
          phoneNumber1: '0550000111',
          inHouseStatus: ORDER_STATUS.CONFIRMED,
          createdAt: new Date('2098-06-01T22:59:59Z'),
        },
        {
          firstName: runId,
          phoneNumber1: '0550000111',
          inHouseStatus: ORDER_STATUS.CONFIRMED,
          createdAt: new Date('2098-06-01T23:00:00Z'),
        },
        {
          firstName: runId,
          phoneNumber1: '0550000111',
          inHouseStatus: ORDER_STATUS.CONFIRMED,
          createdAt: new Date('2098-06-02T22:59:59Z'),
        },
        {
          firstName: runId,
          phoneNumber1: '0550000111',
          inHouseStatus: ORDER_STATUS.CONFIRMED,
          createdAt: new Date('2098-06-02T23:00:00Z'),
        },
        {
          firstName: runId,
          phoneNumber1: '0550000111',
          inHouseStatus: ORDER_STATUS.CANCELLED,
          createdAt: new Date('2098-06-02T12:00:00Z'),
        },
      ])
      .returning();
    const ids = created.map(({ id }) => id);
    try {
      expect(await loadConfirmedOrderIds({ businessDate: '2098-06-02' })).toEqual([ids[2], ids[1]]);
      const cutoff = new Date('2098-06-01T23:00:00Z');
      expect(
        (await loadConfirmedOrderIds({ createdAtOrAfter: cutoff })).filter((id) =>
          ids.includes(id),
        ),
      ).toEqual([ids[3], ids[2], ids[1]]);
      expect(
        (await loadConfirmedOrderIds({ createdBefore: cutoff })).filter((id) => ids.includes(id)),
      ).toEqual([ids[0]]);
      expect(
        (await loadOrderRecordsByIds([ids[2]!, ids[1]!, ids[2]!, -1])).map(({ id }) => id),
      ).toEqual([ids[2], ids[1]]);
      const now = new Date();
      await db.insert(ecotrackOrderStates).values(
        created.slice(0, 3).map((order, i) => ({
          orderId: order.id,
          reference: String(order.id),
          trackingNumber: `${runId}-${i}`,
          currentStatus: i === 2 ? 'annule' : 'en_livraison',
          lastStatusSyncedAt: i === 0 ? now : null,
          lastTrackingSyncedAt: i === 0 ? now : null,
          lastMajSyncedAt: i === 0 ? now : null,
        })),
      );
      const page = await loadActiveShipmentPageRows(
        db,
        parseEcotrackShipmentListQuery({
          search: runId,
          status: 'en_livraison',
          staleOnly: true,
          page: 999,
          limit: 1,
        }),
      );
      expect(page.rows.map((row) => row.order.id)).toEqual([ids[1]]);
      expect(page.pagination).toMatchObject({ page: 1, totalItems: 1, totalPages: 1 });
      const sorted = await loadActiveShipmentPageRows(
        db,
        parseEcotrackShipmentListQuery({
          search: runId,
          status: 'en_livraison',
          sort: ['clientName:asc', 'trackingNumber:desc'],
          limit: 1,
          page: 2,
        }),
      );
      expect(sorted.rows.map((row) => row.order.id)).toEqual([ids[0]]);
      expect(sorted.pagination).toMatchObject({ page: 2, totalItems: 2, totalPages: 2 });
    } finally {
      await db.delete(orders).where(inArray(orders.id, ids));
    }
  });

  it('ranks real catalog and asset results and paginates explicit selections without duplicates', async () => {
    const db = getDb();
    const [brand] = await db
      .insert(brands)
      .values({ name: `Search ${runId}`, slug: `search-${runId}` })
      .returning();
    const rows = await db
      .insert(products)
      .values([
        {
          title: 'Perceuse percussion',
          titleAr: 'مثقاب كهربائي',
          slug: `exact-${runId}`,
          price: '1000',
          brandId: brand!.id,
          active: true,
          inStock: true,
        },
        {
          title: 'Accessoire',
          description: 'Pour perceuse percussion',
          slug: `description-${runId}`,
          price: '1000',
          brandId: brand!.id,
          active: true,
          inStock: true,
        },
        {
          title: 'Perceuse percussion masquée',
          slug: `hidden-${runId}`,
          price: '1000',
          brandId: brand!.id,
          active: false,
        },
      ])
      .returning();
    const ids = rows.map(({ id }) => id);
    try {
      const results = await readStorefrontProducts(
        db,
        storefrontProductListQuerySchema.parse({
          search: 'perceuse percussion',
          brandId: brand!.id,
          sortKey: 'recommended',
        }),
      );
      expect(results.map(({ id }) => id)).toEqual([ids[0], ids[1]]);
      const arabic = await readStorefrontProducts(
        db,
        storefrontProductListQuerySchema.parse({ search: 'مِثْقَاب', brandId: brand!.id }),
      );
      expect(arabic.map(({ id }) => id)).toEqual([ids[0]]);
      const assets = await searchAssetProductOptions({
        search: 'perceuse percussion',
        ids: [],
        page: 1,
        limit: 100,
      });
      expect(assets.items.map(({ id }) => id)).toEqual(expect.arrayContaining([ids[0], ids[1]]));
      expect(assets.items.findIndex(({ id }) => id === ids[0])).toBeLessThan(
        assets.items.findIndex(({ id }) => id === ids[1]),
      );
      const selection = {
        productIds: [ids[1]!, ids[1]!, ids[2]!],
        brandIds: [brand!.id],
        categoryIds: [],
      };
      const first = await readStorefrontProductsForSelectionPage(db, selection, {
        page: 1,
        limit: 1,
      });
      const second = await readStorefrontProductsForSelectionPage(db, selection, {
        page: 2,
        limit: 1,
      });
      expect(first.total).toBe(2);
      expect(first.items.map(({ id }) => id)).toEqual([ids[1]]);
      expect(second.items.map(({ id }) => id)).toEqual([ids[0]]);
    } finally {
      await db.delete(products).where(inArray(products.id, ids));
      await db.delete(brands).where(eq(brands.id, brand!.id));
    }
  });
});
