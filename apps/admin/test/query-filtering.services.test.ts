import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import { inArray } from 'drizzle-orm';
import { getDb, getPool } from '@bric/db/client';
import {
  brands,
  orders,
  products,
  ecotrackOrderStates,
  ecotrackOrderMajEntries,
  ecotrackOrderTrackingEvents,
} from '@bric/db/schema';
import { ORDER_STATUS } from '@bric/storefront-core/order-domain';
import { loadInventoryPageData } from '../lib/admin-inventory-data';
import { queryAdminCatalogProducts } from '../lib/admin-ai-catalog-query';
import { queryAdminOrders } from '../lib/admin-ai-order-query';
import {
  buildEcotrackOrderDetailsFromRows,
  loadShipmentRowsByOrderIds,
} from '../lib/admin-ecotrack-shipment-view';

afterAll(async () => {
  await getPool().end();
});

it('executes selected, searched and default inventory scopes against real rows', async () => {
  const db = getDb();
  const marker = randomUUID();
  const rows = await db
    .insert(products)
    .values(
      [0, 0, 4].map((quantity, index) => ({
        title: `${marker}-${index}`,
        slug: `${marker}-${index}`,
        price: '100',
        sku: `${marker}-sku-${index}`,
        barcode: `${marker}-barcode-${index}`,
        inventoryQuantity: quantity,
        inStock: quantity > 0,
        availabilityStatus: quantity > 0 ? 'in_stock' : 'out_of_stock',
      })),
    )
    .returning();
  const ids = rows.map((row) => row.id);
  try {
    const selected = await loadInventoryPageData(
      { search: 'does-not-match', page: 1, limit: 20 },
      true,
      [ids[1]!, ids[0]!, ids[1]!],
    );
    expect(selected.items.map((row) => row.id)).toEqual([ids[0], ids[1]]);
    expect(selected.pagination.totalItems).toBe(2);
    for (const search of [rows[0]!.title, rows[0]!.sku!, rows[0]!.barcode!]) {
      const found = await loadInventoryPageData({ search }, true);
      expect(found.items.map((row) => row.id)).toEqual([ids[0]]);
      expect(found.pagination.totalItems).toBe(1);
    }
    const page = await loadInventoryPageData({ search: marker, limit: 1, page: 2 }, true);
    expect(page.items.map((row) => row.id)).toEqual([ids[1]]);
    expect(page.pagination).toMatchObject({ totalItems: 3, totalPages: 3, page: 2 });
    const stock = await loadInventoryPageData({ limit: 50 }, true);
    expect(stock.items.map((row) => row.id)).toContain(ids[2]);
    for (const id of [ids[0], ids[1]]) expect(stock.items.map((row) => row.id)).not.toContain(id);
    expect((await loadInventoryPageData({ search: `${marker}-absent` }, true)).items).toEqual([]);
  } finally {
    await db.delete(products).where(inArray(products.id, ids));
  }
});

it('intersects assistant catalog search, brand, stock, active and archive filters in SQL', async () => {
  const db = getDb();
  const marker = randomUUID();
  const brandRows = await db
    .insert(brands)
    .values([
      { name: `${marker}-A`, slug: `${marker}-A` },
      { name: `${marker}-B`, slug: `${marker}-B` },
    ])
    .returning();
  const rows = await db
    .insert(products)
    .values(
      [
        { brandId: brandRows[0]!.id, inventoryQuantity: 0, active: true },
        { brandId: brandRows[1]!.id, inventoryQuantity: 0, active: true },
        { brandId: brandRows[0]!.id, inventoryQuantity: 3, active: true },
        { brandId: brandRows[0]!.id, inventoryQuantity: 0, active: false },
        { brandId: brandRows[0]!.id, inventoryQuantity: 0, active: true, archivedAt: new Date() },
      ].map((values, index) => ({
        ...values,
        title: `${marker}-${index}`,
        slug: `${marker}-${index}`,
        price: '100',
      })),
    )
    .returning();
  try {
    const scope = {
      query: marker,
      brandIds: [brandRows[0]!.id],
      inventoryMax: 0,
      productState: 'active' as const,
    };
    const result = await queryAdminCatalogProducts(scope);
    expect(result.items.map((row) => row.id)).toEqual([rows[0]!.id]);
    expect(result.pagination.totalItems).toBe(1);
    const archived = await queryAdminCatalogProducts({ ...scope, archive: 'archived' });
    expect(archived.items.map((row) => row.id)).toEqual([rows[4]!.id]);
    expect(
      (await queryAdminCatalogProducts({ ...scope, query: `${marker}-absent` })).pagination
        .totalItems,
    ).toBe(0);
  } finally {
    await db.delete(products).where(
      inArray(
        products.id,
        rows.map((row) => row.id),
      ),
    );
    await db.delete(brands).where(
      inArray(
        brands.id,
        brandRows.map((row) => row.id),
      ),
    );
  }
});

