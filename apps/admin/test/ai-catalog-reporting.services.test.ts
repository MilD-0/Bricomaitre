import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, expect, it, vi } from 'vitest';

import { getDb, getPool } from '@bric/db/client';
import {
  analyticsOrderCohortFacts,
  brands,
  categories,
  ecotrackOrderStates,
  orderAiInfluence,
  orders,
  productPromoCodes,
  products,
} from '@bric/db/schema';
import { ORDER_STATUS } from '@bric/storefront-core/order-domain';
import {
  inspectAdminArchivedCatalogProducts,
  inspectAdminCatalogProducts,
} from '../lib/admin-ai-catalog';
import { loadShopping } from '../lib/ai-stats-shopping';
import { getLiveStorefrontAiStats } from '../lib/stats-experience-ai';

afterAll(async () => {
  await getPool().end();
});

it('batches exact current and archived catalog evidence without losing taxonomy, promotions or request order', async () => {
  const db = getDb();
  const key = randomUUID();
  const [brand] = await db
    .insert(brands)
    .values({ name: 'Bosch', slug: `brand-${key}`, isActive: false })
    .returning();
  const [parent] = await db
    .insert(categories)
    .values({ name: 'Outillage', slug: `parent-${key}` })
    .returning();
  const [category] = await db
    .insert(categories)
    .values({ name: 'Perceuses', nameAr: 'مثاقب', slug: `child-${key}`, parentId: parent!.id })
    .returning();
  const archivedAt = new Date('2026-08-28T05:00:00Z');
  const rows = await db
    .insert(products)
    .values(
      Array.from({ length: 30 }, (_, index) => ({
        title: `Perceuse ${index}`,
        titleAr: 'مثقاب',
        slug: `${key}-${index}`,
        sku: `${key}-sku-${index}`,
        description: 'Compacte',
        descriptionAr: 'صغيرة',
        price: '12000',
        oldPrice: '13000',
        purchasePrice: '7000',
        active: false,
        inStock: false,
        availabilityStatus: 'out_of_stock',
        inventoryQuantity: 4,
        brandId: index === 0 ? null : brand!.id,
        categoryId: index === 0 ? null : category!.id,
        images: ['https://cdn.example.invalid/drill.jpg'],
        archivedAt: index >= 10 ? archivedAt : null,
      })),
    )
    .returning();
  const ids = rows.map((row) => row.id);
  const missingId = Math.max(...ids) + 100_000_000;
  const startsAt = new Date('2026-08-01T12:00:00Z');
  const endsAt = new Date('2026-09-01T12:00:00Z');
  try {
    await db.insert(productPromoCodes).values(
      rows.map((product) => ({
        productId: product.id,
        code: 'PRO',
        normalizedCode: 'pro',
        promoPrice: '11000',
        active: true,
        startsAt,
        endsAt,
      })),
    );
    const query = vi.spyOn(Client.prototype, 'query');
    try {
      const currentIds = ids.slice(0, 10).reverse();
      const current = await inspectAdminCatalogProducts({ productIds: currentIds });
      expect(query.mock.calls.length).toBeGreaterThan(0);
      expect(query.mock.calls.length).toBeLessThanOrEqual(2);
      expect(current.items.map((product) => product.id)).toEqual(currentIds);
      expect(current.missingIds).toEqual([]);
      expect(current.items[0]).toEqual({
        id: currentIds[0],
        archivedAt: null,
        identity: {
          title: 'Perceuse 9',
          titleAr: 'مثقاب',
          slug: `${key}-9`,
          sku: `${key}-sku-9`,
          barcode: null,
        },
        pricing: {
          sellingPriceDzd: 12000,
          compareAtPriceDzd: 13000,
          purchaseCostDzd: 7000,
          promoCodes: [
            {
              code: 'PRO',
              promoPrice: 11000,
              active: true,
              startsAt: startsAt.toISOString(),
              endsAt: endsAt.toISOString(),
            },
          ],
        },
        availability: {
          active: false,
          inStock: false,
          status: 'out_of_stock',
          inventoryQuantity: 4,
        },
        taxonomy: {
          brand: { id: brand!.id, name: 'Bosch', slug: `brand-${key}`, active: false },
          category: {
            id: category!.id,
            name: 'Perceuses',
            nameAr: 'مثاقب',
            slug: `child-${key}`,
            active: true,
            parentId: parent!.id,
            parentName: 'Outillage',
          },
          assignedBrandId: brand!.id,
          assignedCategoryId: category!.id,
        },
        content: {
          description: 'Compacte',
          descriptionAr: 'صغيرة',
          images: ['https://cdn.example.invalid/drill.jpg'],
        },
      });
      expect(current.items.at(-1)!.taxonomy).toEqual({
        brand: null,
        category: null,
        assignedBrandId: null,
        assignedCategoryId: null,
      });
      query.mockClear();
      const archivedIds = ids.slice(10).reverse();
      const archived = await inspectAdminArchivedCatalogProducts({ productIds: archivedIds });
      expect(query.mock.calls.length).toBeGreaterThan(0);
      expect(query.mock.calls.length).toBeLessThanOrEqual(2);
      expect(archived.items.map((product) => product.id)).toEqual(archivedIds);
      expect(archived.items[0]).toMatchObject({
        archivedAt: archivedAt.toISOString(),
        pricing: current.items[0]!.pricing,
        availability: current.items[0]!.availability,
        taxonomy: current.items[0]!.taxonomy,
        content: current.items[0]!.content,
      });
      expect(
        await inspectAdminCatalogProducts({ productIds: [ids[1]!, ids[10]!, missingId, ids[1]!] }),
      ).toMatchObject({
        requestedIds: [ids[1], ids[10], missingId],
        missingIds: [ids[10], missingId],
        items: [{ id: ids[1] }],
      });
      expect(
        await inspectAdminArchivedCatalogProducts({
          productIds: [ids[10]!, ids[1]!, missingId, ids[10]!],
        }),
      ).toMatchObject({
        requestedIds: [ids[10], ids[1], missingId],
        missingIds: [ids[1], missingId],
        items: [{ id: ids[10] }],
      });
    } finally {
      query.mockRestore();
    }
  } finally {
    await db.delete(products).where(inArray(products.id, ids));
    await db.delete(categories).where(eq(categories.id, category!.id));
    await db.delete(categories).where(eq(categories.id, parent!.id));
    await db.delete(brands).where(eq(brands.id, brand!.id));
  }
});

