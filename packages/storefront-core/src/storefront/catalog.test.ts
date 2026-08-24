import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { buildCatalogCountProductVisibilityCondition } from './catalog';

describe('catalog count release compatibility', () => {
  it('does not reference the archive column directly before its migration exists', () => {
    const query = new PgDialect().sqlToQuery(buildCatalogCountProductVisibilityCondition()!);

    expect(query.sql).toContain('"products"."active" =');
    expect(query.sql).toContain(`to_jsonb("products") ->> 'archived_at'`);
    expect(query.sql).not.toContain('"products"."archived_at"');
    expect(query.params).toEqual([true]);
  });
});
