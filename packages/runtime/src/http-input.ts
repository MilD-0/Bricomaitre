export function parsePositiveIntegerId(value: string) {
  if (!/^\d+$/.test(value)) {
    return null;
  }

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export function parsePositiveIntegerIds(values: readonly unknown[]) {
  if (values.length === 0) {
    return null;
  }

  const ids: number[] = [];
  for (const value of values) {
    const parsed =
      typeof value === 'number'
        ? Number.isSafeInteger(value) && value > 0
          ? value
          : null
        : typeof value === 'string'
          ? parsePositiveIntegerId(value)
          : null;

    if (parsed === null) {
      return null;
    }

    ids.push(parsed);
  }

  return [...new Set(ids)];
}
