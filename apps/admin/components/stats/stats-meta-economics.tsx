'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  CircleDollarSign,
  Eye,
  MousePointerClick,
  RefreshCcw,
  ShoppingCart,
  Target,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from 'recharts';

import { requestJson as request } from '../../lib/admin-api';
import type { MetaCommerceReport } from '../../lib/meta-commerce-analytics';
import type { EconomicsReport } from '../../lib/stats-sections';
import { toast } from '../../lib/toast';
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
  MetricCard,
  SectionCard,
} from './stats-dashboard-primitives';

function formatRatio(locale: string, value: number | null) {
  return value == null
    ? '—'
    : `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value)}×`;
}

function formatEur(locale: string, value: number) {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2,
  }).format(value);
}

function minusDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() - days);
  return value.toISOString().slice(0, 10);
}

export function StatsMetaEconomics({
  commerce,
  report,
}: {
  commerce: MetaCommerceReport;
  report: EconomicsReport;
}) {
  const locale = useLocale();
  const t = useTranslations('statsDashboard');
  const queryClient = useQueryClient();
  const days = useMemo(
    () => [...report.days].reverse().map((day) => ({ ...day, ...day.metrics, breakEven: 1 })),
    [report.days],
  );
  const syncMutation = useMutation({
    mutationFn: () => {
      const until = report.filters.endDate;
      const since = report.filters.startDate
        ? report.filters.startDate > minusDays(until, 89)
          ? report.filters.startDate
          : minusDays(until, 89)
        : minusDays(until, 89);
      return request('/api/stats/profit-tracker/fetch-meta', {
        method: 'POST',
        body: JSON.stringify({ since, until }),
      });
    },
    onSuccess: async () => {
      toast.success(t('profitTracker.notifications.metaFetched'));
      await queryClient.invalidateQueries({ queryKey: ['stats-dashboard', 'metaAds'] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : t('errorDescription')),
  });
  const costPerPurchase =
    report.summary.fbPurchases > 0
      ? report.summary.rawAdCostDzd / report.summary.fbPurchases
      : null;
  const roasConfig = {
    profitX: { label: t('profitTracker.metrics.profitAfter'), color: 'hsl(var(--chart-2))' },
    profitXBeforeReturns: {
      label: t('profitTracker.metrics.profitBefore'),
      color: 'hsl(var(--chart-5))',
    },
    breakEven: {
      label: t('profitTracker.metrics.breakEven'),
      color: 'hsl(var(--muted-foreground))',
    },
  } satisfies ChartConfig;
  const creativeConfig = {
    cpm: { label: t('profitTracker.metrics.cpm'), color: 'hsl(var(--chart-4))' },
    ctr: { label: t('profitTracker.metrics.ctr'), color: 'hsl(var(--chart-2))' },
  } satisfies ChartConfig;
  const funnelConfig = {
    costPerConfirmedDzd: {
      label: t('profitTracker.metrics.costConfirmed'),
      color: 'hsl(var(--chart-5))',
    },
    confirmationRatePct: {
      label: t('profitTracker.metrics.confirmation'),
      color: 'hsl(var(--chart-2))',
    },
    clickToPageRatePct: {
      label: t('profitTracker.metrics.clickToPage'),
      color: 'hsl(var(--chart-1))',
    },
  } satisfies ChartConfig;
  const adsetNames = report.adsets.map((row) => row.adsetId);
  const adsetConfig = Object.fromEntries(
    report.adsets.map((row, index) => [
      row.adsetId,
      { label: row.adsetName, color: `hsl(var(--chart-${(index % 5) + 1}))` },
    ]),
  ) satisfies ChartConfig;
  const stackedSpend = useMemo(() => {
    const byDate = new Map<string, Record<string, string | number>>();
    for (const row of report.adsetDailySpend) {
      const item = byDate.get(row.date) ?? { date: row.date };
      item[row.adsetId] = Number(item[row.adsetId] || 0) + row.spendEur;
      byDate.set(row.date, item);
    }
    return [...byDate.values()].sort((left, right) =>
      String(left.date).localeCompare(String(right.date)),
    );
  }, [report.adsetDailySpend]);
  const commerceByAdset = useMemo(() => {
    const values = new Map<string, { orders: number; confirmed: number; paid: number }>();
    for (const row of commerce.rows) {
      if (!row.adsetId) continue;
      const current = values.get(row.adsetId) ?? { orders: 0, confirmed: 0, paid: 0 };
      current.orders += row.bricOrders;
      current.confirmed += row.confirmedOrders;
      current.paid += row.paidOrders;
      values.set(row.adsetId, current);
    }
    return values;
  }, [commerce.rows]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-end">
        <Button
          type="button"
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending}
        >
          <RefreshCcw className={syncMutation.isPending ? 'size-4 animate-spin' : 'size-4'} />
          {t('metaAds.performance.fetchRange')}
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4 2xl:grid-cols-8">
        <MetricCard
          accent="bg-blue-500"
          icon={CircleDollarSign}
          title={t('profitTracker.cards.spend')}
          value={formatEur(locale, report.summary.spendEur)}
        />
        <MetricCard
          accent="bg-violet-500"
          icon={Eye}
          title={t('metaAds.performance.impressions')}
          value={formatNumber(locale, report.summary.impressions)}
        />
        <MetricCard
          accent="bg-cyan-500"
          icon={MousePointerClick}
          title={t('metaAds.integrated.cards.metaClicks')}
          value={formatNumber(
            locale,
            days.reduce((sum, day) => sum + (day.linkClicks || 0), 0),
          )}
        />
        <MetricCard
          accent="bg-indigo-500"
          icon={Target}
          title={t('metaAds.performance.landingViews')}
          value={formatNumber(
            locale,
            days.reduce((sum, day) => sum + (day.landingPageViews || 0), 0),
          )}
        />
        <MetricCard
          accent="bg-emerald-500"
          icon={ShoppingCart}
          title={t('metaAds.performance.purchases')}
          value={formatNumber(locale, report.summary.fbPurchases)}
        />
        <MetricCard
          accent="bg-amber-500"
          icon={CircleDollarSign}
          title={t('metaAds.performance.costPurchase')}
          value={costPerPurchase == null ? '—' : formatCurrency(locale, costPerPurchase)}
        />
        <MetricCard
          accent="bg-rose-500"
          icon={Activity}
          title={t('profitTracker.metrics.costConfirmed')}
          value={
            report.summary.costPerConfirmedDzd == null
              ? '—'
              : formatCurrency(locale, report.summary.costPerConfirmedDzd)
          }
        />
        <MetricCard
          accent="bg-primary"
          icon={Target}
          title={t('profitTracker.cards.profitX')}
          value={formatRatio(locale, report.summary.profitX)}
        />
      </div>
      <SectionCard title={t('profitTracker.charts.roas')}>
        <ChartContainer config={roasConfig} className="h-[360px]">
          <LineChart data={days}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={(value) => formatBucket(locale, String(value))}
              minTickGap={28}
            />
            <YAxis tickFormatter={(value) => `${value}×`} width={48} />
            <ChartTooltip
              content={
                <ChartTooltipContent formatter={(value) => formatRatio(locale, Number(value))} />
              }
            />
            <Line
              dataKey="profitX"
              stroke="var(--color-profitX)"
              dot={false}
              strokeWidth={3}
              connectNulls={false}
            />
            <Line
              dataKey="profitXBeforeReturns"
              stroke="var(--color-profitXBeforeReturns)"
              strokeDasharray="6 5"
              dot={false}
              strokeWidth={2}
              connectNulls={false}
            />
            <Line
              dataKey="breakEven"
              stroke="var(--color-breakEven)"
              strokeDasharray="3 4"
              dot={false}
              strokeWidth={1.5}
            />
          </LineChart>
        </ChartContainer>
      </SectionCard>
      <div className="grid gap-5 xl:grid-cols-2">
        <SectionCard title={t('profitTracker.charts.creative')}>
          <ChartContainer config={creativeConfig} className="h-[330px]">
            <LineChart data={days}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={(value) => formatBucket(locale, String(value))}
                minTickGap={28}
              />
              <YAxis yAxisId="left" width={58} />
              <YAxis yAxisId="right" orientation="right" width={48} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Line
                yAxisId="left"
                dataKey="cpm"
                stroke="var(--color-cpm)"
                dot={false}
                strokeWidth={2}
              />
              <Line
                yAxisId="right"
                dataKey="ctr"
                stroke="var(--color-ctr)"
                dot={false}
                strokeWidth={2}
              />
            </LineChart>
          </ChartContainer>
        </SectionCard>
        <SectionCard title={t('profitTracker.charts.funnel')}>
          <ChartContainer config={funnelConfig} className="h-[330px]">
            <ComposedChart data={days}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={(value) => formatBucket(locale, String(value))}
                minTickGap={28}
              />
              <YAxis yAxisId="cost" width={64} />
              <YAxis yAxisId="percent" orientation="right" domain={[0, 100]} width={48} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar
                yAxisId="cost"
                dataKey="costPerConfirmedDzd"
                fill="var(--color-costPerConfirmedDzd)"
                radius={[4, 4, 0, 0]}
              />
              <Line
                yAxisId="percent"
                dataKey="confirmationRatePct"
                stroke="var(--color-confirmationRatePct)"
                dot={false}
                strokeWidth={2}
              />
              <Line
                yAxisId="percent"
                dataKey="clickToPageRatePct"
                stroke="var(--color-clickToPageRatePct)"
                dot={false}
                strokeWidth={2}
              />
            </ComposedChart>
          </ChartContainer>
        </SectionCard>
      </div>
      <SectionCard title={t('metaAds.performance.adsetSpend')}>
        <ChartContainer config={adsetConfig} className="h-[380px]">
          <BarChart data={stackedSpend}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={(value) => formatBucket(locale, String(value))}
              minTickGap={24}
            />
            <YAxis hide />
            <ChartTooltip
              content={
                <ChartTooltipContent formatter={(value) => formatEur(locale, Number(value))} />
              }
            />
            {adsetNames.map((key) => (
              <Bar key={key} dataKey={key} stackId="spend" fill={`var(--color-${key})`} />
            ))}
            <ChartLegend content={<ChartLegendContent />} />
          </BarChart>
        </ChartContainer>
      </SectionCard>
      <SectionCard title={t('profitTracker.adsets.title')}>
        <div className="max-w-full overflow-x-auto rounded-[1.25rem] border border-border/70">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('profitTracker.adsets.name')}</TableHead>
                <TableHead>{t('profitTracker.cards.spend')}</TableHead>
                <TableHead>{t('profitTracker.adsets.purchases')}</TableHead>
                <TableHead>{t('metaAds.integrated.cards.orders')}</TableHead>
                <TableHead>{t('metaAds.integrated.cards.confirmed')}</TableHead>
                <TableHead>{t('metaAds.integrated.cards.paid')}</TableHead>
                <TableHead>{t('profitTracker.adsets.costPerPurchase')}</TableHead>
                <TableHead>{t('profitTracker.adsets.value')}</TableHead>
                <TableHead>{t('profitTracker.adsets.estimatedNet')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.adsets.map((row) => {
                const outcomes = commerceByAdset.get(row.adsetId);
                return (
                  <TableRow key={row.adsetId}>
                    <TableCell className="font-medium">{row.adsetName}</TableCell>
                    <TableCell>{formatEur(locale, row.spendEur)}</TableCell>
                    <TableCell>{formatNumber(locale, row.purchases)}</TableCell>
                    <TableCell>{formatNumber(locale, outcomes?.orders ?? 0)}</TableCell>
                    <TableCell>{formatNumber(locale, outcomes?.confirmed ?? 0)}</TableCell>
                    <TableCell>{formatNumber(locale, outcomes?.paid ?? 0)}</TableCell>
                    <TableCell>
                      {row.costPerPurchaseDzd == null
                        ? '—'
                        : formatCurrency(locale, row.costPerPurchaseDzd)}
                    </TableCell>
                    <TableCell>{formatEur(locale, row.purchaseValue)}</TableCell>
                    <TableCell>
                      {row.hasEstimate ? formatCurrency(locale, row.estimatedNetProfitDzd) : '—'}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </SectionCard>
    </div>
  );
}
