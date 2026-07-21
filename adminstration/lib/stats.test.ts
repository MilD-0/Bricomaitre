import * as XLSX from 'xlsx';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import {
  buildCartProductLookup,
  buildAnalyticsWhere,
  buildAdCostEntriesFromSpreadsheetRow,
  collectCartProductReferenceBuckets,
  getCartProductLookupKey,
  isNumericOrderReference,
  manualOrderListQuerySchema,
  normalizeStatsDashboardData,
  normalizePhoneDigits,
  parseSpreadsheet,
  resolveOrderByPhoneAndDate,
  statsQuerySchema,
} from './stats';

describe('normalizeStatsDashboardData', () => {
  it('upgrades legacy snapshots with safe defaults for newer stats sections', () => {
    const normalized = normalizeStatsDashboardData({
      filters: { range: '90d', startDate: '2026-04-22', endDate: '2026-07-20' },
      summary: { totalOrders: 12 },
      website: { sessions: 25, pageViews: 80 },
      metaAds: { events: [], recentPayloads: [] },
    }, {
      range: '90d',
      startDate: '2026-04-22',
      endDate: '2026-07-20',
    });

    expect(normalized.summary.totalOrders).toBe(12);
    expect(normalized.website.sessions).toBe(25);
    expect(normalized.website.trend).toEqual([]);
    expect(normalized.landingPages.summary.published).toBe(0);
    expect(normalized.aiAssistants.admin.runs).toBe(0);
    expect(normalized.customers.customers).toEqual([]);
    expect(normalized.metaAds.paidAttribution.topCampaigns).toEqual([]);
  });
});

describe('statsQuerySchema', () => {
  it('accepts preset ranges without custom dates', () => {
    expect(statsQuerySchema.parse({ range: '90d' })).toEqual({ range: '90d' });
  });

  it('rejects invalid custom ranges', () => {
    expect(() => statsQuerySchema.parse({ range: 'custom' })).toThrowError('Provide at least one custom date.');
  });
});

describe('website analytics history scope', () => {
  it('keeps comparable events from both storefront generations in the selected dates', () => {
    const where = buildAnalyticsWhere({
      range: 'custom',
      startDate: '2026-06-01',
      endDate: '2026-06-30',
    });
    const query = new PgDialect().sqlToQuery(where!);

    expect(query.sql).toContain('analytics_events');
    expect(query.sql).not.toContain('storefrontProject');
    expect(query.params).toEqual(['2026-06-01', '2026-06-30']);
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

describe('buildAdCostEntriesFromSpreadsheetRow', () => {
  it('maps Meta campaign reports with website checkout conversions', () => {
    const entries = buildAdCostEntriesFromSpreadsheetRow({
      'Reporting starts': '2026-05-20',
      'Reporting ends': '2026-05-20',
      'Campaign name': 'sales campaign fo all - Copy',
      Reach: 120837,
      Impressions: 204540,
      'Link clicks': 8430,
      'Clicks (all)': 9597,
      'Amount spent (EUR)': 128.7,
      'Website checkouts initiated': 4,
    }, 230);

    expect(entries).toEqual([
      {
        date: '2026-05-20',
        platform: 'facebook',
        campaignName: 'sales campaign fo all - Copy',
        campaignId: null,
        spend: 29601,
        impressions: 204540,
        clicks: 9597,
        conversions: 4,
        reach: 120837,
        notes: 'Imported at rate 230',
      },
    ]);
  });

  it('splits multi-day campaign totals across report days', () => {
    const entries = buildAdCostEntriesFromSpreadsheetRow({
      'Reporting starts': '2026-05-19',
      'Reporting ends': '2026-05-20',
      Campaign: 'Two-day campaign',
      'Amount spent': 10,
      Clicks: 5,
      Conversions: 3,
    }, 100);

    expect(entries).toMatchObject([
      { date: '2026-05-19', spend: 500, clicks: 3, conversions: 2 },
      { date: '2026-05-20', spend: 500, clicks: 3, conversions: 2 },
    ]);
  });

  it('skips rows that do not include a date and spend', () => {
    expect(buildAdCostEntriesFromSpreadsheetRow({ 'Campaign name': 'Missing facts' }, 230)).toEqual([]);
  });
});

describe('manualOrderListQuerySchema', () => {
  it('parses paginated manual-order queries', () => {
    expect(manualOrderListQuerySchema.parse({ page: '2', limit: '10' })).toEqual({ page: 2, limit: 10 });
  });
});

describe('cart product reference matching', () => {
  it('only treats all-digit references as numeric order ids', () => {
    expect(isNumericOrderReference('42')).toBe(true);
    expect(isNumericOrderReference(' 7 ')).toBe(true);
    expect(isNumericOrderReference('f00000000000000000000007')).toBe(false);
    expect(isNumericOrderReference('ECU8XL26032495945')).toBe(false);
  });

  it('classifies numeric and mongo cart product references the same way as orders', () => {
    expect(getCartProductLookupKey('12')).toBe('id:12');
    expect(getCartProductLookupKey('f00000000000000000000005')).toBe('mongo:f00000000000000000000005');
    expect(getCartProductLookupKey('Desk Lamp')).toBeNull();
  });

  it('normalizes phone strings to digits only', () => {
    expect(normalizePhoneDigits('0660 91 76 96/')).toBe('0660917696');
  });

  it('resolves repeated-phone matches using nearest created date', () => {
    const result = resolveOrderByPhoneAndDate(
      [
        { id: 1, createdAt: new Date('2026-03-01T10:00:00.000Z') },
        { id: 2, createdAt: new Date('2026-03-24T10:00:00.000Z') },
      ],
      new Date('2026-03-24T05:40:51.312Z'),
    );

    expect(result).toMatchObject({ id: 2 });
  });

  it('keeps ambiguous repeated-phone matches unmatched when the date tie is exact', () => {
    const result = resolveOrderByPhoneAndDate(
      [
        { id: 1, createdAt: new Date('2026-03-23T00:00:00.000Z') },
        { id: 2, createdAt: new Date('2026-03-25T00:00:00.000Z') },
      ],
      new Date('2026-03-24T00:00:00.000Z'),
    );

    expect(result).toBeNull();
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
