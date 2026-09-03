import { sql } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { buildRecommendedProductOrderBy } from '@bric/storefront-core/catalog';

describe('recommended catalog ranking', () => {
  it('pins direct, brand, and category featured-group matches before trusted commerce ranking', () => {
    const dialect = new PgDialect();
    const query = dialect.sqlToQuery(sql.join(buildRecommendedProductOrderBy(), sql.raw(', '))).sql;

    expect(query).toContain('"show_at_top_of_products_page" = true');
    expect(query).toContain('from "featured_product_group_products"');
    expect(query).toContain('from "featured_product_group_brands"');
    expect(query).toContain('from "featured_product_group_categories"');
    expect(query).toMatch(
      /sort_order[\s\S]+in_stock[\s\S]+units_sold[\s\S]+updated_at[\s\S]+"products"\."id"/,
    );
    expect(query).not.toContain('popularity_score');
    expect(query).not.toContain('purchase_count');
  });

  it('places textual relevance ahead of featured and commerce ranking for a search', () => {
    const dialect = new PgDialect();
    const query = dialect.sqlToQuery(
      sql.join(buildRecommendedProductOrderBy('perceuse'), sql.raw(', ')),
    ).sql;

    expect(query.indexOf('word_similarity')).toBeLessThan(
      query.indexOf('show_at_top_of_products_page'),
    );
  });
});
