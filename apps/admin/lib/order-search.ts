import { eq, ilike, or, sql } from 'drizzle-orm';
import { ecotrackCommunes, orders } from '@bric/db/schema';
import type { getDb } from '@bric/db/client';
import { normalizeAlgeriaPhone } from '@bric/storefront-core/meta';

export type OrderSearchDatabase = Pick<ReturnType<typeof getDb>, 'select' | 'execute'>;

export function orderCitySearchCondition(search: string) {
  const pattern = `%${search}%`;
  return or(
    ilike(orders.city, pattern),
    // Match the same wilaya-scoped IDs as commune display resolution. The
    // uncorrelated set lets PostgreSQL hash matching communes once per query.
    sql`(${orders.state}, btrim(${orders.city})) in (
      select ${ecotrackCommunes.wilayaId}, cast(${ecotrackCommunes.communeId} as text)
      from ${ecotrackCommunes}
      where ${ecotrackCommunes.name} ilike ${pattern}
    )`,
  );
}

export class OrderSearchTimeoutError extends Error {
  constructor() {
    super('Order search took too long. Narrow your search and retry.');
  }
}

export async function withOrderSearchTimeout<T>(
  db: ReturnType<typeof getDb>,
  search: string | undefined,
  read: (connection: OrderSearchDatabase) => Promise<T>,
) {
  if (!search) return read(db);
  return db
    .transaction(async (connection) => {
      // PostgreSQL stops the work even if a browser or gateway has already gone
      // away. SET LOCAL cannot leak this interactive budget to pooled workers.
      await connection.execute(sql`set local statement_timeout = '10s'`);
      return read(connection);
    })
    .catch((error: unknown) => {
      const cause = error instanceof Error && error.cause ? error.cause : error;
      if (
        typeof cause === 'object' &&
        cause !== null &&
        'code' in cause &&
        cause.code === '57014'
      ) {
        throw new OrderSearchTimeoutError();
      }
      throw error;
    });
}

export async function orderIdentifierSearchCondition(db: OrderSearchDatabase, search: string) {
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
