import { describe, expect, it } from 'vitest';

import { buildAdCostEntriesFromSpreadsheetRow } from './stats-ad-costs';

describe('buildAdCostEntriesFromSpreadsheetRow', () => {
  it('maps Meta campaign reports with website checkout conversions', () => {
    const entries = buildAdCostEntriesFromSpreadsheetRow(
      {
        'Reporting starts': '2026-05-20',
        'Reporting ends': '2026-05-20',
        'Campaign name': 'sales campaign fo all - Copy',
        Reach: 120837,
        Impressions: 204540,
        'Link clicks': 8430,
        'Clicks (all)': 9597,
        'Amount spent (EUR)': 128.7,
        'Website checkouts initiated': 4,
      },
      230,
    );

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
    const entries = buildAdCostEntriesFromSpreadsheetRow(
      {
        'Reporting starts': '2026-05-19',
        'Reporting ends': '2026-05-20',
        Campaign: 'Two-day campaign',
        'Amount spent': 10,
        Clicks: 5,
        Conversions: 3,
      },
      100,
    );

    expect(entries).toMatchObject([
      { date: '2026-05-19', spend: 500, clicks: 3, conversions: 2 },
      { date: '2026-05-20', spend: 500, clicks: 2, conversions: 1 },
    ]);
  });

  it('preserves indivisible cents and every count, including explicit zero days', () => {
    const entries = buildAdCostEntriesFromSpreadsheetRow(
      {
        'Reporting starts': '2026-05-19',
        'Reporting ends': '2026-05-21',
        'Amount spent': 0.01,
        Clicks: 1,
        Conversions: 2,
        Impressions: 8,
        Reach: 4,
      },
      1,
    );
    expect(entries.map((entry) => entry.spend)).toEqual([0.01, 0, 0]);
    for (const [key, total] of Object.entries({
      clicks: 1,
      conversions: 2,
      impressions: 8,
      reach: 4,
    })) {
      expect(entries.reduce((sum, entry) => sum + (entry[key as 'clicks'] ?? 0), 0)).toBe(total);
    }
    expect(entries[2]).toMatchObject({ spend: 0, clicks: 0, conversions: 0 });
  });

  it('keeps missing optional counters distinct from explicitly reported zero', () => {
    const [entry] = buildAdCostEntriesFromSpreadsheetRow(
      { Date: '2026-05-19', 'Amount spent': 10, Clicks: 0 },
      1,
    );
    expect(entry).toMatchObject({ clicks: 0 });
    expect(entry?.impressions).toBeUndefined();
    expect(entry?.conversions).toBeUndefined();
    expect(entry?.reach).toBeUndefined();
  });

  it('rejects reversed reporting periods instead of inventing a one-day allocation', () => {
    expect(() =>
      buildAdCostEntriesFromSpreadsheetRow(
        {
          'Reporting starts': '2026-05-21',
          'Reporting ends': '2026-05-19',
          'Amount spent': 10,
        },
        230,
      ),
    ).toThrow('ends before');
  });

  it('skips rows that do not include a date and spend', () => {
    expect(buildAdCostEntriesFromSpreadsheetRow({ 'Campaign name': 'Missing facts' }, 230)).toEqual(
      [],
    );
  });
});
