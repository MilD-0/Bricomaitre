'use client';

import { CalendarRange, DollarSign, Package, TrendingDown, TrendingUp, Truck } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from 'recharts';

import type { StatsDashboardData } from '../../lib/stats';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '../ui/chart';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '../ui/empty';
import {
  CostRow,
  feeBreakdownConfig,
  formatCurrency,
  formatNumber,
  formatPercent,
  MetricCard,
  revenueBreakdownConfig,
  SectionCard,
} from './stats-dashboard-primitives';
import { WebsiteMetricCards } from './stats-website-metrics';

export function StatsOverviewSection({ stats }: { stats: StatsDashboardData }) {
  const locale = useLocale();
  const t = useTranslations('statsDashboard');
  const totalCosts =
    stats.summary.totalProductCost + stats.summary.totalFees + stats.adCosts.totalSpend;
  const revenueBreakdown = useMemo(
    () => [
      {
        name: t('overview.revenueBreakdown.collected'),
        value: stats.summary.totalAmountCollected,
      },
      {
        name: t('overview.revenueBreakdown.productCost'),
        value: stats.summary.totalProductCost,
      },
      { name: t('overview.revenueBreakdown.fees'), value: stats.summary.totalFees },
      {
        name: t('overview.revenueBreakdown.netRevenue'),
        value: stats.summary.totalNetRevenue,
      },
      {
        name: t('overview.revenueBreakdown.grossProfit'),
        value: stats.summary.totalGrossProfit,
      },
      { name: t('overview.revenueBreakdown.ads'), value: stats.adCosts.totalSpend },
      {
        name: t('overview.revenueBreakdown.netAfterAds'),
        value: stats.summary.netProfitAfterAds,
      },
    ],
    [stats, t],
  );
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
        {
          name: t('overview.fees.sms'),
          value: stats.feeBreakdown.sms,
          fill: 'var(--color-sms)',
        },
        {
          name: t('overview.fees.storage'),
          value: stats.feeBreakdown.stockage,
          fill: 'var(--color-stockage)',
        },
        {
          name: t('overview.fees.ads'),
          value: stats.adCosts.totalSpend,
          fill: 'var(--color-publicite)',
        },
      ].filter((item) => item.value > 0),
    [stats, t],
  );
  const overviewCards = useMemo(
    () => [
      {
        title: t('overview.cards.totalOrders'),
        value: formatNumber(locale, stats.summary.totalOrders),
        accent: 'bg-primary',
        icon: Package,
      },
      {
        title: t('overview.cards.totalCollected'),
        value: formatCurrency(locale, stats.summary.totalAmountCollected),
        accent: 'bg-[hsl(var(--chart-2))]',
        icon: DollarSign,
      },
      {
        title: t('overview.cards.netRevenue'),
        value: formatCurrency(locale, stats.summary.totalNetRevenue),
        accent: 'bg-[hsl(var(--chart-3))]',
        icon: TrendingUp,
      },
      {
        title: t('overview.cards.deliveryFees'),
        value: formatCurrency(locale, stats.feeBreakdown.livraison),
        accent: 'bg-[hsl(var(--chart-4))]',
        icon: Truck,
      },
      {
        title: t('overview.cards.productCost'),
        value: formatCurrency(locale, stats.summary.totalProductCost),
        accent: 'bg-[hsl(var(--chart-5))]',
        icon: Package,
      },
      {
        title: t('overview.cards.grossProfit'),
        value: formatCurrency(locale, stats.summary.totalGrossProfit),
        accent: 'bg-[hsl(var(--chart-2)/0.82)]',
        icon: stats.summary.totalGrossProfit >= 0 ? TrendingUp : TrendingDown,
      },
      {
        title: t('overview.cards.afterAds'),
        value: formatCurrency(locale, stats.summary.netProfitAfterAds),
        accent: 'bg-[hsl(var(--chart-5)/0.86)]',
        icon: stats.summary.netProfitAfterAds >= 0 ? TrendingUp : TrendingDown,
      },
      {
        title: t('overview.cards.averageOrder'),
        value: formatCurrency(locale, stats.summary.averageOrderValue),
        accent: 'bg-[hsl(var(--chart-3)/0.78)]',
        icon: CalendarRange,
      },
      {
        title: t('overview.cards.margin'),
        value: formatPercent(locale, stats.summary.profitMargin),
        accent: 'bg-[hsl(var(--chart-4)/0.78)]',
        icon: TrendingUp,
      },
    ],
    [locale, stats, t],
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {overviewCards.map((item) => (
          <MetricCard key={item.title} {...item} />
        ))}
      </div>

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
            {stats.adCosts.totalSpend > 0 ? (
              <CostRow
                label={t('overview.costs.adSpend')}
                value={stats.adCosts.totalSpend}
                total={totalCosts}
                highlight
              />
            ) : null}
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
            <ChartContainer config={feeBreakdownConfig} className="h-[320px] sm:h-[360px]">
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
                  animationDuration={900}
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

      <SectionCard title={t('overview.revenueChart.title')}>
        <ChartContainer config={revenueBreakdownConfig} className="h-[360px]">
          <BarChart data={revenueBreakdown}>
            <CartesianGrid vertical={false} strokeDasharray="4 6" />
            <XAxis
              dataKey="name"
              tickLine={false}
              axisLine={false}
              minTickGap={12}
              interval={0}
              angle={-18}
              textAnchor="end"
              height={64}
            />
            <YAxis hide />
            <ChartTooltip
              content={
                <ChartTooltipContent formatter={(value) => formatCurrency(locale, Number(value))} />
              }
            />
            <Bar dataKey="value" radius={14} animationDuration={900}>
              {revenueBreakdown.map((item, index) => (
                <Cell key={item.name} fill={`hsl(var(--chart-${(index % 5) + 1}))`} />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      </SectionCard>

      <SectionCard title={t('website.title')}>
        <WebsiteMetricCards stats={stats} className="xl:grid-cols-4" />
      </SectionCard>
    </div>
  );
}
