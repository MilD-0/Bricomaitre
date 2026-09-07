import { brands, categories, products } from '@bric/db/schema';
import { and, ilike, or, sql } from 'drizzle-orm';

export type StorefrontProductTokenMatch = 'slug' | 'mongoId' | 'id';

const ARABIC_DIACRITICS = /[\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed\u0640]/gu;

const SEARCH_DOCUMENT_TRANSLATE_FROM =
  'àáâäãåæçèéêëìíîïñòóôöõœùúûüýÿأإآٱؤئىيىةکگ٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹';

const SEARCH_DOCUMENT_TRANSLATE_TO =
  'aaaaaaaceeeeiiiinoooooouuuuyyااااوييييهكك01234567890123456789';

export function normalizeCatalogSearch(value: string) {
  return value
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .replace(ARABIC_DIACRITICS, '')
    .toLocaleLowerCase('fr')
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/[ؤ]/g, 'و')
    .replace(/[ئىيى]/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ک/g, 'ك')
    .replace(/گ/g, 'ك')
    .replace(/[٠١٢٣٤٥٦٧٨٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/[۰۱۲۳۴۵۶۷۸۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function getCatalogSearchSimilarityThreshold(value: string) {
  const length = normalizeCatalogSearch(value).replaceAll(' ', '').length;
  if (length < 4) return null;
  if (length <= 5) return 0.72;
  if (length <= 8) return 0.64;
  return 0.58;
}

export function buildCatalogSearchCondition(value: string) {
  const normalized = normalizeCatalogSearch(value);
  if (!normalized) return undefined;

  const document = buildCatalogSearchDocument();
  const exactTokens = normalized
    .split(' ')
    .map((token) => sql<boolean>`position(${token} in ${document}) > 0`);
  const threshold = getCatalogSearchSimilarityThreshold(normalized);

  return or(
    ilike(products.title, `%${value}%`),
    ilike(products.titleAr, `%${value}%`),
    ilike(products.sku, `%${value}%`),
    ilike(products.barcode, `%${value}%`),
    and(...exactTokens),
    threshold === null
      ? undefined
      : sql<boolean>`word_similarity(${normalized}, ${document}) >= ${threshold}`,
  );
}

function buildCatalogSearchDocument() {
  return sql<string>`translate(replace(replace(lower(regexp_replace(
    coalesce(${products.title}, '') || ' ' ||
    coalesce(${products.titleAr}, '') || ' ' ||
    coalesce(${products.description}, '') || ' ' ||
    coalesce(${products.descriptionAr}, '') || ' ' ||
    coalesce(${products.sku}, '') || ' ' ||
    coalesce(${products.barcode}, '') || ' ' ||
    coalesce(${products.slug}, '') || ' ' ||
    coalesce(${products.mongoId}, '') || ' ' ||
    coalesce(${brands.name}, '') || ' ' ||
    coalesce(${categories.name}, '') || ' ' ||
    coalesce(${categories.nameAr}, ''),
    '[\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed\u0640]', '', 'g'
  )), 'œ', 'oe'), 'æ', 'ae'), ${SEARCH_DOCUMENT_TRANSLATE_FROM}, ${SEARCH_DOCUMENT_TRANSLATE_TO})`;
}

function buildCatalogSearchTitleDocument() {
  return sql<string>`translate(replace(replace(lower(regexp_replace(
    coalesce(${products.title}, '') || ' ' ||
    coalesce(${products.titleAr}, ''),
    '[\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed\u0640]', '', 'g'
  )), 'œ', 'oe'), 'æ', 'ae'), ${SEARCH_DOCUMENT_TRANSLATE_FROM}, ${SEARCH_DOCUMENT_TRANSLATE_TO})`;
}

export function buildCatalogSearchRelevance(value: string) {
  const normalized = normalizeCatalogSearch(value);
  if (!normalized) return undefined;

  const document = buildCatalogSearchDocument();
  const titleDocument = buildCatalogSearchTitleDocument();
  const exactMatch = sql<number>`case when position(${normalized} in ${document}) > 0 then 1 else 0 end`;
  const exactTitleMatch = sql<number>`case when position(${normalized} in ${titleDocument}) > 0 then 1 else 0 end`;
  const threshold = getCatalogSearchSimilarityThreshold(normalized);

  return threshold === null
    ? sql<number>`(${exactMatch} + ${exactTitleMatch})`
    : sql<number>`(
        ${exactMatch} + word_similarity(${normalized}, ${document}) +
        ${exactTitleMatch} + word_similarity(${normalized}, ${titleDocument})
      )`;
}

export function normalizeStorefrontProductToken(value: string) {
  const token = value.trim();
  const numericId =
    /^[1-9]\d*$/.test(token) && Number.isSafeInteger(Number(token)) ? Number(token) : null;

  return { token, numericId };
}

export function selectStorefrontProductTokenMatch<
  T extends { id: number; slug: string; mongoId: string | null },
>(rows: T[], token: string): { row: T; matchedBy: StorefrontProductTokenMatch } | null {
  const slugMatch = rows.find((row) => row.slug === token);
  if (slugMatch) {
    return { row: slugMatch, matchedBy: 'slug' };
  }

  const mongoIdMatch = rows.find((row) => row.mongoId === token);
  if (mongoIdMatch) {
    return { row: mongoIdMatch, matchedBy: 'mongoId' };
  }

  const { numericId } = normalizeStorefrontProductToken(token);
  const idMatch = numericId === null ? undefined : rows.find((row) => row.id === numericId);
  return idMatch ? { row: idMatch, matchedBy: 'id' } : null;
}
