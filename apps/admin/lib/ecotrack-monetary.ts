function canonicalizeNonnegativeDecimal(value: unknown) {
  const text = String(value ?? '').trim();
  if (!text) return null;

  const match = /^([+-]?)(\d*)(?:\.(\d*))?$/.exec(text);
  if (!match || (!match[2] && !match[3])) return null;

  const [, sign, rawInteger = '', rawFraction = ''] = match;
  const integer = rawInteger || '0';
  const fraction = rawFraction.padEnd(3, '0');
  const isZero = /^0+$/.test(integer) && /^0*$/.test(rawFraction);
  if (sign === '-' && !isZero) return null;

  const centsPerUnit = BigInt(100);
  let cents = BigInt(integer) * centsPerUnit + BigInt(fraction.slice(0, 2));
  if (fraction[2] >= '5') cents += BigInt(1);

  return `${cents / centsPerUnit}.${String(cents % centsPerUnit).padStart(2, '0')}`;
}

/** Matches the persisted PostgreSQL numeric(…, 2) representation. */
export function normalizeEcotrackMonetaryValue(value: unknown) {
  return canonicalizeNonnegativeDecimal(value);
}

/**
 * Canonicalizes valid monetary values while retaining invalid provider values
 * so audit comparisons cannot silently equate corrupt input with a real null.
 */
export function normalizeEcotrackMonetarySnapshotValue(value: unknown) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  return canonicalizeNonnegativeDecimal(value) ?? text;
}
