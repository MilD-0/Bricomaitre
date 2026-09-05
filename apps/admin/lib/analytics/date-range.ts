import {
  analyticsQuerySchema,
  ISO_DATE_PATTERN,
  type AnalyticsFilters,
  type AnalyticsQuery,
  type AnalyticsResolvedGrain,
} from './contract';

export function addDays(date: string, amount: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

export function inclusiveDays(startDate: string, endDate: string) {
  return (
    Math.floor(
      (Date.parse(`${endDate}T00:00:00.000Z`) - Date.parse(`${startDate}T00:00:00.000Z`)) /
        86_400_000,
    ) + 1
  );
}

export function dayInTimezone(now: Date, timezone = 'Africa/Algiers') {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function remainingDayFraction(now: Date, timezone = 'Africa/Algiers') {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const elapsedSeconds =
    Number(values.hour) * 3_600 + Number(values.minute) * 60 + Number(values.second);
  return Math.max(0, Math.min(1, 1 - elapsedSeconds / 86_400));
}

export function resolveAnalyticsReferenceNow(
  setting: string | undefined,
  cutoffDate: string | null,
  wallNow = new Date(),
) {
  const normalized = setting?.trim().toLowerCase();
  const explicitDate = ISO_DATE_PATTERN.test(normalized ?? '') ? normalized! : null;
  const referenceDate = explicitDate ?? (normalized === 'dataset' ? cutoffDate : null);
  if (!referenceDate) {
    return { now: wallNow, referenceDate: dayInTimezone(wallNow), reviewClock: false };
  }
  return {
    now: new Date(`${referenceDate}T12:00:00.000Z`),
    referenceDate,
    reviewClock: true,
  };
}

export function clipAnalyticsFilters(
  filters: AnalyticsFilters,
  throughDate: string | null,
  coverageStartDate: string | null = null,
): AnalyticsFilters {
  const startDate =
    coverageStartDate && (!filters.startDate || coverageStartDate > filters.startDate)
      ? coverageStartDate
      : filters.startDate;
  const endDate = throughDate && throughDate < filters.endDate ? throughDate : filters.endDate;
  const startWasClipped = startDate !== filters.startDate;
  if (startDate && endDate < startDate) {
    return { ...filters, startDate, endDate, comparisonStartDate: null, comparisonEndDate: null };
  }
  if (!startWasClipped && endDate === filters.endDate) return filters;
  const elapsedDays = startDate ? inclusiveDays(startDate, endDate) : null;
  const comparisonEndDate = startWasClipped || !startDate ? null : addDays(startDate, -1);
  const comparisonStartDate =
    elapsedDays && comparisonEndDate ? addDays(comparisonEndDate, -(elapsedDays - 1)) : null;
  return { ...filters, startDate, endDate, comparisonStartDate, comparisonEndDate };
}

export function clampQueryToReference(query: AnalyticsQuery, referenceDate: string) {
  if (query.range !== 'custom' || !query.startDate || !query.endDate) return query;
  const endDate = query.endDate > referenceDate ? referenceDate : query.endDate;
  return {
    ...query,
    startDate: query.startDate > endDate ? endDate : query.startDate,
    endDate,
  };
}

function autoGrain(startDate: string | null, endDate: string): AnalyticsResolvedGrain {
  if (!startDate) return 'month';
  const days = inclusiveDays(startDate, endDate);
  if (days <= 45) return 'day';
  if (days <= 240) return 'week';
  return 'month';
}

export function resolveAnalyticsFilters(raw: AnalyticsQuery, now = new Date()): AnalyticsFilters {
  const parsed = analyticsQuerySchema.parse(raw);
  const referenceDate = dayInTimezone(now);
  const endDate =
    parsed.range === 'custom'
      ? parsed.endDate!
      : parsed.range === 'all' && parsed.endDate
        ? parsed.endDate > referenceDate
          ? referenceDate
          : parsed.endDate
        : referenceDate;
  let startDate: string | null;

  switch (parsed.range) {
    case '7d':
      startDate = addDays(endDate, -6);
      break;
    case '14d':
      startDate = addDays(endDate, -13);
      break;
    case '30d':
      startDate = addDays(endDate, -29);
      break;
    case '90d':
      startDate = addDays(endDate, -89);
      break;
    case 'year':
      startDate = `${endDate.slice(0, 4)}-01-01`;
      break;
    case 'custom':
      startDate = parsed.startDate!;
      break;
    case 'all':
      startDate = null;
      break;
  }

  const comparisonEndDate = startDate ? addDays(startDate, -1) : null;
  const comparisonStartDate =
    startDate && comparisonEndDate
      ? addDays(comparisonEndDate, -(inclusiveDays(startDate, endDate) - 1))
      : null;

  return {
    view: parsed.view,
    range: parsed.range,
    startDate,
    endDate,
    grain: parsed.grain,
    resolvedGrain: parsed.grain === 'auto' ? autoGrain(startDate, endDate) : parsed.grain,
    comparisonStartDate,
    comparisonEndDate,
  };
}
