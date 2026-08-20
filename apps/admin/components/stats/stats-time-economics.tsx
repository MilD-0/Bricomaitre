'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';

import type { EconomicsReport } from '../../lib/stats-sections';
import { Button } from '../ui/button';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '../ui/chart';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import {
  formatBucket,
  formatCurrency,
  formatNumber,
  SectionCard,
} from './stats-dashboard-primitives';

type Grain = 'daily' | 'weekly' | 'monthly';
type Mode = 'realized' | 'adjusted';

function fridayWeek(date: string) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() - ((value.getUTCDay() - 5 + 7) % 7));
  return value.toISOString().slice(0, 10);
}

function bucket(date: string, grain: Grain) {
  if (grain === 'monthly') return date.slice(0, 7);
  if (grain === 'weekly') return fridayWeek(date);
  return date;
}

function formatRatio(locale: string, value: number | null) {
  return value == null
    ? '—'
    : `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value)}×`;
}

export function StatsTimeEconomics({ grain, report }: { grain: Grain; report: EconomicsReport }) {
  const locale = useLocale();
  const t = useTranslations('statsDashboard');
  const [mode, setMode] = useState<Mode>('realized');
  const chartData = useMemo(() => {
    const rows = new Map<string, Record<string, number | string | null>>();
    if (mode === 'realized') {
      for (const day of [...report.realized.days].reverse()) {
        const key = bucket(day.date, grain);
        const row = rows.get(key) ?? {
          bucket: key,
          settledRevenueDzd: 0,
          settledFeesDzd: 0,
          settledProfitDzd: 0,
          settledAfterAdsDzd: 0,
          coveredAdDays: 0,
        };
        row.settledRevenueDzd = Number(row.settledRevenueDzd) + day.netRevenueDzd;
        row.settledFeesDzd = Number(row.settledFeesDzd) + day.feesDzd;
        row.settledProfitDzd = Number(row.settledProfitDzd) + day.realizedProfitDzd;
        if (day.realizedProfitAfterAdsDzd != null) {
          row.settledAfterAdsDzd = Number(row.settledAfterAdsDzd) + day.realizedProfitAfterAdsDzd;
          row.coveredAdDays = Number(row.coveredAdDays) + 1;
        }
        rows.set(key, row);
      }
    } else {
      for (const day of [...report.days].reverse()) {
        const key = bucket(day.date, grain);
        const row = rows.get(key) ?? {
          bucket: key,
          beforeReturnDzd: 0,
          adjustedProfitDzd: 0,
          adCostDzd: 0,
          netProfitDzd: 0,
          trueProfitDzd: 0,
          coveredDays: 0,
        };
        if (day.metrics.adjustedProfitDzd != null) {
          row.beforeReturnDzd = Number(row.beforeReturnDzd) + (day.grossProfitDzd || 0);
          row.adjustedProfitDzd = Number(row.adjustedProfitDzd) + day.metrics.adjustedProfitDzd;
          row.adCostDzd = Number(row.adCostDzd) + (day.metrics.adCostDzd || 0);
          row.netProfitDzd = Number(row.netProfitDzd) + (day.metrics.netProfitDzd || 0);
          row.trueProfitDzd = Number(row.trueProfitDzd) + (day.trueProfitDzd || 0);
          row.coveredDays = Number(row.coveredDays) + 1;
        }
        rows.set(key, row);
      }
    }
    return [...rows.values()].map((row) => ({
      ...row,
      settledAfterAdsDzd: Number(row.coveredAdDays) > 0 ? row.settledAfterAdsDzd : null,
      beforeReturnDzd: Number(row.coveredDays) > 0 ? row.beforeReturnDzd : null,
      adjustedProfitDzd: Number(row.coveredDays) > 0 ? row.adjustedProfitDzd : null,
      netProfitDzd: Number(row.coveredDays) > 0 ? row.netProfitDzd : null,
      trueProfitDzd: Number(row.coveredDays) > 0 ? row.trueProfitDzd : null,
    }));
  }, [grain, mode, report]);
  const cumulativeData = useMemo(() => {
    const totals: Record<string, number> = {};
    return chartData.map((row) => {
      const next: Record<string, string | number | null> = { ...row };
      for (const [key, value] of Object.entries(row)) {
        if (key === 'bucket' || key.endsWith('Days') || value == null) continue;
        totals[key] = (totals[key] || 0) + Number(value);
        next[`cumulative_${key}`] = totals[key];
      }
      return next;
    });
  }, [chartData]);
  const financialConfig = {
    settledRevenueDzd: { label: t('time.economics.settledRevenue'), color: 'hsl(var(--chart-1))' },
    settledFeesDzd: { label: t('time.economics.settledFees'), color: 'hsl(var(--chart-4))' },
    settledProfitDzd: { label: t('time.economics.settledProfit'), color: 'hsl(var(--chart-2))' },
    settledAfterAdsDzd: {
      label: t('time.economics.settledAfterAds'),
      color: 'hsl(var(--chart-5))',
    },
    beforeReturnDzd: { label: t('time.economics.beforeReturns'), color: 'hsl(var(--chart-1))' },
    adjustedProfitDzd: { label: t('profitTracker.cards.adjusted'), color: 'hsl(var(--chart-2))' },
    adCostDzd: { label: t('profitTracker.metrics.adCost'), color: 'hsl(var(--chart-4))' },
    netProfitDzd: { label: t('profitTracker.cards.net'), color: 'hsl(var(--chart-3))' },
    trueProfitDzd: { label: t('profitTracker.cards.trueProfit'), color: 'hsl(var(--chart-5))' },
  } satisfies ChartConfig;
  const series =
    mode === 'realized'
      ? ['settledRevenueDzd', 'settledFeesDzd', 'settledProfitDzd', 'settledAfterAdsDzd']
      : ['beforeReturnDzd', 'adjustedProfitDzd', 'adCostDzd', 'netProfitDzd', 'trueProfitDzd'];

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {(['realized', 'adjusted'] as Mode[]).map((value) => (
          <Button
            key={value}
            type="button"
            variant={mode === value ? 'default' : 'outline'}
            onClick={() => setMode(value)}
          >
            {t(`time.economics.${value}`)}
          </Button>
        ))}
      </div>
      <SectionCard title={t('time.economics.performance')}>
        <ChartContainer config={financialConfig} className="h-[380px]">
          <LineChart data={chartData}>
            <CartesianGrid vertical={false} strokeDasharray="4 6" />
            <XAxis
              dataKey="bucket"
              tickFormatter={(value) => formatBucket(locale, String(value))}
              minTickGap={22}
              tickLine={false}
              axisLine={false}
            />
            <YAxis hide />
            <ChartTooltip
              content={
                <ChartTooltipContent formatter={(value) => formatCurrency(locale, Number(value))} />
              }
            />
            {series.map((key, index) => (
              <Line
                key={key}
                dataKey={key}
                stroke={`var(--color-${key})`}
                strokeWidth={index < 2 ? 3 : 2}
                dot={false}
                connectNulls={false}
              />
            ))}
            <ChartLegend content={<ChartLegendContent />} />
          </LineChart>
        </ChartContainer>
      </SectionCard>
      <SectionCard title={t('profitTracker.charts.cumulative')}>
        <ChartContainer config={financialConfig} className="h-[360px]">
          <LineChart data={cumulativeData}>
            <CartesianGrid vertical={false} strokeDasharray="4 6" />
            <XAxis
              dataKey="bucket"
              tickFormatter={(value) => formatBucket(locale, String(value))}
              minTickGap={22}
              tickLine={false}
              axisLine={false}
            />
            <YAxis hide />
            <ChartTooltip
              content={
                <ChartTooltipContent formatter={(value) => formatCurrency(locale, Number(value))} />
              }
            />
            {series
              .filter((key) => !['settledRevenueDzd', 'settledFeesDzd', 'adCostDzd'].includes(key))
              .map((key) => (
                <Line
                  key={key}
                  dataKey={`cumulative_${key}`}
                  name={financialConfig[key as keyof typeof financialConfig].label}
                  stroke={`var(--color-${key})`}
                  strokeWidth={2.5}
                  dot={false}
                  connectNulls={false}
                />
              ))}
          </LineChart>
        </ChartContainer>
      </SectionCard>
      <SectionCard title={t('profitTracker.weekly.title')}>
        <div className="max-w-full overflow-x-auto rounded-[1.25rem] border border-border/70">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('profitTracker.weekly.week')}</TableHead>
                <TableHead>{t('profitTracker.cards.spend')}</TableHead>
                <TableHead>{t('profitTracker.cards.net')}</TableHead>
                <TableHead>{t('profitTracker.cards.profitX')}</TableHead>
                <TableHead>{t('profitTracker.costs.title')}</TableHead>
                <TableHead>{t('profitTracker.cards.trueProfit')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.weeks.map((week) => (
                <TableRow key={week.weekStart}>
                  <TableCell>{formatBucket(locale, week.weekStart)}</TableCell>
                  <TableCell>{formatCurrency(locale, week.adCostDzd)}</TableCell>
                  <TableCell>{formatCurrency(locale, week.netProfitDzd)}</TableCell>
                  <TableCell>{formatRatio(locale, week.profitX)}</TableCell>
                  <TableCell>{formatCurrency(locale, week.operatingCostDzd)}</TableCell>
                  <TableCell>{formatCurrency(locale, week.trueProfitDzd)}</TableCell>
                </TableRow>
              ))}
              {report.weeks.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    {t('profitTracker.empty')}
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          {t('time.economics.fridayWeeks', { count: formatNumber(locale, report.weeks.length) })}
        </p>
      </SectionCard>
    </>
  );
}
