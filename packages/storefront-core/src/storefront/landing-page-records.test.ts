import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import {
  buildIndexableLandingPageProductJoin,
  readIndexableStorefrontLandingPages,
} from './landing-page-records';

describe('indexable storefront landing pages', () => {
  it('requires the referenced product to remain active', () => {
    const query = new PgDialect().sqlToQuery(buildIndexableLandingPageProductJoin()!);

    expect(query.sql).toContain('"products"."id" = "landing_pages"."product_id"');
    expect(query.sql).toContain('"products"."active" =');
    expect(query.params).toEqual([true]);
  });

  it('keeps direct-link campaign pages out of storefront discovery', async () => {
    await expect(readIndexableStorefrontLandingPages({} as never)).resolves.toEqual([]);
  });
});
