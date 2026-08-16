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

  it('builds a parameterized bilingual catalog condition with guarded trigram matching', () => {
    const condition = buildCatalogSearchCondition('  Pérceuse  ');
    expect(condition).toBeDefined();
    const query = new PgDialect().sqlToQuery(condition!);

    expect(query.sql).toContain('"title_ar"');
    expect(query.sql).toContain('"description_ar"');
    expect(query.sql).toContain('"brands"."name"');
    expect(query.sql).toContain('"categories"."name_ar"');
    expect(query.sql).toContain('word_similarity');
    expect(query.params).toContain('perceuse');
    expect(query.params).toContain(0.64);
  });

  it('builds relevance ordering for typo-tolerant searches without weakening exact matches', () => {
    const relevance = buildCatalogSearchRelevance('Pérceuse');
    const query = new PgDialect().sqlToQuery(relevance!);

    expect(query.sql).toContain('case when position');
    expect(query.sql).toContain('word_similarity');
    expect(query.params).toContain('perceuse');
  });
});
