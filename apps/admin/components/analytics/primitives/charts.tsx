'use client';
import { Line } from 'recharts';
import type { AnalyticsResolvedGrain } from '../../../lib/analytics';
import {
  formatEur,
  formatDzd as formatMoney,
  formatNumber,
  formatPercent,
  formatRatio,
} from '../analytics-format';

export function splitPartialSeries(
  rows: Array<Record<string, string | number | boolean | null>>,
  keys: string[],
) {
  return rows.map((row, index) => {
    const partial = row.isPartial === true;
    const forecast = row.isForecast === true;
    const nextIsOpen = rows[index + 1]?.isPartial === true || rows[index + 1]?.isForecast === true;
    const result = { ...row };
    for (const key of keys) {
      const projected = row[`${key}Projected`];
      const projectedValue = typeof projected === 'number' ? projected : null;
      result[`${key}Actual`] = forecast || partial ? null : row[key];
      result[`${key}Open`] = forecast
        ? projectedValue
        : partial
          ? projectedValue
          : nextIsOpen
            ? row[key]
            : null;
      result[`${key}Display`] = forecast || partial ? projectedValue : row[key];
    }
    return result;
  });
}

export function completedTrendBuckets<T extends { bucket: string }>(
  rows: T[],
  grain: AnalyticsResolvedGrain,
  endDate: string,
) {
  if (rows.length < 2 || grain === 'day') return rows;
  const lastBucket = rows.at(-1)?.bucket.slice(0, 10);
  if (!lastBucket) return rows;

  if (grain === 'month') {
    const [year, month, day] = endDate.split('-').map(Number);
    const finalDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    if (lastBucket.slice(0, 7) === endDate.slice(0, 7) && day < finalDay) {
      return rows.slice(0, -1);
    }
    return rows;
  }

  const bucketEnd = new Date(`${lastBucket}T00:00:00.000Z`);
  bucketEnd.setUTCDate(bucketEnd.getUTCDate() + 6);
  if (bucketEnd.toISOString().slice(0, 10) > endDate) return rows.slice(0, -1);
  return rows;
}

export function ActualOpenLine({
  dataKey,
  name,
  stroke,
  strokeWidth,
}: {
  dataKey: string;
  name: string;
  stroke: string;
  strokeWidth: number;
}) {
  return (
    <>
      <Line
        type="linear"
        dataKey={`${dataKey}Actual`}
        name={name}
        stroke={stroke}
        strokeWidth={strokeWidth}
        dot={false}
        connectNulls={false}
      />
      <Line
        type="linear"
        dataKey={`${dataKey}Open`}
        name={`${name} · Forecast`}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeDasharray="5 4"
        dot={false}
        connectNulls={false}
      />
    </>
  );
}

export function chartTooltip(
  locale: string,
  kind: 'money' | 'number' | 'ratio' | 'percent' | 'eur' = 'number',
) {
  return {
    contentStyle: {
      borderRadius: 'var(--shape-radius-chart-tooltip)',
      border: '1px solid color-mix(in oklab, var(--border) 70%, transparent)',
      background: 'color-mix(in oklab, var(--background) 96%, transparent)',
      fontSize: 'var(--type-size-chart-tooltip)',
    },
    formatter: (value: unknown, name: unknown) => {
      const number = Number(value);
      const formatted =
        kind === 'money'
          ? formatMoney(locale, number)
          : kind === 'ratio'
            ? formatRatio(locale, number)
            : kind === 'percent'
              ? formatPercent(locale, number)
              : kind === 'eur'
                ? formatEur(locale, number)
                : formatNumber(locale, number);
      return [formatted, String(name)];
    },
  } as const;
}
