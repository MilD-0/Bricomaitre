const MONEY_ABS_LIMIT = 10_000_000_000;

export function trimNullableText(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function trimNullableScalarText(value: unknown) {
  if (typeof value === 'string') {
    return trimNullableText(value);
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

export function readMongoId(value: unknown) {
  const directValue = trimNullableText(value);

  if (directValue) {
    return directValue;
  }

  if (typeof value === 'object' && value !== null && '$oid' in value) {
    return trimNullableText((value as { $oid?: unknown }).$oid);
  }

  return null;
}

export function readMongoDate(value: unknown, fallback = new Date()) {
  if (value == null || value === '') return fallback;
  let raw: unknown = value;
  if (typeof raw === 'object' && raw !== null && '$date' in raw) raw = raw.$date;
  if (typeof raw === 'object' && raw !== null && '$numberLong' in raw) {
    if (typeof raw.$numberLong !== 'string' || !/^-?\d+$/.test(raw.$numberLong))
      throw new Error('Invalid Mongo date milliseconds.');
    raw = Number(raw.$numberLong);
  }
  if (typeof raw === 'number') {
    if (!Number.isSafeInteger(raw)) throw new Error('Invalid Mongo date milliseconds.');
    const date = new Date(raw);
    if (!Number.isFinite(date.getTime())) throw new Error('Invalid Mongo date milliseconds.');
    return date;
  }
  if (
    typeof raw !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))?$/.test(raw)
  )
    throw new Error('Invalid Mongo date.');
  const date = new Date(raw);
  const [year, month, day] = raw.slice(0, 10).split('-').map(Number);
  const calendar = new Date(Date.UTC(year!, month! - 1, day!));
  if (
    !Number.isFinite(date.getTime()) ||
    calendar.getUTCFullYear() !== year ||
    calendar.getUTCMonth() !== month! - 1 ||
    calendar.getUTCDate() !== day
  )
    throw new Error('Invalid Mongo date.');
  return date;
}

export function toFiniteNumber(value: unknown, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

export function isSupportedMoneyValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) < MONEY_ABS_LIMIT;
}

export function toMoneyString(value: unknown) {
  const number = isSupportedMoneyValue(value) ? Number(value) : 1;
  return number.toFixed(2);
}

export function toOptionalMoneyString(value: unknown) {
  if (!isSupportedMoneyValue(value)) {
    return null;
  }

  return Number(value).toFixed(2);
}

export function normalizeImportName(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
}
