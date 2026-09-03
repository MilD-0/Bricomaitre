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

  it('adds a title-specific score to broad exact and typo-tolerant relevance', () => {
    const relevance = buildCatalogSearchRelevance('Pérceuse');
    const query = new PgDialect().sqlToQuery(relevance!);

    expect(query.sql.match(/case when position/g)).toHaveLength(2);
    expect(query.sql.match(/word_similarity/g)).toHaveLength(2);
    expect(query.sql.match(/"products"\."title"/g)).toHaveLength(4);
    expect(query.sql.match(/"products"\."title_ar"/g)).toHaveLength(4);
    expect(query.sql.match(/"products"\."description"/g)).toHaveLength(2);
    expect(query.sql.match(/"products"\."description_ar"/g)).toHaveLength(2);
    expect(query.params.filter((parameter) => parameter === 'perceuse')).toHaveLength(4);
  });

  it('keeps the title boost for short queries without typo tolerance', () => {
    const relevance = buildCatalogSearchRelevance('vis');
    const query = new PgDialect().sqlToQuery(relevance!);

    expect(query.sql.match(/case when position/g)).toHaveLength(2);
    expect(query.sql).not.toContain('word_similarity');
    expect(query.sql.match(/"products"\."title"/g)).toHaveLength(2);
    expect(query.sql.match(/"products"\."description"/g)).toHaveLength(1);
  });
});
