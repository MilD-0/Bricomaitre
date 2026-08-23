'use client';

import {
  AlertCircle,
  Bot,
  CheckCircle2,
  CircleDollarSign,
  FileCheck2,
  MousePointerClick,
  PackageCheck,
  Sparkles,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';

import type { StatsDashboardData } from '../../lib/stats';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '../ui/chart';
import {
  formatBucket,
  formatCurrency,
  formatMilliseconds,
  formatNumber,
  formatPercent,
  formatUsd,
  MetricCard,
  SectionCard,
  StatBlock,
} from './stats-dashboard-primitives';

const assistantIntentKeys = new Set([
  'product_search',
  'product_comparison',
  'compatibility',
  'price',
  'availability',
  'how_to',
  'recommendation',
  'other',
]);

function percentageOf(value: number, total: number) {
  return total > 0 ? (value / total) * 100 : 0;
}

export function StatsAiSection({ stats }: { stats: StatsDashboardData }) {
  const locale = useLocale();
  const t = useTranslations('statsDashboard');
  const storefront = stats.aiAssistants.storefront;
  const admin = stats.aiAssistants.admin;
  const storefrontTrendConfig = {
    runs: { label: t('aiAssistants.cards.runs'), color: 'hsl(var(--chart-1))' },
    completed: { label: t('aiAssistants.completed'), color: 'hsl(var(--chart-2))' },
    failed: { label: t('aiAssistants.failed'), color: 'hsl(var(--chart-5))' },
  };
  const shopperSteps = [
    {
      label: t('aiAssistants.cards.opens'),
      value: storefront.opens,
      detail: t('aiAssistants.storefront.opensDetail'),
    },
    {
      label: t('aiAssistants.cards.messages'),
      value: storefront.messages,
      detail: t('aiAssistants.storefront.messagesDetail', {
        rate: formatPercent(locale, percentageOf(storefront.messages, storefront.opens)),
      }),
    },
    {
      label: t('aiAssistants.cards.resultClicks'),
      value: storefront.resultClicks,
      detail: t('aiAssistants.storefront.clicksDetail', {
        rate: formatPercent(locale, storefront.clickThroughRate),
      }),
    },
    {
      label: t('aiAssistants.cards.influencedOrders'),
      value: storefront.influencedOrders,
      detail: t('aiAssistants.storefront.ordersDetail', {
        rate: formatPercent(locale, percentageOf(storefront.influencedOrders, storefront.opens)),
      }),
    },
  ];
  const maxShopperStep = Math.max(...shopperSteps.map((step) => step.value), 1);

  return (
    <div className="flex min-w-0 flex-col gap-5 sm:gap-6">
      <SectionCard title={t('aiAssistants.storefront.impactTitle')}>
        {!storefront.enabled ? (
          <Alert>
            <AlertCircle />
            <AlertTitle>{t('aiAssistants.storefront.disabledTitle')}</AlertTitle>
            <AlertDescription>{t('aiAssistants.storefront.disabledDescription')}</AlertDescription>
          </Alert>
        ) : null}
        <div className="mt-5 grid min-w-0 grid-cols-2 gap-3 xl:grid-cols-4">
          <MetricCard
            accent="bg-primary"
            icon={Sparkles}
            title={t('aiAssistants.cards.influencedOrders')}
            value={formatNumber(locale, storefront.influencedOrders)}
          />
          <MetricCard
            accent="bg-blue-500"
            icon={CheckCircle2}
            title={t('aiAssistants.cards.confirmedOrders')}
            value={formatNumber(locale, storefront.confirmedOrders)}
          />
          <MetricCard
            accent="bg-emerald-500"
            icon={PackageCheck}
            title={t('aiAssistants.cards.paidOrders')}
            value={formatNumber(locale, storefront.paidOrders)}
          />
          <MetricCard
            accent="bg-violet-500"
            icon={CircleDollarSign}
            title={t('aiAssistants.cards.submittedValue')}
            value={formatCurrency(locale, storefront.submittedValueDzd)}
          />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
          <StatBlock
            label={t('aiAssistants.cards.confirmationRate')}
            value={formatPercent(locale, storefront.confirmationRate)}
          />
          <StatBlock
            label={t('aiAssistants.cards.paidRate')}
            value={formatPercent(
              locale,
              percentageOf(storefront.paidOrders, storefront.influencedOrders),
            )}
          />
          <StatBlock
            label={t('aiAssistants.cards.recommendedProductOrders')}
            value={formatNumber(locale, storefront.recommendedProductOrders)}
          />
          <StatBlock
            label={t('aiAssistants.cards.completedOrders')}
            value={formatNumber(locale, storefront.completedOrders)}
          />
        </div>
      </SectionCard>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <SectionCard title={t('aiAssistants.storefront.journeyTitle')}>
          <div className="space-y-4">
            {shopperSteps.map((step) => (
              <div key={step.label} className="min-w-0">
                <div className="flex min-w-0 items-baseline justify-between gap-3">
                  <p className="break-words text-sm font-medium text-foreground">{step.label}</p>
                  <p className="shrink-0 text-lg font-semibold tabular-nums text-foreground">
                    {formatNumber(locale, step.value)}
                  </p>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-[hsl(var(--chart-1))]"
                    style={{
                      width: `${Math.max(step.value > 0 ? 2 : 0, (step.value / maxShopperStep) * 100)}%`,
                    }}
                  />
                </div>
                <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{step.detail}</p>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title={t('aiAssistants.storefront.operationsTitle')}>
          <p className="text-sm leading-6 text-muted-foreground">
            {t('aiAssistants.storefront.operationsDescription')}
          </p>
          <div className="mt-5 grid grid-cols-2 gap-2">
            <StatBlock
              label={t('aiAssistants.cards.runs')}
              value={formatNumber(locale, storefront.runs)}
            />
            <StatBlock
              label={t('aiAssistants.cards.successRate')}
              value={formatPercent(locale, storefront.successRate)}
            />
            <StatBlock
              label={t('aiAssistants.cards.latency')}
              value={formatMilliseconds(locale, storefront.averageDurationMs)}
            />
            <StatBlock
              label={t('aiAssistants.cards.errors')}
              value={formatNumber(locale, storefront.errors)}
            />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <StatBlock
              label={t('aiAssistants.cards.helpfulRate')}
              value={formatPercent(locale, storefront.helpfulRate)}
            />
            <StatBlock
              label={t('aiAssistants.cards.helpfulAnswers')}
              value={formatNumber(locale, storefront.helpful)}
            />
            <StatBlock
              label={t('aiAssistants.cards.notHelpfulAnswers')}
              value={formatNumber(locale, storefront.notHelpful)}
            />
            <StatBlock
              label={t('aiAssistants.cards.cancelled')}
              value={formatNumber(locale, storefront.cancelled)}
            />
            <StatBlock
              label={t('aiAssistants.cards.tokens')}
              value={formatNumber(locale, storefront.totalTokens)}
            />
            <StatBlock
              label={t('aiAssistants.cards.estimatedCost')}
              value={formatUsd(locale, storefront.estimatedCostUsd)}
            />
          </div>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            {t('aiAssistants.costHint')}
          </p>
        </SectionCard>
      </div>

      <SectionCard title={t('aiAssistants.storefront.intentsTitle')}>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {storefront.topIntents.map((item) => (
            <StatBlock
              key={item.name}
              label={
                assistantIntentKeys.has(item.name)
                  ? t(`aiAssistants.intents.${item.name}`)
                  : item.name
              }
              value={formatNumber(locale, item.messages)}
            />
          ))}
          {storefront.topIntents.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('aiAssistants.empty')}</p>
          ) : null}
        </div>
      </SectionCard>

      <SectionCard title={t('aiAssistants.admin.title')}>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <MetricCard
            accent="bg-primary"
            icon={Bot}
            title={t('aiAssistants.cards.runs')}
            value={formatNumber(locale, admin.runs)}
          />
          <MetricCard
            accent="bg-emerald-500"
            icon={CheckCircle2}
            title={t('aiAssistants.cards.successRate')}
            value={formatPercent(locale, admin.successRate)}
          />
          <MetricCard
            accent="bg-violet-500"
            icon={FileCheck2}
            title={t('aiAssistants.cards.proposals')}
            value={formatNumber(locale, admin.proposals)}
          />
          <MetricCard
            accent="bg-blue-500"
            icon={MousePointerClick}
            title={t('aiAssistants.cards.applied')}
            value={formatNumber(locale, admin.appliedProposals)}
          />
        </div>
        <div className="mt-5 grid min-w-0 gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          {admin.trend.length > 0 ? (
            <ChartContainer config={storefrontTrendConfig} className="h-[260px] sm:h-[300px]">
              <LineChart data={admin.trend} margin={{ left: 0, right: 8, top: 8 }}>
                <CartesianGrid vertical={false} strokeDasharray="4 6" />
                <XAxis
                  dataKey="bucket"
                  tickFormatter={(value) => formatBucket(locale, String(value))}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={24}
                />
                <YAxis hide />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value) => formatNumber(locale, Number(value))}
                    />
                  }
                />
                <Line dataKey="runs" stroke="var(--color-runs)" strokeWidth={3} dot={false} />
                <Line
                  dataKey="completed"
                  stroke="var(--color-completed)"
                  strokeWidth={2}
                  dot={false}
                />
                <Line dataKey="failed" stroke="var(--color-failed)" strokeWidth={2} dot={false} />
              </LineChart>
            </ChartContainer>
          ) : (
            <p className="text-sm text-muted-foreground">{t('aiAssistants.empty')}</p>
          )}
          <div className="min-w-0 space-y-5">
            <div className="grid grid-cols-2 gap-2">
              <StatBlock
                label={t('aiAssistants.cards.helpfulRate')}
                value={formatPercent(locale, admin.helpfulRate)}
              />
              <StatBlock
                label={t('aiAssistants.cards.helpfulAnswers')}
                value={formatNumber(locale, admin.helpful)}
              />
              <StatBlock
                label={t('aiAssistants.cards.notHelpfulAnswers')}
                value={formatNumber(locale, admin.notHelpful)}
              />
              <StatBlock
                label={t('aiAssistants.cards.cancelled')}
                value={formatNumber(locale, admin.cancelled)}
              />
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold text-foreground">
                {t('aiAssistants.admin.modelsTitle')}
              </h3>
              <div className="space-y-2">
                {admin.models.map((item) => (
                  <StatBlock
                    key={item.name}
                    label={`${item.name} · ${formatNumber(locale, item.tokens)} ${t('aiAssistants.tokensShort')}`}
                    value={formatNumber(locale, item.runs)}
                  />
                ))}
                {admin.models.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t('aiAssistants.empty')}</p>
                ) : null}
              </div>
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold text-foreground">
                {t('aiAssistants.admin.tasksTitle')}
              </h3>
              <div className="space-y-2">
                {admin.topTasks.map((item) => (
                  <StatBlock
                    key={item.name}
                    label={`${item.name} · ${formatPercent(locale, item.successRate)}`}
                    value={formatNumber(locale, item.runs)}
                  />
                ))}
                {admin.topTasks.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t('aiAssistants.empty')}</p>
                ) : null}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <StatBlock
                label={t('aiAssistants.cards.latency')}
                value={formatMilliseconds(locale, admin.averageDurationMs)}
              />
              <StatBlock
                label={t('aiAssistants.cards.estimatedCost')}
                value={formatUsd(locale, admin.estimatedCostUsd)}
              />
            </div>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
