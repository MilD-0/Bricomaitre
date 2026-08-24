type NumericValue = number | null | undefined;

export function formatNumber(locale: string, value: NumericValue, compact = false) {
  if (value == null) return '—';
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 1,
    notation: compact ? 'compact' : 'standard',
  }).format(value);
}

export function formatPercent(locale: string, value: NumericValue) {
  if (value == null) return '—';
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value)}%`;
}

export function formatCurrency(
  locale: string,
  value: NumericValue,
  currency: 'DZD' | 'EUR' | 'USD',
  options: { compact?: boolean; precision?: number } = {},
) {
  if (value == null) return '—';
  const precision = options.precision ?? (currency === 'USD' && Math.abs(value) < 0.1 ? 4 : 0);
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: currency === 'USD' ? precision : undefined,
    maximumFractionDigits: precision,
    notation: options.compact ? 'compact' : 'standard',
  }).format(value);
}

export function formatDzd(locale: string, value: NumericValue, compact = false) {
  return formatCurrency(locale, value, 'DZD', { compact, precision: compact ? 1 : 0 });
}

export function formatEur(locale: string, value: NumericValue) {
  return formatCurrency(locale, value, 'EUR');
}

export function formatUsd(locale: string, value: NumericValue) {
  return formatCurrency(locale, value, 'USD', {
    precision: value != null && Math.abs(value) < 0.1 ? 4 : 2,
  });
}

export function formatRatio(locale: string, value: NumericValue) {
  if (value == null) return '—';
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value)}×`;
}

export function formatDuration(locale: string, milliseconds: NumericValue) {
  if (milliseconds == null) return '—';
  if (milliseconds >= 1_000) return `${formatNumber(locale, milliseconds / 1_000)} s`;
  return `${formatNumber(locale, milliseconds)} ms`;
}

export function formatDate(
  locale: string,
  value: string | null | undefined,
  options: { includeTime?: boolean; long?: boolean } = {},
) {
  if (!value) return '—';
  const date = new Date(options.includeTime ? value : `${value.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(
    locale,
    options.includeTime
      ? { dateStyle: 'medium', timeStyle: 'short' }
      : options.long
        ? { dateStyle: 'medium' }
        : { month: 'short', day: 'numeric' },
  ).format(date);
}
