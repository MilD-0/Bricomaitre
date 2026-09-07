import { and, or, sql, type SQL, type SQLWrapper } from 'drizzle-orm';

// Both supported calendars have non-null retained dates and dimension keys.
// Uncorrelated NOT IN sets are hashed once even when row-count estimates are
// low; a correlated timezone comparison can scan years of rollups per event.
export function unretainedTimestamp(
  timestamp: SQLWrapper,
  rollups: SQLWrapper,
  predicate: SQL = sql`true`,
  dimensions: Array<{ value: SQLWrapper; retained: SQLWrapper }> = [],
) {
  return or(
    sql`${timestamp} is null`,
    and(
      ...['UTC', 'Africa/Algiers'].map((timezone) => {
        const values = [
          sql`(${timestamp} at time zone ${timezone})::date`,
          ...dimensions.map((dimension) => dimension.value),
        ];
        const retained = [sql`rollup.day`, ...dimensions.map((dimension) => dimension.retained)];
        return sql`(${sql.join(values, sql`, `)}) not in (
          select ${sql.join(retained, sql`, `)} from ${rollups} rollup
          where rollup.day_timezone = ${timezone} and ${predicate}
        )`;
      }),
    ),
  )!;
}
