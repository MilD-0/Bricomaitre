import { MetaAdsSyncError } from './config';
import { MAX_INSIGHTS_DAYS_PER_REQUEST } from './contract';

export function dayInTimezone(now: Date, timeZone: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function subtractDays(day: string, days: number) {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function addDays(day: string, days: number) {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function splitInsightsRange(since: string, until: string) {
  const ranges: Array<{ since: string; until: string }> = [];
  for (
    let cursor = since;
    cursor <= until;
    cursor = addDays(cursor, MAX_INSIGHTS_DAYS_PER_REQUEST)
  ) {
    const candidateUntil = addDays(cursor, MAX_INSIGHTS_DAYS_PER_REQUEST - 1);
    ranges.push({ since: cursor, until: candidateUntil < until ? candidateUntil : until });
  }
  return ranges;
}

export function dateOnly(value: string, field: string) {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    throw new MetaAdsSyncError(`${field} must be a valid YYYY-MM-DD date.`, 'invalid_date_range');
  }
  return value;
}
