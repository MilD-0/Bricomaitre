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
      { date: '2026-05-20', spend: 500, clicks: 3, conversions: 2 },
    ]);
  });

  it('skips rows that do not include a date and spend', () => {
    expect(buildAdCostEntriesFromSpreadsheetRow({ 'Campaign name': 'Missing facts' }, 230)).toEqual(
      [],
    );
  });
});
