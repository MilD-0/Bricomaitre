'use client';

import {
  CalendarRange,
  CircleDollarSign,
  DollarSign,
  Package,
  Percent,
  Target,
  TrendingUp,
  Truck,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { CartesianGrid, Cell, Line, LineChart, Pie, PieChart, XAxis, YAxis } from 'recharts';

import type { AnalyticsSectionPayload, EconomicsReport } from '../../lib/stats-sections';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '../ui/chart';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '../ui/empty';
import {
  CostRow,
  feeBreakdownConfig,
  formatBucket,
  formatCurrency,
  formatDate,
  formatNumber,
  formatPercent,
  MetricCard,
  SectionCard,
} from './stats-dashboard-primitives';
import { WebsiteMetricCards } from './stats-website-metrics';

function formatRatio(locale: string, value: number | null) {
  return value == null
    ? '—'
    : `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value)}×`;
}

export function buildOverviewTrajectory(economics: EconomicsReport) {
  const adjustedByDate = new Map(economics.days.map((day) => [day.date, day]));
  const realizedByDate = new Map(economics.realized.days.map((day) => [day.date, day]));

  return [...new Set([...adjustedByDate.keys(), ...realizedByDate.keys()])].sort().map((date) => {
    const adjusted = adjustedByDate.get(date);
    const adjustedIsComplete =
      adjusted?.grossProfitSource === 'manual' ||
      (adjusted?.grossProfitSource !== 'missing' &&
        adjusted?.postedOrders === adjusted?.costCompleteOrders);

    return {
      date,
      realizedProfitDzd: realizedByDate.get(date)?.realizedProfitDzd ?? null,
      adjustedProfitDzd: adjustedIsComplete ? (adjusted?.metrics.adjustedProfitDzd ?? null) : null,
      trueProfitDzd: adjustedIsComplete ? (adjusted?.trueProfitDzd ?? null) : null,
    };
  });
}

export function StatsOverviewSection({ stats }: { stats: AnalyticsSectionPayload }) {
  const locale = useLocale();
  const t = useTranslations('statsDashboard');
  const economics = stats.economics;
  const realized = economics?.realized.summary;
  const projected = economics?.summary;
  const metaCost = projected?.rawAdCostDzd ?? 0;
  const totalCosts = stats.summary.totalProductCost + stats.summary.totalFees + metaCost;
  const feeData = useMemo(
    () =>
      [
        {
          name: t('overview.fees.delivery'),
          value: stats.feeBreakdown.livraison,
          fill: 'var(--color-livraison)',
        },
        {
          name: t('overview.fees.commission'),
          value: stats.feeBreakdown.commission,
          fill: 'var(--color-commission)',
        },
        {
          name: t('overview.fees.weight'),
          value: stats.feeBreakdown.poids,
          fill: 'var(--color-poids)',
        },
        {
          name: t('overview.fees.extra'),
          value: stats.feeBreakdown.extra,
          fill: 'var(--color-extra)',
        },
        { name: t('overview.fees.sms'), value: stats.feeBreakdown.sms, fill: 'var(--color-sms)' },
        {
          name: t('overview.fees.storage'),
          value: stats.feeBreakdown.stockage,
          fill: 'var(--color-stockage)',
        },
        { name: t('overview.fees.ads'), value: metaCost, fill: 'var(--color-publicite)' },
      ].filter((item) => item.value > 0),
    [metaCost, stats.feeBreakdown, t],
  );
  const trajectory = useMemo(() => {
    if (!economics) return [];
    return buildOverviewTrajectory(economics);
  }, [economics]);
  const trajectoryConfig = {
    realizedProfitDzd: {
      label: t('overview.analytics.settledProfit'),
      color: 'hsl(var(--chart-2))',
    },
    adjustedProfitDzd: { label: t('profitTracker.cards.adjusted'), color: 'hsl(var(--chart-3))' },
    trueProfitDzd: { label: t('profitTracker.cards.trueProfit'), color: 'hsl(var(--chart-5))' },
  } satisfies ChartConfig;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
        <MetricCard
          accent="bg-emerald-500"
          icon={TrendingUp}
          title={t('overview.analytics.settledProfit')}
          value={formatCurrency(locale, realized?.realizedProfitDzd ?? 0)}
        />
        <MetricCard
          accent="bg-blue-500"
          icon={CircleDollarSign}
          title={t('overview.analytics.settledAfterAds')}
          value={
            realized && realized.metaCoveredDays > 0
              ? formatCurrency(locale, realized.realizedProfitAfterAdsDzd)
              : '—'
          }
        />
        <MetricCard
          accent="bg-violet-500"
          icon={DollarSign}
          title={t('overview.cards.totalCollected')}
          value={formatCurrency(locale, realized?.amountCollectedDzd ?? 0)}
        />
        <MetricCard
          accent="bg-primary"
          icon={Package}
          title={t('overview.cards.totalOrders')}
          value={formatNumber(locale, stats.summary.totalOrders)}
        />
        <MetricCard
          accent="bg-cyan-500"
          icon={Truck}
          title={t('overview.analytics.postedOrders')}
          value={formatNumber(locale, projected?.postedOrders ?? 0)}
        />
        <MetricCard
          accent="bg-amber-500"
          icon={Percent}
          title={t('overview.analytics.fulfillment')}
          value={formatPercent(locale, stats.summary.fulfillmentRate)}
        />
        <MetricCard
          accent="bg-rose-500"
          icon={Target}
          title={t('overview.analytics.settlementCoverage')}
          value={
            realized?.settlementCoveragePct == null
              ? '—'
              : formatPercent(locale, realized.settlementCoveragePct)
          }
        />
        <MetricCard
          accent="bg-slate-500"
          icon={CalendarRange}
          title={t('overview.analytics.reportThrough')}
          value={formatDate(locale, economics?.realized.reportThroughDate ?? null)}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          accent="bg-[hsl(var(--chart-3))]"
          icon={TrendingUp}
          title={t('profitTracker.cards.adjusted')}
          value={formatCurrency(locale, projected?.adjustedProfitDzd ?? 0)}
        />
        <MetricCard
          accent="bg-[hsl(var(--chart-2))]"
          icon={Target}
          title={t('profitTracker.cards.profitX')}
          value={formatRatio(locale, projected?.profitX ?? null)}
        />
        <MetricCard
          accent="bg-[hsl(var(--chart-5))]"
          icon={CircleDollarSign}
          title={t('profitTracker.cards.trueProfit')}
          value={formatCurrency(locale, projected?.trueProfitDzd ?? 0)}
        />
        <MetricCard
          accent="bg-[hsl(var(--chart-4))]"
          icon={Percent}
          title={t('overview.analytics.projectedCoverage')}
          value={
            projected?.projectedCoveragePct == null
              ? '—'
              : formatPercent(locale, projected.projectedCoveragePct)
          }
        />
      </div>

      <SectionCard title={t('overview.analytics.trajectory')}>
        <ChartContainer config={trajectoryConfig} className="h-[320px]">
          <LineChart data={trajectory}>
            <CartesianGrid vertical={false} strokeDasharray="4 6" />
            <XAxis
              dataKey="date"
              tickFormatter={(value) => formatBucket(locale, String(value))}
              minTickGap={24}
              tickLine={false}
              axisLine={false}
            />
            <YAxis hide />
            <ChartTooltip
              content={
                <ChartTooltipContent formatter={(value) => formatCurrency(locale, Number(value))} />
              }
            />
            <Line
              type="monotone"
              dataKey="realizedProfitDzd"
              stroke="var(--color-realizedProfitDzd)"
              strokeWidth={3}
              dot={false}
              connectNulls={false}
            />
            <Line
              type="monotone"
              dataKey="adjustedProfitDzd"
              stroke="var(--color-adjustedProfitDzd)"
              strokeWidth={2}
              dot={false}
              connectNulls={false}
            />
            <Line
              type="monotone"
              dataKey="trueProfitDzd"
              stroke="var(--color-trueProfitDzd)"
              strokeWidth={2}
              dot={false}
              connectNulls={false}
            />
            <ChartLegend content={<ChartLegendContent />} />
          </LineChart>
        </ChartContainer>
      </SectionCard>

      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard title={t('overview.costs.title')}>
          <div className="space-y-1">
            <CostRow
              label={t('overview.costs.productCost')}
              value={stats.summary.totalProductCost}
              total={totalCosts}
            />
            <CostRow
              label={t('overview.costs.deliveryFees')}
              value={stats.feeBreakdown.livraison}
              total={totalCosts}
            />
            <CostRow
              label={t('overview.costs.otherFees')}
              value={stats.feeBreakdown.total - stats.feeBreakdown.livraison}
              total={totalCosts}
            />
            <CostRow
              label={t('overview.costs.adSpend')}
              value={metaCost}
              total={totalCosts}
              highlight
            />
            <div className="border-t border-border/70 pt-2">
              <CostRow
                label={t('overview.costs.total')}
                value={totalCosts}
                total={totalCosts}
                bold
              />
            </div>
          </div>
        </SectionCard>
        <SectionCard title={t('overview.fees.title')}>
          {feeData.length > 0 ? (
            <ChartContainer config={feeBreakdownConfig} className="h-[320px]">
              <PieChart>
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value) => formatCurrency(locale, Number(value))}
                    />
                  }
                />
                <Pie
                  data={feeData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={70}
                  outerRadius={112}
                  paddingAngle={3}
                >
                  {feeData.map((item) => (
                    <Cell key={item.name} fill={item.fill} />
                  ))}
                </Pie>
                <ChartLegend content={<ChartLegendContent />} />
              </PieChart>
            </ChartContainer>
          ) : (
            <Empty className="border-none">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Truck />
                </EmptyMedia>
                <EmptyTitle>{t('overview.emptyFeesTitle')}</EmptyTitle>
                <EmptyDescription>{t('overview.emptyFeesDescription')}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </SectionCard>
      </div>
      <SectionCard title={t('website.title')}>
        <WebsiteMetricCards stats={stats} className="xl:grid-cols-4" />
      </SectionCard>
    </div>
  );
}