it('uses local terminal corrections in compact and detailed AI paid outcomes while preserving influence cohorts', async () => {
  const db = getDb();
  const day = '2096-03-19';
  const createdAt = new Date(`${day}T12:00:00Z`);
  const states = [
    ORDER_STATUS.RETURNED,
    ORDER_STATUS.CANCELLED,
    ORDER_STATUS.FAILED,
    ORDER_STATUS.MANUAL_COMPLETED,
    ORDER_STATUS.POSTED,
    ORDER_STATUS.POSTED,
  ];
  const rows = await db
    .insert(orders)
    .values(
      states.map((inHouseStatus, index) => ({
        phoneNumber1: `055000000${index}`,
        inHouseStatus,
        createdAt,
      })),
    )
    .returning();
  const ids = rows.map((order) => order.id);
  try {
    await db.insert(orderAiInfluence).values(
      ids.map((orderId, index) => ({
        orderId,
        semanticsVersion: 'test',
        level: index === 5 ? 'opened' : 'engaged',
        capturedAt: createdAt,
      })),
    );
    await db.insert(ecotrackOrderStates).values(
      ids.map((orderId) => ({
        orderId,
        trackingNumber: randomUUID(),
        reference: String(orderId),
        currentStatus: 'payed',
      })),
    );
    // These facts predate the local corrections; corrected orders must not contribute stale paid profit.
    await db.insert(analyticsOrderCohortFacts).values(
      ids.map((orderId) => ({
        orderId,
        postedDay: day,
        outcome: 'payed',
        automaticPaidProfitDzd: '400',
      })),
    );
    const filters = {
      surface: 'shopping' as const,
      range: 'custom' as const,
      startDate: day,
      endDate: day,
      grain: 'day' as const,
      resolvedGrain: 'day' as const,
    };
    expect(await getLiveStorefrontAiStats(db, filters)).toMatchObject({
      influencedOrders: 6,
      paidOrders: 2,
    });
    const detailed = await loadShopping(db, filters);
    expect(detailed.metrics.find((metric) => metric.key === 'paidAssisted')).toMatchObject({
      value: 1,
    });
    expect(detailed.metrics.find((metric) => metric.key === 'paidContribution')).toMatchObject({
      value: 400,
      sample: 1,
    });
    expect(
      detailed.metrics.find((metric) => metric.key === 'paidContributionCoverage'),
    ).toMatchObject({ value: 100, sample: 1 });
  } finally {
    await db.delete(orders).where(inArray(orders.id, ids));
  }
});
