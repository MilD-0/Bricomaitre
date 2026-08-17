'use client';

import { Activity, MousePointerClick, PackageCheck, Smartphone, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';

import type { StatsDashboardData } from '../../lib/stats';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '../ui/chart';
import {
  formatDate,
  formatNumber,
  formatPercent,
  MobileBreakdownMetric,
  SectionCard,
} from './stats-dashboard-primitives';

type WebsiteTrendMetric = 'sessions' | 'pageViews' | 'orders' | 'errors';

const trendMetrics = ['sessions', 'pageViews', 'orders', 'errors'] as const;
const trendColors: Record<WebsiteTrendMetric, string> = {
  sessions: 'hsl(var(--chart-1))',
  pageViews: 'hsl(var(--chart-2))',
  orders: 'hsl(var(--chart-3))',
  errors: 'hsl(var(--chart-5))',
};
const acquisitionChannelKeys = new Set([
  'meta_paid',
  'meta_organic',
  'meta_unclassified',
  'google_paid',
  'google_organic',
  'direct_dark_social',
  'shared_link',
  'external_ai',
  'other_referral',
  'other_campaign',
  'unknown',
]);
const deviceKeys = new Set(['small_phone', 'mobile', 'tablet', 'desktop', 'unknown']);
const pageTypeKeys = new Set([
  'product_detail',
  'catalog',
  'global_navigation',
  'checkout',
  'homepage',
  'thank_you',
  'landing',
  'unknown',
]);

function humanizeDimension(value: string) {
  const normalized = value.trim().replace(/[_-]+/g, ' ');
  return normalized ? normalized.replace(/^\p{L}/u, (letter) => letter.toLocaleUpperCase()) : '—';
}

function percentageOf(value: number, total: number) {
  return total > 0 ? (value / total) * 100 : 0;
}

function WebsiteKpi({
  accent,
  detail,
  icon: Icon,
  title,
  value,
}: {
  accent: string;
  detail: string;
  icon: LucideIcon;
  title: string;
  value: string;
}) {
  return (
    <Card className="relative min-w-0 overflow-hidden rounded-[1.35rem] border-border/60 p-4 sm:rounded-[1.6rem] sm:p-5">
      <div className={cn('absolute inset-y-0 start-0 w-1', accent)} />
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words text-xs font-semibold uppercase tracking-[0.13em] text-muted-foreground">
            {title}
          </p>
          <p className="mt-2 break-words text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            {value}
          </p>
        </div>
        <div className="shrink-0 rounded-xl bg-muted/60 p-2.5">
          <Icon className="size-4 text-foreground" />
        </div>
      </div>
      <p className="mt-2 break-words text-xs leading-5 text-muted-foreground">{detail}</p>
    </Card>
  );
}

function CompactMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-muted/35 px-3 py-2.5">
      <p className="break-words text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 break-words font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

function DistributionList({
  empty,
  items,
  locale,
  total,
}: {
  empty: string;
  items: Array<{ label: string; value: number; secondary?: number }>;
  locale: string;
  total: number;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{empty}</p>;
  }

  return (
    <div className="space-y-3">
      {items.map((item) => {
        const share = percentageOf(item.value, total);
        return (
          <div key={item.label} className="min-w-0">
            <div className="flex min-w-0 items-baseline justify-between gap-3">
              <p className="min-w-0 break-words text-sm font-medium text-foreground">
                {item.label}
              </p>
              <p className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                {formatNumber(locale, item.value)}
              </p>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-[hsl(var(--chart-1))]"
                style={{ width: `${Math.max(share > 0 ? 2 : 0, Math.min(share, 100))}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {share.toFixed(1)}%{item.secondary === undefined ? '' : ` · ${item.secondary}`}
            </p>
          </div>
        );
      })}
    </div>
  );
}

export function StatsWebsiteSection({ stats }: { stats: StatsDashboardData }) {
  const locale = useLocale();
  const t = useTranslations('statsDashboard');
  const [activeTrendMetric, setActiveTrendMetric] = useState<WebsiteTrendMetric>('sessions');
  const website = stats.website;
  const averagePages = website.sessions > 0 ? website.pageViews / website.sessions : 0;
  const addToCheckoutRate = percentageOf(website.checkoutStarts, website.addToCarts);
  const maxCommerceAction = Math.max(
    website.productViews,
    website.addToCarts,
    website.checkoutStarts,
    website.purchases,
    1,
  );
  const trendData = useMemo(
    () =>
      website.trend.map((item) => ({
        bucket: item.bucket,
        value:
          activeTrendMetric === 'orders'
            ? item.purchases
            : activeTrendMetric === 'pageViews'
              ? item.pageViews
              : item[activeTrendMetric],
      })),
    [activeTrendMetric, website.trend],
  );
  const trendConfig = useMemo(
    () => ({
      value: {
        label: t(`website.trendMetrics.${activeTrendMetric}`),
        color: trendColors[activeTrendMetric],
      },
    }),
    [activeTrendMetric, t],
  );
  const sortedAcquisition = useMemo(
    () => [...website.acquisitionSources].sort((a, b) => b.sessions - a.sessions),
    [website.acquisitionSources],
  );
  const deviceTotal = website.devices.reduce((sum, item) => sum + item.sessions, 0);
  const localeTotal = website.locales.reduce((sum, item) => sum + item.sessions, 0);
  const pageTypeTotal = website.pageTypes.reduce((sum, item) => sum + item.sessions, 0);
  const displayLanguage = (code: string) => {
    try {
      return (
        new Intl.DisplayNames([locale], { type: 'language' }).of(code.toLowerCase()) ??
        code.toUpperCase()
      );
    } catch {
      return code.toUpperCase();
    }
  };
  const displayDevice = (name: string) =>
    deviceKeys.has(name) ? t(`website.devicesMap.${name}`) : humanizeDimension(name);
  const displayPageType = (name: string) =>
    pageTypeKeys.has(name) ? t(`website.pageTypes.${name}`) : humanizeDimension(name);

  const commerceSteps = [
    {
      label: t('website.commerce.productViews'),
      value: website.productViews,
      detail: t('website.commerce.sessionContext', {
        sessions: formatNumber(locale, website.sessions),
      }),
    },
    {
      label: t('website.commerce.adds'),
      value: website.addToCarts,
      detail: t('website.commerce.viewToCart', {
        rate: formatPercent(locale, website.viewToCartRate),
      }),
    },
    {
      label: t('website.commerce.checkouts'),
      value: website.checkoutStarts,
      detail: t('website.commerce.cartToCheckout', {
        rate: formatPercent(locale, addToCheckoutRate),
      }),
    },
    {
      label: t('website.commerce.orders'),
      value: website.purchases,
      detail: t('website.commerce.checkoutToOrder', {
        rate: formatPercent(locale, website.checkoutToPurchaseRate),
      }),
    },
  ];

  return (
    <div className="flex min-w-0 flex-col gap-5 sm:gap-6">
      <div className="grid min-w-0 grid-cols-2 gap-3 xl:grid-cols-4">
        <WebsiteKpi
          accent="bg-[hsl(var(--chart-1))]"
          icon={Users}
          title={t('website.cards.sessions')}
          value={formatNumber(locale, website.sessions)}
          detail={t('website.kpiDetails.pageViews', {
            views: formatNumber(locale, website.pageViews),
          })}
        />
        <WebsiteKpi
          accent="bg-[hsl(var(--chart-3))]"
          icon={PackageCheck}
          title={t('website.cards.orders')}
          value={formatNumber(locale, website.purchases)}
          detail={t('website.kpiDetails.checkouts', {
            checkouts: formatNumber(locale, website.checkoutStarts),
          })}
        />
        <WebsiteKpi
          accent="bg-[hsl(var(--chart-2))]"
          icon={MousePointerClick}
          title={t('website.cards.orderRate')}
          value={formatPercent(locale, website.sessionConversionRate)}
          detail={t('website.kpiDetails.sessionOrderRate')}
        />
        <WebsiteKpi
          accent="bg-[hsl(var(--chart-4))]"
          icon={Activity}
          title={t('website.cards.engagementRate')}
          value={formatPercent(locale, website.engagementRate)}
          detail={t('website.kpiDetails.returning', {
            journeys: formatNumber(locale, website.returningJourneys),
          })}
        />
      </div>

      <SectionCard title={t('website.trendTitle')}>
        <div className="flex max-w-full gap-2 overflow-x-auto pb-1">
          {trendMetrics.map((metric) => (
            <Button
              key={metric}
              type="button"
              size="sm"
              variant={activeTrendMetric === metric ? 'default' : 'outline'}
              aria-pressed={activeTrendMetric === metric}
              className="shrink-0"
              onClick={() => setActiveTrendMetric(metric)}
            >
              {t(`website.trendMetrics.${metric}`)}
            </Button>
          ))}
        </div>
        {trendData.length > 0 ? (
          <ChartContainer config={trendConfig} className="mt-4 h-[260px] sm:h-[320px]">
            <LineChart data={trendData} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
              <CartesianGrid vertical={false} strokeDasharray="4 6" />
              <XAxis
                dataKey="bucket"
                tickFormatter={(value) => formatDate(locale, String(value))}
                tickLine={false}
                axisLine={false}
                minTickGap={28}
              />
              <YAxis hide domain={[0, 'auto']} />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value) => formatNumber(locale, Number(value))}
                    labelFormatter={(value) => formatDate(locale, String(value))}
                  />
                }
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke="var(--color-value)"
                strokeWidth={3}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ChartContainer>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">{t('website.empty')}</p>
        )}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <CompactMetric
            label={t('website.secondary.averagePages')}
            value={new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(averagePages)}
          />
          <CompactMetric
            label={t('website.secondary.returningJourneys')}
            value={formatNumber(locale, website.returningJourneys)}
          />
          <CompactMetric
            label={t('website.secondary.errorRate')}
            value={formatPercent(locale, website.errorRate)}
          />
        </div>
      </SectionCard>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[0.85fr_1.15fr]">
        <SectionCard title={t('website.conversion.title')}>
          <div className="space-y-4">
            {commerceSteps.map((step) => {
              const width = percentageOf(step.value, maxCommerceAction);
              return (
                <div key={step.label} className="min-w-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="break-words text-sm font-medium text-foreground">{step.label}</p>
                    <p className="shrink-0 text-lg font-semibold tabular-nums text-foreground">
                      {formatNumber(locale, step.value)}
                    </p>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-[hsl(var(--chart-2))]"
                      style={{ width: `${Math.max(width > 0 ? 2 : 0, Math.min(width, 100))}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{step.detail}</p>
                </div>
              );
            })}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <CompactMetric
              label={t('website.commerce.cartToOrderLabel')}
              value={formatPercent(locale, website.cartToPurchaseRate)}
            />
            <CompactMetric
              label={t('website.commerce.sessionToOrderLabel')}
              value={formatPercent(locale, website.sessionConversionRate)}
            />
          </div>
        </SectionCard>

        <SectionCard title={t('website.acquisitionTitle')}>
          {sortedAcquisition.length > 0 ? (
            <div className="grid min-w-0 gap-3 md:grid-cols-2">
              {sortedAcquisition.map((item) => (
                <article
                  key={item.name}
                  className="min-w-0 rounded-[1.15rem] border border-border/70 bg-muted/20 p-3.5"
                >
                  <h3 className="break-words text-sm font-semibold text-foreground">
                    {acquisitionChannelKeys.has(item.name)
                      ? t(`website.channels.${item.name}`)
                      : humanizeDimension(item.name)}
                  </h3>
                  <dl className="mt-3 grid grid-cols-2 gap-3">
                    <MobileBreakdownMetric
                      label={t('website.metrics.sessions')}
                      value={formatNumber(locale, item.sessions)}
                    />
                    <MobileBreakdownMetric
                      label={t('website.metrics.orders')}
                      value={formatNumber(locale, item.orders)}
                    />
                    <MobileBreakdownMetric
                      label={t('website.metrics.successful')}
                      value={formatNumber(locale, item.successfulOrders)}
                    />
                    <MobileBreakdownMetric
                      label={t('website.metrics.orderRate')}
                      value={formatPercent(locale, item.conversionRate)}
                    />
                  </dl>
                </article>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t('website.acquisitionEmpty')}</p>
          )}
          {website.acquisitionCoverageStartsAt ? (
            <p className="mt-4 text-xs leading-5 text-muted-foreground">
              {t('website.acquisitionCoverage', {
                date: formatDate(locale, website.acquisitionCoverageStartsAt),
              })}
            </p>
          ) : null}
        </SectionCard>
      </div>

      <div className="grid min-w-0 gap-4 xl:grid-cols-2">
        <SectionCard title={t('website.searchInsightsTitle')}>
          <div className="grid grid-cols-2 gap-2">
            <CompactMetric
              label={t('website.stats.searches')}
              value={formatNumber(locale, website.searches)}
            />
            <CompactMetric
              label={t('website.stats.zeroResults')}
              value={formatNumber(locale, website.zeroResultSearches)}
            />
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            {t('website.searchZeroRate', {
              rate: formatPercent(
                locale,
                percentageOf(website.zeroResultSearches, website.searches),
              ),
            })}
          </p>
          <div className="mt-5 space-y-2">
            {website.topSearches.length > 0 ? (
              website.topSearches.map((item) => (
                <div
                  key={item.term}
                  className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-border/60 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="break-words text-sm font-medium text-foreground">{item.term}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {t('website.search.zeroCount', {
                        count: formatNumber(locale, item.zeroResults),
                      })}
                    </p>
                  </div>
                  <p className="shrink-0 font-semibold tabular-nums text-foreground">
                    {formatNumber(locale, item.searches)}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">{t('website.empty')}</p>
            )}
          </div>
        </SectionCard>

        <SectionCard title={t('website.topProductsTitle')}>
          <div className="space-y-2">
            {website.topProducts.length > 0 ? (
              website.topProducts.map((product) => (
                <article
                  key={product.id}
                  className="min-w-0 rounded-xl border border-border/60 px-3 py-3"
                >
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="break-words text-sm font-semibold text-foreground">
                        {product.title}
                      </h3>
                      <p className="mt-0.5 break-words text-xs text-muted-foreground">
                        {product.sku || product.categoryName || '—'}
                      </p>
                    </div>
                    <p className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                      {formatPercent(locale, product.websiteConversionRate ?? 0)}
                    </p>
                  </div>
                  <dl className="mt-3 grid grid-cols-3 gap-2">
                    <MobileBreakdownMetric
                      label={t('website.products.columns.views')}
                      value={formatNumber(locale, product.viewCount ?? 0)}
                    />
                    <MobileBreakdownMetric
                      label={t('website.products.columns.adds')}
                      value={formatNumber(locale, product.addToCartCount ?? 0)}
                    />
                    <MobileBreakdownMetric
                      label={t('website.products.columns.orders')}
                      value={formatNumber(locale, product.websitePurchaseCount ?? 0)}
                    />
                  </dl>
                </article>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">{t('website.empty')}</p>
            )}
          </div>
        </SectionCard>
      </div>

      <div className="grid min-w-0 gap-4 xl:grid-cols-2">
        <SectionCard title={t('website.pageTypesTitle')}>
          <DistributionList
            empty={t('website.empty')}
            locale={locale}
            total={pageTypeTotal}
            items={website.pageTypes.map((item) => ({
              label: displayPageType(item.name),
              value: item.sessions,
              secondary: item.interactions,
            }))}
          />
          {website.pageTypes.length > 0 ? (
            <p className="mt-4 text-xs text-muted-foreground">{t('website.pageTypeContext')}</p>
          ) : null}
        </SectionCard>

        <SectionCard title={t('website.audienceTitle')}>
          <div className="grid min-w-0 gap-6 sm:grid-cols-2 sm:gap-5">
            <div className="min-w-0">
              <div className="mb-3 flex items-center gap-2">
                <Smartphone className="size-4 text-muted-foreground" />
                <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {t('website.devices')}
                </h3>
              </div>
              <DistributionList
                empty={t('website.empty')}
                locale={locale}
                total={deviceTotal}
                items={website.devices.map((item) => ({
                  label: displayDevice(item.name),
                  value: item.sessions,
                }))}
              />
            </div>
            <div className="min-w-0">
              <div className="mb-3 flex items-center gap-2">
                <Users className="size-4 text-muted-foreground" />
                <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {t('website.locales')}
                </h3>
              </div>
              <DistributionList
                empty={t('website.empty')}
                locale={locale}
                total={localeTotal}
                items={website.locales.map((item) => ({
                  label: displayLanguage(item.name),
                  value: item.sessions,
                }))}
              />
            </div>
          </div>
        </SectionCard>
      </div>

      <SectionCard title={t('website.vitalsTitle')}>
        <div className="grid gap-3 sm:grid-cols-3">
          {website.vitals.map((item) => {
            const goodRate = percentageOf(item.good, item.samples);
            return (
              <div
                key={item.name}
                className="min-w-0 rounded-[1.15rem] border border-border/70 bg-muted/20 p-3.5"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-semibold text-foreground">{item.name}</span>
                  <span
                    className={cn(
                      'text-xs font-semibold tabular-nums',
                      goodRate >= 75
                        ? 'text-emerald-600'
                        : goodRate >= 50
                          ? 'text-amber-600'
                          : 'text-red-600',
                    )}
                  >
                    {formatPercent(locale, goodRate)}
                  </span>
                </div>
                <p className="mt-2 text-xl font-semibold tabular-nums text-foreground">
                  {item.name === 'CLS'
                    ? item.average.toFixed(3)
                    : `${formatNumber(locale, item.average)} ms`}
                </p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {t('website.vitalMeta', {
                    good: formatNumber(locale, item.good),
                    poor: formatNumber(locale, item.poor),
                    samples: formatNumber(locale, item.samples),
                  })}
                </p>
              </div>
            );
          })}
          {website.vitals.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('website.empty')}</p>
          ) : null}
        </div>
      </SectionCard>
    </div>
  );
}
