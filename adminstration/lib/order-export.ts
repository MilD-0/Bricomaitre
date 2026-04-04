import * as XLSX from 'xlsx';

import type { OrderRecord } from './orders';

export type EcotrackCatalogExportData = {
  wilayas: Array<{ wilayaId: number; name: string }>;
  communes: Array<{ communeId: number; wilayaId: number; name: string; postalCode: string | null; hasStopDesk: boolean }>;
};

export type OrderExportRow = {
  fullName: string;
  phoneNumber1: string;
  phoneNumber2: string;
  product: string;
  quantity: string;
  address: string;
  wilaya: string;
  commune: string;
  totalToCollect: string;
  note: string;
  id: string;
  exchange: string;
  stopdesk: string;
};

export const ORDER_EXPORT_HEADERS = [
  'Nom Complet',
  'Telephone 1',
  'Telephone 2',
  'Produit',
  'Quantite',
  'Adresse',
  'Wilaya',
  'Commune',
  'Total a ramasser',
  'Note',
  'ID',
  'Echange ( OUI )',
  'Stopdesk ( OUI )',
] as const;

export function formatPhoneForOrderExport(value: string | null | undefined) {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) {
    return '';
  }

  return trimmed.startsWith('0') ? trimmed : `0${trimmed}`;
}

export function resolveWilayaLabel(catalog: EcotrackCatalogExportData | undefined, state: number | null) {
  if (state === null) {
    return '';
  }

  return catalog?.wilayas.find((entry) => entry.wilayaId === state)?.name ?? String(state);
}

export function resolveCommuneLabel(
  catalog: EcotrackCatalogExportData | undefined,
  state: number | null,
  city: string | null,
) {
  const rawCity = (city ?? '').trim();
  if (!rawCity) {
    return '';
  }

  if (!catalog || state === null) {
    return rawCity;
  }

  const commune = catalog.communes.find((entry) => entry.wilayaId === state && (String(entry.communeId) === rawCity || entry.name === rawCity));
  return commune?.name ?? rawCity;
}

export function buildOrderExportRows(orders: OrderRecord[], catalog: EcotrackCatalogExportData | undefined) {
  return orders.map((order) => ({
    fullName: order.fullName,
    phoneNumber1: formatPhoneForOrderExport(order.phoneNumber1),
    phoneNumber2: formatPhoneForOrderExport(order.phoneNumber2),
    product: order.orderProducts.map((product) => `${product.title}:${product.unitPrice}DA`).join('\n'),
    quantity: String(order.orderProducts.reduce((sum, product) => sum + product.quantity, 0)),
    address: order.homeAddress ?? '',
    wilaya: resolveWilayaLabel(catalog, order.state),
    commune: resolveCommuneLabel(catalog, order.state, order.city),
    totalToCollect: String(order.totalAmount),
    note: order.note ?? '',
    id: String(order.id),
    exchange: 'NON',
    stopdesk: order.delivery === 1 ? 'OUI' : 'NON',
  }));
}

export function buildOrderExportWorkbook(rows: OrderExportRow[]) {
  const sheet = XLSX.utils.aoa_to_sheet([
    [...ORDER_EXPORT_HEADERS],
    ...rows.map((row) => ([
      row.fullName,
      row.phoneNumber1,
      row.phoneNumber2,
      row.product,
      row.quantity,
      row.address,
      row.wilaya,
      row.commune,
      row.totalToCollect,
      row.note,
      row.id,
      row.exchange,
      row.stopdesk,
    ])),
  ]);

  sheet['!cols'] = [
    { wch: 24 },
    { wch: 16 },
    { wch: 16 },
    { wch: 36 },
    { wch: 10 },
    { wch: 28 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
    { wch: 24 },
    { wch: 12 },
    { wch: 14 },
    { wch: 16 },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Orders');
  return workbook;
}

export function buildOrderExportFileName(mode: 'selected' | 'confirmed', now = new Date()) {
  const timestamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    '-',
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('');

  return `${mode === 'confirmed' ? 'confirmed' : 'selected'}-orders-export-${timestamp}.xlsx`;
}
