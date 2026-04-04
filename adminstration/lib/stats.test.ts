import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';

import {
  buildCartProductLookup,
  collectCartProductReferenceBuckets,
  getCartProductLookupKey,
  manualOrderListQuerySchema,
  parseSpreadsheet,
  statsQuerySchema,
} from './stats';

describe('statsQuerySchema', () => {
  it('accepts preset ranges without custom dates', () => {
    expect(statsQuerySchema.parse({ range: '90d' })).toEqual({ range: '90d' });
  });

  it('rejects invalid custom ranges', () => {
    expect(() => statsQuerySchema.parse({ range: 'custom' })).toThrowError('Provide at least one custom date.');
  });
});

describe('parseSpreadsheet', () => {
  it('detects headers after introductory rows and maps values', () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      ['Ecotrack export'],
      ['Generated automatically'],
      ['Référence', 'Tracking', 'Montant', 'Frais de livraison', 'Net recouvrement', 'Wilaya', 'Commune', 'Destinataire'],
      ['42', 'TRK-42', 1500, 200, 1300, 'Alger', 'Bab Ezzouar', 'Ada'],
    ]);

    XLSX.utils.book_append_sheet(workbook, sheet, 'Sheet1');

    const rows = parseSpreadsheet(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      reference: '42',
      tracking: 'TRK-42',
      montant: 1500,
      fraisLivraison: 200,
      netRecouvret: 1300,
      wilaya: 'Alger',
      commune: 'Bab Ezzouar',
      destinataire: 'Ada',
    });
  });
});

describe('manualOrderListQuerySchema', () => {
  it('parses paginated manual-order queries', () => {
    expect(manualOrderListQuerySchema.parse({ page: '2', limit: '10' })).toEqual({ page: 2, limit: 10 });
  });
});

describe('cart product reference matching', () => {
  it('classifies numeric and mongo cart product references the same way as orders', () => {
    expect(getCartProductLookupKey('12')).toBe('id:12');
    expect(getCartProductLookupKey('f00000000000000000000005')).toBe('mongo:f00000000000000000000005');
    expect(getCartProductLookupKey('Desk Lamp')).toBeNull();
  });

  it('collects unique numeric ids and mongo ids from cart products', () => {
    expect(collectCartProductReferenceBuckets([
      { cartProducts: ['12', 'f00000000000000000000005', '12'] },
      { cartProducts: [' 7 ', 'f00000000000000000000005', 'custom text'] },
      { cartProducts: null },
    ])).toEqual({
      productIds: [12, 7],
      mongoIds: ['f00000000000000000000005'],
    });
  });

  it('builds a product lookup that resolves by numeric id and mongo id', () => {
    const lookup = buildCartProductLookup([
      { id: 12, mongoId: 'f00000000000000000000005', title: 'Legacy Lamp' },
      { id: 7, mongoId: null, title: 'Desk' },
    ]);

    expect(lookup.get('id:12')).toMatchObject({ title: 'Legacy Lamp' });
    expect(lookup.get('mongo:f00000000000000000000005')).toMatchObject({ id: 12 });
    expect(lookup.get('id:7')).toMatchObject({ title: 'Desk' });
  });
});
