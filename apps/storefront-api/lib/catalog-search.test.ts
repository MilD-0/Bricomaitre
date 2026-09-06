import { describe, expect, it } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';

import {
  buildCatalogSearchCondition,
  buildCatalogSearchRelevance,
  getCatalogSearchSimilarityThreshold,
  normalizeCatalogSearch,
} from '@bric/storefront-core/catalog';

describe('storefront catalog search normalization', () => {
  it('normalizes French accents, punctuation, whitespace, and casing', () => {
    expect(normalizeCatalogSearch('  Éclairage — À   cœur, ÆG  ')).toBe('eclairage a coeur aeg');
  });

  it('normalizes Arabic diacritics, letter variants, tatweel, and localized digits', () => {
    expect(normalizeCatalogSearch('إِضَــاءَة ۱۲٣')).toBe('اضاءه 123');
    expect(normalizeCatalogSearch('أداة')).toBe(normalizeCatalogSearch('اداه'));
  });

  it('only enables typo tolerance when the query is specific enough', () => {
    expect(getCatalogSearchSimilarityThreshold('vis')).toBeNull();
    expect(getCatalogSearchSimilarityThreshold('lampe')).toBe(0.72);
    expect(getCatalogSearchSimilarityThreshold('perceuse')).toBe(0.64);
    expect(getCatalogSearchSimilarityThreshold('perceuse percussion')).toBe(0.58);
  });

  it('binds user search text as parameters in matching and ranking queries', () => {
    const input = "perceuse ' OR 1=1 --";
    const normalized = normalizeCatalogSearch(input);
    for (const build of [buildCatalogSearchCondition, buildCatalogSearchRelevance]) {
      const query = new PgDialect().sqlToQuery(build(input)!);
      expect(query.params).toContain(normalized);
      expect(query.sql).not.toContain(input);
      expect(query.sql).not.toContain(normalized);
    }
  });
});
