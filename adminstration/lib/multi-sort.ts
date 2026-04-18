export type SortDirection = 'asc' | 'desc';

export type SortRule<TSortKey extends string> = {
  key: TSortKey;
  direction: SortDirection;
};

export function toggleSortRule<TSortKey extends string>(
  currentRules: SortRule<TSortKey>[],
  key: TSortKey,
  defaultDirection: SortDirection = 'asc',
): SortRule<TSortKey>[] {
  const existingIndex = currentRules.findIndex((rule) => rule.key === key);

  if (existingIndex === -1) {
    return [...currentRules, { key, direction: defaultDirection }];
  }

  const existingRule = currentRules[existingIndex];

  if (existingRule.direction === 'asc') {
    return currentRules.map((rule, index) => (index === existingIndex ? { ...rule, direction: 'desc' } : rule));
  }

  return currentRules.filter((rule) => rule.key !== key);
}

export function getEffectiveSortRules<TSortKey extends string>(
  activeRules: SortRule<TSortKey>[],
  defaultRules: SortRule<TSortKey>[],
): SortRule<TSortKey>[] {
  return activeRules.length > 0 ? activeRules : defaultRules;
}

export function getSortRuleState<TSortKey extends string>(rules: SortRule<TSortKey>[], key: TSortKey) {
  const priority = rules.findIndex((rule) => rule.key === key);

  if (priority === -1) {
    return {
      active: false as const,
      direction: undefined,
      priority: undefined,
    };
  }

  return {
    active: true as const,
    direction: rules[priority]?.direction,
    priority: priority + 1,
  };
}

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

export function appendSortParams<TSortKey extends string>(params: URLSearchParams, sortRules: SortRule<TSortKey>[]) {
  sortRules.forEach((rule) => {
    params.append('sort', `${rule.key}:${rule.direction}`);
  });
}

export function parseSortRuleStrings<TSortKey extends string>(
  values: string[] | undefined,
  allowedKeys: readonly TSortKey[],
): { ok: true; rules: SortRule<TSortKey>[] } | { ok: false; issue: string } {
  if (!values || values.length === 0) {
    return { ok: true, rules: [] };
  }

  const allowedKeySet = new Set<string>(allowedKeys);
  const rules: SortRule<TSortKey>[] = [];

  for (const value of values) {
    const [key, direction, ...extraParts] = value.split(':');

    if (!key || !direction || extraParts.length > 0) {
      return { ok: false, issue: `Invalid sort rule "${value}". Expected "key:direction".` };
    }

    if (!allowedKeySet.has(key)) {
      return { ok: false, issue: `Invalid sort key "${key}".` };
    }

    if (direction !== 'asc' && direction !== 'desc') {
      return { ok: false, issue: `Invalid sort direction "${direction}".` };
    }

    rules.push({
      key: key as TSortKey,
      direction,
    });
  }

  return { ok: true, rules };
}
