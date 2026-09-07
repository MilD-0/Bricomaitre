import { describe, expect, it } from 'vitest';

import {
  importMongoBrands,
  importMongoCategories,
  mapMongoOrderToCurrentSchema,
  mapMongoProductToCurrentSchema,
  mapMongoBrandToCurrentSchema,
  mapMongoCategoryToCurrentSchema,
  parseMongoCollectionExport,
  readMongoDate,
  readMongoId,
  resolveWilayaCode,
} from './mongo-product-import';

describe('tools/legacy-data/mongo-product-import', () => {
  it('maps the mongo product shape to the current product schema', () => {
    const row = mapMongoProductToCurrentSchema(
      {
        _id: { $oid: 'mongo-1' },
        title: 'Desk Lamp',
        description: 'Warm light',
        title_ar: 'مصباح مكتب',
        description_ar: 'إضاءة دافئة',
        price: 1200,
        OldPrice: 1500,
        purchase_price: 800,
        SKU: 'DL-01',
        stock: 12,
        images: ['https://cdn.example.com/lamp.jpg'],
        units_sold: 5,
        brand: { $oid: 'brand-mongo-1' },
        category: { $oid: 'category-mongo-1' },
        createdAt: '2024-01-01T10:00:00.000Z',
        updatedAt: '2024-01-02T10:00:00.000Z',
      },
      {
        brandIdByMongoId: new Map([['brand-mongo-1', 11]]),
        categoryIdByMongoId: new Map([['category-mongo-1', 22]]),
      },
    );

    expect(row).toEqual({
      mongoId: 'mongo-1',
      title: 'Desk Lamp',
      slug: 'desk-lamp',
      titleAr: 'مصباح مكتب',
      description: 'Warm light',
      descriptionAr: 'إضاءة دافئة',
      sku: 'DL-01',
      barcode: null,
      price: '1200.00',
      oldPrice: '1500.00',
      purchasePrice: '800.00',
      active: true,
      inStock: true,
      availabilityStatus: 'in_stock',
      unitsSold: 5,
      inventoryQuantity: 0,
      brandId: 11,
      categoryId: 22,
      images: ['https://cdn.example.com/lamp.jpg'],
      createdAt: new Date('2024-01-01T10:00:00.000Z'),
      updatedAt: new Date('2024-01-02T10:00:00.000Z'),
    });
  });

  it('drops documents without a usable title', () => {
    expect(mapMongoProductToCurrentSchema({ price: 100 })).toBeNull();
    expect(mapMongoProductToCurrentSchema({ title: '   ', price: 100 })).toBeNull();
  });

  it('defaults out-of-range required prices to 1 and nulls out-of-range optional prices', () => {
    expect(
      mapMongoProductToCurrentSchema({
        title: 'Broken price',
        price: 999999999999,
      }),
    ).toEqual(
      expect.objectContaining({
        price: '1.00',
      }),
    );

    expect(
      mapMongoProductToCurrentSchema({
        title: 'Optional overflow',
        price: 1200,
        OldPrice: 999999999999,
        purchase_price: 999999999999,
      }),
    ).toEqual(
      expect.objectContaining({
        price: '1200.00',
        oldPrice: null,
        purchasePrice: null,
      }),
    );
  });

  it('parses array and wrapped export formats', () => {
    expect(parseMongoCollectionExport('[{\"title\":\"Desk\"}]')).toEqual([{ title: 'Desk' }]);
    expect(parseMongoCollectionExport('{\"items\":[{\"title\":\"Chair\"}]}')).toEqual([
      { title: 'Chair' },
    ]);
  });

  it('maps brand and category exports to the current schema', () => {
    expect(
      mapMongoBrandToCurrentSchema({
        name: 'Acme',
        image: 'https://cdn.example.com/acme.jpg',
        featured: true,
      }),
    ).toEqual(
      expect.objectContaining({
        mongoId: null,
        name: 'Acme',
        slug: 'acme',
        image: 'https://cdn.example.com/acme.jpg',
        featured: true,
        isActive: true,
      }),
    );

    expect(mapMongoBrandToCurrentSchema({ name: 'Éclairage décoratif' })).toEqual(
      expect.objectContaining({
        mongoId: null,
        name: 'Éclairage décoratif',
        slug: 'eclairage-decoratif',
      }),
    );

    expect(
      mapMongoCategoryToCurrentSchema(
        {
          name: 'Lighting',
          name_en: 'Lighting',
          name_ar: 'إنارة',
          image: 'https://cdn.example.com/light.jpg',
          properties: [{ key: 'bulb' }],
          featured: true,
        },
        9,
      ),
    ).toEqual(
      expect.objectContaining({
        mongoId: null,
        name: 'Lighting',
        slug: 'lighting',
        nameEn: 'Lighting',
        nameAr: 'إنارة',
        image: 'https://cdn.example.com/light.jpg',
        parentId: 9,
        properties: [{ key: 'bulb' }],
        featured: true,
      }),
    );
  });

  it('imports brands and categories while preserving mongo id relationships', async () => {
    const insertedCategories: Array<{ id: number; name: string; parentId: number | null }> = [];

    const brandMap = await importMongoBrands(
      [{ _id: { $oid: 'brand-1' }, name: 'Acme' }],
      async () => 1,
    );

    const categoryMap = await importMongoCategories(
      [
        { _id: 'cat-1', name: 'Lighting' },
        { _id: 'cat-2', name: 'Wall Lights', parent: { $oid: 'cat-1' } },
      ],
      async (row) => {
        const id = insertedCategories.length + 1;
        insertedCategories.push({ id, name: row.name, parentId: row.parentId });
        return id;
      },
    );

    expect(brandMap).toEqual(new Map([['brand-1', 1]]));
    expect(categoryMap).toEqual(
      new Map([
        ['cat-1', 1],
        ['cat-2', 2],
      ]),
    );
    expect(insertedCategories).toEqual([
      { id: 1, name: 'Lighting', parentId: null },
      { id: 2, name: 'Wall Lights', parentId: 1 },
    ]);
  });

  it('reads mongo ids from extended json objects', () => {
    expect(readMongoId({ $oid: 'abc123' })).toBe('abc123');
    expect(readMongoId('xyz789')).toBe('xyz789');
  });

  it('reads mongo dates from extended json objects', () => {
    expect(readMongoDate({ $date: '2024-01-01T00:00:00.000Z' })).toEqual(
      new Date('2024-01-01T00:00:00.000Z'),
    );
  });

  it('marks zero-stock products as out of stock', () => {
    expect(
      mapMongoProductToCurrentSchema({
        _id: { $oid: 'mongo-2' },
        title: 'Empty shelf',
        price: 200,
        stock: 0,
      }),
    ).toEqual(
      expect.objectContaining({
        mongoId: 'mongo-2',
        inStock: false,
        availabilityStatus: 'out_of_stock',
      }),
    );
  });

  it('maps legacy orders into the current schema with product id remapping', () => {
    const result = mapMongoOrderToCurrentSchema(
      {
        _id: { $oid: 'order-1' },
        firstName: 'Amine',
        lastName: 'Test',
        state: 'Tébessa',
        city: 'Tebessa',
        homeAddress: 'Rue 1',
        email: 'TEST@Example.com',
        phoneNumber1: 551234567,
        phoneNumber2: 552345678,
        cartProducts: ['mongo-product-1', 'mongo-product-1'],
        delivery: 'office',
        del_pr: 400,
        price: 1900,
        note: 'Note',
        confirmed: 'no3',
        createdAt: { $date: '2025-12-20T00:00:00.000Z' },
        updatedAt: { $date: '2025-12-21T00:00:00.000Z' },
        ecotrackStatus: 'En attente',
        ecotrackCurrentStatus: 'Commande creee',
        ecotrackLastSync: { $date: '2025-12-21T10:00:00.000Z' },
        ecotrackTrackingNumber: 'trk-1',
      },
      {
        productIdByMongoId: new Map([['mongo-product-1', 42]]),
      },
    );

    expect(result).toEqual({
      row: {
        mongoId: 'order-1',
        firstName: 'Amine',
        lastName: 'Test',
        state: 12,
        city: 'Tebessa',
        homeAddress: 'Rue 1',
        email: 'test@example.com',
        phoneNumber1: '551234567',
        normalizedPhone: '213551234567',
        phoneNumber2: '552345678',
        cartProducts: ['42', '42'],
        delivery: 1,
        deliveryFee: '400.00',
        price: '1900.00',
        note: 'Note',
        inHouseStatus: 1,
        noAnswerCount: 2,
        confirmedBy: null,
        confirmedByName: null,
        confirmedAt: null,
        ecotrackStatus: 'En attente',
        ecotrackStatusLastUpdate: new Date('2025-12-21T10:00:00.000Z'),
        ecotrackStatusData: { currentStatus: 'Commande creee' },
        ecotrackReference: null,
        ecotrackTrackingNumber: 'trk-1',
        createdAt: new Date('2025-12-20T00:00:00.000Z'),
        updatedAt: new Date('2025-12-21T00:00:00.000Z'),
      },
      warnings: [],
      errors: [],
    });
  });

  it('blocks orders with unmatched cart refs and skips unresolved states', () => {
    const missingProduct = mapMongoOrderToCurrentSchema(
      {
        _id: { $oid: 'order-2' },
        state: 'Alger',
        phoneNumber1: 551234567,
        cartProducts: ['missing'],
        createdAt: { $date: '2026-01-02T00:00:00.000Z' },
      },
      {
        productIdByMongoId: new Map(),
      },
    );

    expect(missingProduct.row).toBeNull();
    expect(missingProduct.errors).toEqual([
      expect.objectContaining({ code: 'unmatched_cart_product', value: 'missing' }),
    ]);

    const unresolvedState = mapMongoOrderToCurrentSchema(
      {
        _id: { $oid: 'order-3' },
        state: 'Unknown State',
        phoneNumber1: 551234567,
        cartProducts: [],
        createdAt: { $date: '2026-01-02T00:00:00.000Z' },
      },
      {
        productIdByMongoId: new Map(),
      },
    );

    expect(unresolvedState.row).toBeNull();
    expect(unresolvedState.warnings).toEqual([
      expect.objectContaining({ code: 'unresolved_state', value: 'Unknown State' }),
    ]);
  });

  it('normalizes wilaya names and variants', () => {
    expect(resolveWilayaCode('Tebessa')).toBe(12);
    expect(resolveWilayaCode('Tébessa')).toBe(12);
    expect(resolveWilayaCode('Tébessa')).toBe(12);
    expect(resolveWilayaCode('Sidi Bel Abbes')).toBe(22);
  });
  it('preserves numeric and canonical Extended JSON milliseconds instead of import time', () => {
    const instant = new Date('2024-01-01T00:00:00.000Z');
    const fallback = new Date('2026-09-07T00:00:00Z');
    expect(readMongoDate({ $date: instant.getTime() }, fallback)).toEqual(instant);
    expect(readMongoDate({ $date: { $numberLong: String(instant.getTime()) } }, fallback)).toEqual(
      instant,
    );
    expect(readMongoDate({ $date: 0 }, fallback)).toEqual(new Date(0));
    expect(readMongoDate(undefined, fallback)).toEqual(fallback);
    for (const value of [
      { $date: { $numberLong: 'invalid' } },
      { $date: '2024-02-30' },
      { $date: null },
    ]) {
      expect(() => readMongoDate(value, fallback)).toThrow('Invalid Mongo date');
    }
  });
});
