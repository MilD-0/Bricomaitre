import { eq, or, sql } from 'drizzle-orm';
import { orders } from '@bric/db/schema';
import type { getDb } from '@bric/db/client';
import { normalizeAlgeriaPhone } from '@bric/storefront-core/meta';

export async function orderIdentifierSearchCondition(db: ReturnType<typeof getDb>, search: string) {
  const value = search.trim();
  const phone = /^[+()\d\s.-]+$/.test(value) ? normalizeAlgeriaPhone(value) : null;
  if (phone) {
    const national = phone.slice(3);
    // The canonical column is indexed. The suffix fallback covers legacy primary
    // numbers and optional secondary numbers that predate canonical normalization.
    const condition = or(
      eq(orders.normalizedPhone, phone),
      sql`right(regexp_replace(${orders.phoneNumber1}, '[^0-9]', '', 'g'), ${national.length}) = ${national}`,
      sql`right(regexp_replace(${orders.phoneNumber2}, '[^0-9]', '', 'g'), ${national.length}) = ${national}`,
    );
    // Resolve phones without ordering first. Otherwise LIMIT can make the planner
    // walk the entire creation-time index for a rare or absent phone match.
    const matches = await db.select({ id: orders.id }).from(orders).where(condition);
    return matches.length
      ? sql`${orders.id} = any(${sql.param(matches.map((row) => row.id))}::bigint[])`
      : sql`false`;
  }
  if (/^#?\d{1,8}$/.test(value)) return eq(orders.id, Number(value.replace('#', '')));
  return undefined;
}
