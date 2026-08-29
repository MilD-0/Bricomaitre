import { describe, expect, it } from 'vitest';

import {
  buildSearchOpportunities,
  canonicalSearchPath,
  isBrandedSearchQuery,
  searchPageLabel,
} from './analytics-search';

describe('Analytics Search intelligence', () => {
  it('normalizes storefront locale paths without conflating hosts or query strings', () => {
    expect(canonicalSearchPath('https://bricomaitre.com/fr/products/perceuse?utm_source=x')).toBe(
      '/products/perceuse',
    );
    expect(canonicalSearchPath('https://bricomaitre.com/ar')).toBe('/');
    expect(searchPageLabel('https://bricomaitre.com/fr/products/perceuse')).toBe(
      '/products/perceuse · FR',
    );
    expect(searchPageLabel('https://bricomaitre.com/ar')).toBe('/ · AR');
  });

  it('keeps branded demand separate across common spellings', () => {
    expect(isBrandedSearchQuery('Bricomaitre Algérie')).toBe(true);
    expect(isBrandedSearchQuery('brico maître outils')).toBe(true);
    expect(isBrandedSearchQuery('perceuse sans fil')).toBe(false);
  });

  it('ranks recoverable clicks from the property own position-band benchmark', () => {
    const rows = [
      { key: 'strong query', clicks: 10, impressions: 100, position: 7, secondaryCount: 1 },
      { key: 'weak query', clicks: 0, impressions: 100, position: 8, secondaryCount: 2 },
      { key: 'deep query', clicks: 0, impressions: 80, position: 24, secondaryCount: 1 },
    ];
    const result = buildSearchOpportunities(rows);

    expect(result[0]).toMatchObject({
      query: 'weak query',
      benchmarkCtrPct: 5,
      potentialClicks: 5,
      opportunity: 'strikingDistance',
    });
    expect(
      result.some((row) => row.query === 'deep query' && row.opportunity === 'contentGap'),
    ).toBe(true);
  });
});
