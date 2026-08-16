import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';

import {
  buildOrderExportRows,
  buildOrderExportWorkbook,
  filterRecentConfirmedOrders,
  ORDER_EXPORT_HEADERS,
  type EcotrackCatalogExportData,
} from './order-export';
import type { OrderRecord } from './orders';

const catalog: EcotrackCatalogExportData = {
  wilayas: [{ wilayaId: 16, name: 'Alger' }],
  communes: [
    { communeId: 42, wilayaId: 16, name: 'Bab Ezzouar', postalCode: '1621', hasStopDesk: true },
  ],
};

const order: OrderRecord = {
  id: 21,
  publicToken: null,
  variant: null,
  isDegradedCapture: false,
  createdAt: '2026-03-01T10:00:00.000Z',
  updatedAt: '2026-03-01T10:00:00.000Z',
  firstName: 'Grace',
  lastName: 'Hopper',
  fullName: 'Grace Hopper',
  email: null,
  phoneNumber1: '550000021',
  phoneNumber2: '055000022',
  cartProducts: ['1', '2'],
  orderProducts: [
    {
      productId: 1,
      brandId: 9,
      rawValue: '1',
      title: 'Chair',
      unitPrice: 1000,
      quantity: 1,
      lineTotal: 1000,
      thumbnailUrl: null,
      missing: false,
    },
    {
      productId: 2,
      brandId: 9,
      rawValue: '2',
      title: 'Desk',
      unitPrice: 1500,
      quantity: 2,
      lineTotal: 3000,
      thumbnailUrl: null,
      missing: false,
    },
  ],
  delivery: 1,
  state: 16,
  city: '42',
  homeAddress: 'Street 21',
  productSubtotal: 4000,
  deliveryFee: 200,
  totalAmount: 4200,
  note: 'Handle with care',
  confirmed: 2,
  noAnswerCount: 0,
  confirmedBy: null,
  confirmedByName: null,
  confirmedAt: null,
  hasStatusHistory: false,
  statusHistory: [],
};

describe('buildOrderExportRows', () => {
  it('maps orders to the courier export template shape', () => {
    expect(buildOrderExportRows([order], catalog)).toEqual([
      {
        reference: '21',
        fullName: 'Grace Hopper',
        phoneNumber: '0550000021',
        phoneNumber2: '055000022',
        wilayaCode: '16',
        wilaya: 'Alger',
        commune: 'Bab Ezzouar',
        address: 'Street 21',
        product: 'Chair x1\nDesk x2',
        weightKg: '',
        totalToCollect: '4200',
        note: 'Handle with care',
        fragile: '',
        exchange: '',
        pickup: '',
        recouvrement: 'OUI',
        stopdesk: 'OUI',
        mapLink: '',
      },
    ]);
  });
});

describe('buildOrderExportWorkbook', () => {
  it('writes the expected worksheet headers and row order', () => {
    const workbook = buildOrderExportWorkbook(buildOrderExportRows([order], catalog));

    expect(workbook.SheetNames).toEqual(['Sheet1']);

    const sheet = workbook.Sheets.Sheet1;
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, blankrows: false });

    expect(rows[0]).toEqual([...ORDER_EXPORT_HEADERS]);
    expect(rows[1]).toEqual([
      '21',
      'Grace Hopper',
      '0550000021',
      '055000022',
      '16',
      'Alger',
      'Bab Ezzouar',
      'Street 21',
      'Chair x1\nDesk x2',
      '',
      '4200',
      'Handle with care',
      '',
      '',
      '',
      'OUI',
      'OUI',
      '',
    ]);
  });
});

describe('filterRecentConfirmedOrders', () => {
  it('keeps only orders created within the last seven days', () => {
    const result = filterRecentConfirmedOrders(
      [
        order,
        {
          ...order,
          id: 22,
          createdAt: '2026-03-09T10:00:00.000Z',
        },
      ],
      new Date('2026-03-10T10:00:00.000Z'),
    );

    expect(result).toEqual([
      {
        ...order,
        id: 22,
        createdAt: '2026-03-09T10:00:00.000Z',
      },
    ]);
  });
});
