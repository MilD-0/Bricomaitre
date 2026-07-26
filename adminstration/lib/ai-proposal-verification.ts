function valuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (left instanceof Date && right instanceof Date) return left.getTime() === right.getTime();
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((value, index) => valuesEqual(value, right[index]));
  }
  if (left && right && typeof left === 'object' && typeof right === 'object') {
    const rightEntries = Object.entries(right);
    return Object.keys(left).length === rightEntries.length
      && rightEntries.every(([key, value]) => valuesEqual((left as Record<string, unknown>)[key], value));
  }
  return false;
}

export function persistedProposalValuesMatch(
  persisted: Record<string, unknown> | null | undefined,
  expected: Record<string, unknown>,
) {
  return Boolean(
    persisted
    && Object.entries(expected).every(([field, value]) => valuesEqual(persisted[field], value)),
  );
}
