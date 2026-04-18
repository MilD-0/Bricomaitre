import * as XLSX from 'xlsx';

import type { OrderRecord } from './orders';

export type EcotrackCatalogExportData = {
  wilayas: Array<{ wilayaId: number; name: string }>;
  communes: Array<{ communeId: number; wilayaId: number; name: string; postalCode: string | null; hasStopDesk: boolean }>;
};

export type OrderExportRow = {
  reference: string;
  fullName: string;
  phoneNumber: string;
  phoneNumber2: string;
  wilayaCode: string;
  wilaya: string;
  commune: string;
  address: string;
  product: string;
  weightKg: string;
  totalToCollect: string;
  note: string;
  fragile: string;
  exchange: string;
  pickup: string;
  recouvrement: string;
  stopdesk: string;
  mapLink: string;
};

export const ORDER_EXPORT_HEADERS = [
  'reference commande',
  'nom et prenom du destinataire*',
  'telephone*',
  'telephone 2',
  'code wilaya*',
  'wilaya de livraison',
  'commune de livraison*',
  'adresse de livraison*',
  'produit*',
  'poids (kg)',
  'montant du colis*',
  'remarque',
  'FRAGILE\r\n( si oui mettez OUI sinon laissez vide )',
  'ECHANGE\r\n( si oui mettez OUI sinon laissez vide )',
  'PICK UP\r\n( si oui mettez OUI sinon laissez vide )',
  'RECOUVREMENT\r\n( si oui mettez OUI sinon laissez vide )',
  'STOP DESK\r\n( si oui mettez OUI sinon laissez vide )',
  'Lien map',
] as const;

const CONFIRMED_EXPORT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

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
    reference: String(order.id),
    fullName: order.fullName,
    phoneNumber: formatPhoneForOrderExport(order.phoneNumber1),
    phoneNumber2: formatPhoneForOrderExport(order.phoneNumber2),
    wilayaCode: order.state === null ? '' : String(order.state),
    wilaya: resolveWilayaLabel(catalog, order.state),
    commune: resolveCommuneLabel(catalog, order.state, order.city),
    address: order.homeAddress ?? '',
    product: order.orderProducts.map((product) => `${product.title} x${product.quantity}`).join('\n'),
    weightKg: '',
    totalToCollect: String(order.totalAmount),
    note: order.note ?? '',
    fragile: '',
    exchange: '',
    pickup: '',
    recouvrement: order.totalAmount > 0 ? 'OUI' : '',
    stopdesk: order.delivery === 1 ? 'OUI' : '',
    mapLink: '',
  }));
}

export function filterRecentConfirmedOrders(orders: OrderRecord[], now = new Date()) {
  const cutoff = now.getTime() - CONFIRMED_EXPORT_MAX_AGE_MS;

  return orders.filter((order) => {
    const createdAt = Date.parse(order.createdAt);
    return Number.isFinite(createdAt) && createdAt >= cutoff;
  });
}

export function buildOrderExportWorkbook(rows: OrderExportRow[]) {
  const sheet = XLSX.utils.aoa_to_sheet([
    [...ORDER_EXPORT_HEADERS],
    ...rows.map((row) => ([
      row.reference,
      row.fullName,
      row.phoneNumber,
      row.phoneNumber2,
      row.wilayaCode,
      row.wilaya,
      row.commune,
      row.address,
      row.product,
      row.weightKg,
      row.totalToCollect,
      row.note,
      row.fragile,
      row.exchange,
      row.pickup,
      row.recouvrement,
      row.stopdesk,
      row.mapLink,
    ])),
  ]);

  sheet['!cols'] = [
    { wch: 21 },
    { wch: 28 },
    { wch: 17 },
    { wch: 17 },
    { wch: 20 },
    { wch: 22 },
    { wch: 22 },
    { wch: 26 },
    { wch: 23 },
    { wch: 20 },
    { wch: 19 },
    { wch: 23 },
    { wch: 31 },
    { wch: 40 },
    { wch: 33 },
    { wch: 40 },
    { wch: 32 },
    { wch: 10 },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Sheet1');
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
