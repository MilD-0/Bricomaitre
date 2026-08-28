import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { buildAssetProductSearch } from './admin-assets-data';

describe('Admin asset product search', () => {
  it('uses the normalized token and relevance semantics shared with Storefront search', () => {
    const search = buildAssetProductSearch('ponceuse crown bande');
    const dialect = new PgDialect();
    const condition = dialect.sqlToQuery(search.condition!);
    const relevance = dialect.sqlToQuery(search.relevance!);

    expect(condition.sql).toContain('word_similarity');
    expect(condition.sql).toContain('"brands"."name"');
    expect(condition.sql).toContain('"categories"."name_ar"');
    expect(condition.params).toEqual(
      expect.arrayContaining(['ponceuse', 'crown', 'bande', 'ponceuse crown bande']),
    );
    expect(relevance.sql).toContain('word_similarity');
    expect(relevance.params).toContain('ponceuse crown bande');
  });
});
