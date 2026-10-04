import { sql } from 'drizzle-orm';

/** Immutable, row-local normalization for generated catalog search columns. */
export function catalogSearchDocumentSql(columns: readonly string[]) {
  const document = columns.map((column) => `coalesce("${column}", '')`).join(" || ' ' || ");
  return sql.raw(`translate(replace(replace(lower(regexp_replace(
    ${document}, '[ؐ-ًؚ-ٰٟۖ-ۭـ]', '', 'g'
  )), 'œ', 'oe'), 'æ', 'ae'),
    'àáâäãåæçèéêëìíîïñòóôöõœùúûüýÿأإآٱؤئىيىةکگ٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹',
    'aaaaaaaceeeeiiiinoooooouuuuyyااااوييييهكك01234567890123456789')`);
}