it('intersects assistant order search, status and reporting-date filters before pagination', async () => {
  const db = getDb();
  const marker = randomUUID();
  const rows = await db
    .insert(orders)
    .values(
      [
        {
          firstName: marker,
          inHouseStatus: ORDER_STATUS.CONFIRMED,
          createdAt: new Date('2026-09-02T10:00:00Z'),
        },
        {
          firstName: marker,
          inHouseStatus: ORDER_STATUS.NOT_CONTACTED,
          createdAt: new Date('2026-09-02T11:00:00Z'),
        },
        {
          firstName: marker,
          inHouseStatus: ORDER_STATUS.CONFIRMED,
          createdAt: new Date('2026-09-03T10:00:00Z'),
        },
        {
          firstName: 'unrelated',
          inHouseStatus: ORDER_STATUS.CONFIRMED,
          createdAt: new Date('2026-09-02T10:00:00Z'),
        },
      ].map((row) => ({ ...row, phoneNumber1: '0550000000' })),
    )
    .returning();
  try {
    const result = await queryAdminOrders({
      search: marker,
      filters: [
        { field: 'current_in_house_status', statuses: ['confirmed'] },
        { field: 'created_date', date: { kind: 'day', date: '2026-09-02' } },
      ],
    });
    if (result.kind !== 'orders') throw new Error('Expected order rows');
    expect(result.items.map((row) => row.id)).toEqual([rows[0]!.id]);
    expect(result.pagination.totalItems).toBe(1);
    const page = await queryAdminOrders({
      search: marker,
      page: 2,
      limit: 1,
      sort: { by: 'createdAt', direction: 'asc' },
    });
    if (page.kind !== 'orders') throw new Error('Expected paginated order rows');
    expect(page.items.map((row) => row.id)).toEqual([rows[1]!.id]);
    expect(page.pagination).toMatchObject({ totalItems: 3, totalPages: 3, page: 2 });
  } finally {
    await db.delete(orders).where(
      inArray(
        orders.id,
        rows.map((row) => row.id),
      ),
    );
  }
});

it('bulk-loads only active selected shipments and keeps each tracking history separate', async () => {
  const db = getDb();
  const marker = randomUUID();
  const rows = await db
    .insert(orders)
    .values([0, 1, 2].map(() => ({ phoneNumber1: '0550000000' })))
    .returning();
  const ids = rows.map((row) => row.id);
  try {
    const states = await db
      .insert(ecotrackOrderStates)
      .values(
        rows.map((row, index) => ({
          orderId: row.id,
          reference: String(row.id),
          trackingNumber: `${marker}-${index}`,
          currentStatus: 'en_livraison',
          deletedAt: index === 2 ? new Date() : null,
        })),
      )
      .returning();
    const histories = [
      { orderId: ids[0]!, trackingNumber: states[0]!.trackingNumber, remarque: 'first shipment' },
      { orderId: ids[1]!, trackingNumber: states[1]!.trackingNumber, remarque: 'second shipment' },
      {
        orderId: ids[0]!,
        trackingNumber: `${marker}-old`,
        remarque: 'old tracking must stay hidden',
      },
    ];
    await db
      .insert(ecotrackOrderMajEntries)
      .values(histories.map((row) => ({ ...row, remoteCreatedAt: new Date(), raw: {} })));
    await db.insert(ecotrackOrderTrackingEvents).values(
      histories.map((row) => ({
        orderId: row.orderId,
        trackingNumber: row.trackingNumber,
        eventDate: '2026-09-01',
        eventTime: '10:00:00',
        status: row.remarque,
        raw: {},
      })),
    );
    const selected = await loadShipmentRowsByOrderIds(db, [ids[1]!, ids[2]!, ids[0]!, ids[1]!]);
    expect(selected.map((row) => row.order.id)).toEqual([ids[1], ids[0]]);
    const details = await buildEcotrackOrderDetailsFromRows(db, selected);
    expect(details.map((row) => row.majEntries.map((entry) => entry.remarque))).toEqual([
      ['second shipment'],
      ['first shipment'],
    ]);
    expect(details.map((row) => row.trackingEvents.map((entry) => entry.status))).toEqual([
      ['second shipment'],
      ['first shipment'],
    ]);
  } finally {
    await db.delete(orders).where(inArray(orders.id, ids));
  }
});
