export function parseMongoCollectionExport<T extends object>(input: string) {
  const raw = JSON.parse(input) as unknown;
  const items = Array.isArray(raw)
    ? raw
    : typeof raw === 'object' &&
        raw !== null &&
        'items' in raw &&
        Array.isArray((raw as { items: unknown[] }).items)
      ? (raw as { items: unknown[] }).items
      : null;

  if (!items) {
    throw new Error('Expected a JSON array or an object with an "items" array.');
  }

  return items.filter((item): item is T => typeof item === 'object' && item !== null);
}
