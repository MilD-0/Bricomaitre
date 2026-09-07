import { categories } from './fixture-catalog.mjs';
import { brands } from './fixture-homepage.mjs';

function normalizeSearch(value) {
  return value
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .replace(/[\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed\u0640]/gu, '')
    .toLocaleLowerCase('fr')
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ؤ/g, 'و')
    .replace(/[ئىيى]/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function editDistance(left, right) {
  const row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let previous = row[0];
    row[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const current = row[rightIndex];
      row[rightIndex] = Math.min(
        row[rightIndex] + 1,
        row[rightIndex - 1] + 1,
        previous + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
      previous = current;
    }
  }
  return row[right.length];
}

export function matchesSearch(item, query) {
  const normalizedQuery = normalizeSearch(query);
  if (!normalizedQuery) return true;
  const brand = brands.find((entry) => entry.id === item.brandId);
  const category = categories.find((entry) => entry.id === item.categoryId);
  const document = normalizeSearch(
    `${item.title} ${item.titleAr ?? ''} ${item.description ?? ''} ${item.descriptionAr ?? ''} ${item.sku ?? ''} ${item.barcode ?? ''} ${item.slug ?? ''} ${item.mongoId ?? ''} ${brand?.name ?? ''} ${category?.name ?? ''} ${category?.nameAr ?? ''}`,
  );
  if (document.includes(normalizedQuery)) return true;
  const words = document.split(' ');
  return normalizedQuery
    .split(' ')
    .every(
      (term) =>
        document.includes(term) ||
        (term.length >= 4 &&
          words.some(
            (word) =>
              editDistance(term, word) <= Math.min(2, Math.max(1, Math.floor(term.length * 0.2))),
          )),
    );
}
