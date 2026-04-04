import { describe, expect, it } from 'vitest';

import {
  importMongoBrands,
  importMongoCategories,
  mapMongoProductToCurrentSchema,
  mapMongoBrandToCurrentSchema,
  mapMongoCategoryToCurrentSchema,
  parseMongoCollectionExport,
  readMongoId,
} from './mongo-product-import';

describe('lib/mongo-product-import', () => {
  it('maps the mongo product shape to the current product schema', () => {
    const row = mapMongoProductToCurrentSchema({
      _id: { $oid: 'mongo-1' } as never,
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
      brand: { $oid: 'brand-mongo-1' } as never,
      category: { $oid: 'category-mongo-1' } as never,
      createdAt: '2024-01-01T10:00:00.000Z',
      updatedAt: '2024-01-02T10:00:00.000Z',
    }, {
      brandIdByMongoId: new Map([['brand-mongo-1', 11]]),
      categoryIdByMongoId: new Map([['category-mongo-1', 22]]),
    });

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
    expect(mapMongoProductToCurrentSchema({
      title: 'Broken price',
      price: 999999999999,
    })).toEqual(expect.objectContaining({
      price: '1.00',
    }));

    expect(mapMongoProductToCurrentSchema({
      title: 'Optional overflow',
      price: 1200,
      OldPrice: 999999999999,
      purchase_price: 999999999999,
    })).toEqual(expect.objectContaining({
      price: '1200.00',
      oldPrice: null,
      purchasePrice: null,
    }));
  });

  it('parses array and wrapped export formats', () => {
    expect(parseMongoCollectionExport('[{\"title\":\"Desk\"}]')).toEqual([{ title: 'Desk' }]);
    expect(parseMongoCollectionExport('{\"items\":[{\"title\":\"Chair\"}]}')).toEqual([{ title: 'Chair' }]);
  });

  it('maps brand and category exports to the current schema', () => {
    expect(mapMongoBrandToCurrentSchema({ name: 'Acme', image: 'https://cdn.example.com/acme.jpg', featured: true })).toEqual(
      expect.objectContaining({
        name: 'Acme',
        slug: 'acme',
        image: 'https://cdn.example.com/acme.jpg',
        featured: true,
        isActive: true,
      }),
    );

    expect(mapMongoBrandToCurrentSchema({ name: 'Éclairage décoratif' })).toEqual(
      expect.objectContaining({
        name: 'Éclairage décoratif',
        slug: 'eclairage-decoratif',
      }),
    );

    expect(mapMongoCategoryToCurrentSchema({
      name: 'Lighting',
      name_en: 'Lighting',
      name_ar: 'إنارة',
      image: 'https://cdn.example.com/light.jpg',
      properties: [{ key: 'bulb' }],
      featured: true,
    }, 9)).toEqual(
      expect.objectContaining({
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
      [{ _id: { $oid: 'brand-1' } as never, name: 'Acme' }],
      async () => 1,
    );

    const categoryMap = await importMongoCategories(
      [
        { _id: 'cat-1', name: 'Lighting' },
        { _id: 'cat-2', name: 'Wall Lights', parent: { $oid: 'cat-1' } as never },
      ],
      async (row) => {
        const id = insertedCategories.length + 1;
        insertedCategories.push({ id, name: row.name, parentId: row.parentId });
        return id;
      },
    );

    expect(brandMap).toEqual(new Map([['brand-1', 1]]));
    expect(categoryMap).toEqual(new Map([['cat-1', 1], ['cat-2', 2]]));
    expect(insertedCategories).toEqual([
      { id: 1, name: 'Lighting', parentId: null },
      { id: 2, name: 'Wall Lights', parentId: 1 },
    ]);

  });

  it('reads mongo ids from extended json objects', () => {
    expect(readMongoId({ $oid: 'abc123' })).toBe('abc123');
    expect(readMongoId('xyz789')).toBe('xyz789');
  });
});
