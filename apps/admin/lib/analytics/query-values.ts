import { sql, type SQLWrapper } from 'drizzle-orm';

export function numeric(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function nullableNumeric(value: unknown) {
  if (value == null) return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function isoValue(value: unknown) {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function datePredicate(column: SQLWrapper, startDate: string | null, endDate: string) {
  return sql`${startDate ? sql`${column} >= ${startDate}::date` : sql`true`}
    and ${column} <= ${endDate}::date`;
}

export function timestampPredicate(column: SQLWrapper, startDate: string | null, endDate: string) {
  // Convert the range boundaries, so indexes on the timestamp remain usable.
  return sql`${startDate ? sql`${column} >= (${startDate}::date::timestamp at time zone 'Africa/Algiers')` : sql`true`}
    and ${column} < ((${endDate}::date + interval '1 day') at time zone 'Africa/Algiers')`;
}
