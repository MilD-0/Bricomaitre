import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { buildIndexableLandingPageProductJoin } from './landing-page-records';

describe('indexable storefront landing pages', () => {
  it('requires the referenced product to remain active', () => {
    const query = new PgDialect().sqlToQuery(buildIndexableLandingPageProductJoin()!);

    expect(query.sql).toContain('"products"."id" = "landing_pages"."product_id"');
    expect(query.sql).toContain('"products"."active" =');
    expect(query.params).toEqual([true]);
  });
});
