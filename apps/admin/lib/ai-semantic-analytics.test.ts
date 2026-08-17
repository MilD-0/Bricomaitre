import { describe, expect, it } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { CONFIRMED_LIFECYCLE_ORDER_STATUSES } from '@bric/storefront-core/order-domain';
import { confirmedLifecycleOrderCondition } from './ai-semantic-analytics';

describe('semantic analytics order cohorts', () => {
  it('counts confirmed lifecycle orders and never treats no-answer as confirmed', () => {
    const dialect = new PgDialect();
    const query = dialect.sqlToQuery(sql`select 1 where ${confirmedLifecycleOrderCondition()}`);

    expect(CONFIRMED_LIFECYCLE_ORDER_STATUSES).toEqual([2, 3, 4, 5, 7, 8, 9, 10, 11]);
    expect(query.sql).toContain('"orders"."confirmed" in');
    expect(query.params).toEqual([...CONFIRMED_LIFECYCLE_ORDER_STATUSES]);
    expect(query.params).not.toContain(1);
  });
});
