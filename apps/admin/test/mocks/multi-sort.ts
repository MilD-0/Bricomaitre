import type { SortRule } from '../../lib/multi-sort';

type SortAccessors<TRow, TSortKey extends string> = Record<
  TSortKey,
  (row: TRow) => string | number | boolean | null | undefined
>;

function normalizeSortValue(value: string | number | boolean | null | undefined) {
  if (typeof value === 'string') {
    return value.toLowerCase();
  }

  if (typeof value === 'boolean') {
    return Number(value);
  }

  return value ?? '';
}

export function applyClientMultiSort<TRow, TSortKey extends string>(
  rows: TRow[],
  sortRules: SortRule<TSortKey>[],
  accessors: SortAccessors<TRow, TSortKey>,
): TRow[] {
  const indexedRows = rows.map((row, index) => ({ row, index }));

  indexedRows.sort((left, right) => {
    for (const rule of sortRules) {
      const leftValue = normalizeSortValue(accessors[rule.key](left.row));
      const rightValue = normalizeSortValue(accessors[rule.key](right.row));

      if (leftValue < rightValue) {
        return rule.direction === 'asc' ? -1 : 1;
      }

      if (leftValue > rightValue) {
        return rule.direction === 'asc' ? 1 : -1;
      }
    }

    return left.index - right.index;
  });

  return indexedRows.map(({ row }) => row);
}
