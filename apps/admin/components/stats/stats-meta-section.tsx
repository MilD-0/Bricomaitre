'use client';

import {
  Activity,
  AlertCircle,
  CheckCircle2,
  CircleDollarSign,
  MousePointerClick,
  Route,
  Send,
  Target,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import type { StatsDashboardData } from '../../lib/stats';
import { cn } from '../../lib/utils';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { Card } from '../ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '../ui/empty';
import {
  formatDate,
  formatDateTime,
  formatNumber,
  formatPercent,
  MetricCard,
  MobileBreakdownMetric,
  SectionCard,
  StatBlock,
} from './stats-dashboard-primitives';

const metaChannelKeys = new Set(['meta_paid', 'meta_organic', 'meta_unclassified']);

function formatAccountCurrency(locale: string, value: number, currency: string | null) {
  if (!currency) return formatNumber(locale, value);
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${formatNumber(locale, value)} ${currency}`;
  }
}

function percentageOf(value: number, total: number) {
  return total > 0 ? (value / total) * 100 : 0;
}

export function StatsMetaSection({ stats }: { stats: StatsDashboardData }) {
  const locale = useLocale();
  const t = useTranslations('statsDashboard');
  const commerce = stats.metaAds.commerce;
  const paid = stats.metaAds.paidAttribution;
  const health = stats.metaAds.health ?? {
    pending: 0,
    retryable: 0,
    delivered: 0,
    failed: 0,
    skipped: 0,
    oldestPendingAt: null,
    eligibleOrders: 0,
    confirmedOrders: 0,
    orderConfirmedOrders: 0,
    purchaseOrders: 0,
    negativeOutcomePurchases: 0,
    workerLastHeartbeatAt: null,
  };
  const metaSources = stats.website.acquisitionSources.filter((source) =>
    metaChannelKeys.has(source.name),
  );
  const canonical = metaSources.reduce(
    (total, source) => ({
      sessions: total.sessions + source.sessions,
      orders: total.orders + source.orders,
      successfulOrders: total.successfulOrders + source.successfulOrders,
    }),
    { sessions: 0, orders: 0, successfulOrders: 0 },
  );
  const purchaseCoverage = percentageOf(health.purchaseOrders, health.eligibleOrders);
  const confirmedCoverage = percentageOf(health.orderConfirmedOrders, health.confirmedOrders);
  const hasDirectInsights = commerce.rows.length > 0;
  const hasCompleteAcquisitionSessionCoverage =
    !stats.website.acquisitionCoverageStartsAt ||
    stats.website.acquisitionCoverageStartsAt.slice(0, 10) <= stats.filters.startDate;

  return (
    <div className="flex min-w-0 flex-col gap-5 sm:gap-6">
      <SectionCard title={t('metaAds.attribution.title')}>
        <p className="text-sm leading-6 text-muted-foreground">
          {t('metaAds.attribution.description')}
        </p>
        <div className="mt-5 grid min-w-0 grid-cols-2 gap-3 xl:grid-cols-4">
          <MetricCard
            accent="bg-blue-500"
            icon={MousePointerClick}
            title={t('metaAds.attribution.sessions')}
            value={formatNumber(locale, canonical.sessions)}
          />
          <MetricCard
            accent="bg-violet-500"
            icon={Route}
            title={t('metaAds.attribution.orders')}
            value={formatNumber(locale, canonical.orders)}
          />
          <MetricCard
            accent="bg-emerald-500"
            icon={CheckCircle2}
            title={t('metaAds.attribution.successful')}
            value={formatNumber(locale, canonical.successfulOrders)}
          />
          <MetricCard
            accent="bg-primary"
            icon={Target}
            title={t('metaAds.attribution.successRate')}
            value={formatPercent(
              locale,
              percentageOf(canonical.successfulOrders, canonical.orders),
            )}
          />
        </div>
        {metaSources.length > 0 ? (
          <div className="mt-5 grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {metaSources.map((source) => (
              <article
                key={source.name}
                className="min-w-0 rounded-[1.15rem] border border-border/70 bg-muted/20 p-3.5"
              >
                <h3 className="break-words text-sm font-semibold text-foreground">
                  {t(`website.channels.${source.name}`)}
                </h3>
                <dl className="mt-3 grid grid-cols-2 gap-3">
                  <MobileBreakdownMetric
                    label={t('website.metrics.sessions')}
                    value={formatNumber(locale, source.sessions)}
                  />
                  <MobileBreakdownMetric
                    label={t('website.metrics.orders')}
                    value={formatNumber(locale, source.orders)}
                  />
                  <MobileBreakdownMetric
                    label={t('website.metrics.successful')}
                    value={formatNumber(locale, source.successfulOrders)}
                  />
                  <MobileBreakdownMetric
                    label={t('website.metrics.orderRate')}
                    value={
                      hasCompleteAcquisitionSessionCoverage
                        ? formatPercent(locale, source.conversionRate)
                        : '—'
                    }
                  />
                </dl>
              </article>
            ))}
          </div>
        ) : (
          <p className="mt-5 text-sm text-muted-foreground">{t('metaAds.attribution.empty')}</p>
        )}
        {stats.website.acquisitionCoverageStartsAt ? (
          <p className="mt-4 text-xs leading-5 text-muted-foreground">
            {t('website.acquisitionCoverage', {
              date: formatDate(locale, stats.website.acquisitionCoverageStartsAt),
            })}
          </p>
        ) : null}
        {!hasCompleteAcquisitionSessionCoverage ? (
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {t('website.acquisitionRateUnavailable')}
          </p>
        ) : null}
      </SectionCard>

      <SectionCard title={t('metaAds.paidAttribution.title')}>
        <p className="text-sm leading-6 text-muted-foreground">
          {t('metaAds.paidAttribution.description')}
        </p>
        <div className="mt-5 grid grid-cols-2 gap-2 lg:grid-cols-5">
          <StatBlock
            label={t('metaAds.paidAttribution.visits')}
            value={formatNumber(locale, paid.visits)}
          />
          <StatBlock
            label={t('metaAds.paidAttribution.orders')}
            value={formatNumber(locale, paid.createdOrders)}
          />
          <StatBlock
            label={t('metaAds.paidAttribution.purchases')}
            value={formatNumber(locale, paid.purchases)}
          />
          <StatBlock
            label={t('metaAds.paidAttribution.landedOnly')}
            value={formatNumber(locale, paid.landedOnly)}
          />
          <StatBlock
            label={t('metaAds.paidAttribution.conversion')}
            value={formatPercent(locale, paid.conversionRate)}
          />
        </div>
        {paid.topCampaigns.length > 0 ? (
          <div className="mt-5 grid min-w-0 gap-3 md:grid-cols-2">
            {paid.topCampaigns.map((campaign) => (
              <article
                key={campaign.name}
                className="min-w-0 rounded-[1.15rem] border border-border/70 bg-muted/20 p-3.5"
              >
                <h3 className="break-words text-sm font-semibold text-foreground">
                  {campaign.name}
                </h3>
                <dl className="mt-3 grid grid-cols-3 gap-2">
                  <MobileBreakdownMetric
                    label={t('metaAds.paidAttribution.visits')}
                    value={formatNumber(locale, campaign.visits)}
                  />
                  <MobileBreakdownMetric
                    label={t('metaAds.paidAttribution.orders')}
                    value={formatNumber(locale, campaign.orders)}
                  />
                  <MobileBreakdownMetric
                    label={t('metaAds.paidAttribution.purchases')}
                    value={formatNumber(locale, campaign.purchases)}
                  />
                </dl>
              </article>
            ))}
          </div>
        ) : null}
      </SectionCard>

      <SectionCard title={t('metaAds.integrated.title')}>
        <p className="text-sm leading-6 text-muted-foreground">
          {t('metaAds.integrated.description')}
        </p>
        {hasDirectInsights ? (
          <>
            <div className="mt-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
              <MetricCard
                accent="bg-primary"
                icon={CircleDollarSign}
                title={t('metaAds.integrated.cards.spend')}
                value={formatAccountCurrency(
                  locale,
                  commerce.summary.spend,
                  commerce.summary.accountCurrency,
                )}
              />
              <MetricCard
                accent="bg-blue-500"
                icon={MousePointerClick}
                title={t('metaAds.integrated.cards.metaClicks')}
                value={formatNumber(locale, commerce.summary.metaClicks)}
              />
              <MetricCard
                accent="bg-violet-500"
                icon={Target}
                title={t('metaAds.integrated.cards.orders')}
                value={formatNumber(locale, commerce.summary.bricOrders)}
              />
              <MetricCard
                accent="bg-emerald-500"
                icon={CheckCircle2}
                title={t('metaAds.integrated.cards.paid')}
                value={formatNumber(locale, commerce.summary.paidOrders)}
              />
            </div>
            <div className="mt-5 grid min-w-0 gap-3 md:grid-cols-2">
              {commerce.rows.map((item, index) => (
                <article
                  key={`${item.day}:${item.adId ?? item.campaignId ?? index}`}
                  className="min-w-0 rounded-[1.15rem] border border-border/70 bg-muted/20 p-3.5"
                >
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="break-words text-sm font-semibold text-foreground">
                        {item.adName ?? item.adId ?? t('metaAds.unknownCampaign')}
                      </h3>
                      <p className="mt-0.5 break-words text-xs text-muted-foreground">
                        {item.campaignName ?? item.campaignId ?? '—'} ·{' '}
                        {formatDate(locale, item.day)}
                      </p>
                    </div>
                    <p className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                      {formatAccountCurrency(locale, item.spend, item.accountCurrency)}
                    </p>
                  </div>
                  <dl className="mt-3 grid grid-cols-3 gap-2">
                    <MobileBreakdownMetric
                      label={t('metaAds.integrated.columns.orders')}
                      value={formatNumber(locale, item.bricOrders)}
                    />
                    <MobileBreakdownMetric
                      label={t('metaAds.integrated.columns.confirmed')}
                      value={formatNumber(locale, item.confirmedOrders)}
                    />
                    <MobileBreakdownMetric
                      label={t('metaAds.integrated.columns.paid')}
                      value={formatNumber(locale, item.paidOrders)}
                    />
                  </dl>
                </article>
              ))}
            </div>
          </>
        ) : (
          <Alert className="mt-4">
            <AlertCircle />
            <AlertTitle>{t('metaAds.integrated.emptyTitle')}</AlertTitle>
            <AlertDescription>{t('metaAds.integrated.empty')}</AlertDescription>
          </Alert>
        )}
        {commerce.sync ? (
          <p className="mt-4 text-xs leading-5 text-muted-foreground">
            {t('metaAds.integrated.sync', {
              date: formatDateTime(locale, commerce.sync.completedAt ?? commerce.sync.startedAt),
              status: commerce.sync.status,
              rows: formatNumber(locale, commerce.sync.rowsUpserted),
            })}
          </p>
        ) : null}
      </SectionCard>

      <SectionCard title={t('metaAds.health.title')}>
        <p className="text-sm leading-6 text-muted-foreground">{t('metaAds.health.description')}</p>
        <div className="mt-5 grid grid-cols-2 gap-2 lg:grid-cols-4">
          <StatBlock
            label={t('metaAds.health.pending')}
            value={formatNumber(locale, health.pending + health.retryable)}
          />
          <StatBlock
            label={t('metaAds.health.failed')}
            value={formatNumber(locale, health.failed + health.skipped)}
          />
          <StatBlock
            label={t('metaAds.health.purchaseCoverage')}
            value={formatPercent(locale, purchaseCoverage)}
          />
          <StatBlock
            label={t('metaAds.health.orderConfirmedCoverage')}
            value={formatPercent(locale, confirmedCoverage)}
          />
        </div>
        <div className="mt-4 flex min-w-0 flex-wrap gap-x-6 gap-y-2 text-xs leading-5 text-muted-foreground">
          <span>
            {t('metaAds.health.workerHeartbeat', {
              heartbeat: formatDateTime(locale, health.workerLastHeartbeatAt),
            })}
          </span>
          <span>
            {t('metaAds.health.oldestPending', {
              oldest: formatDateTime(locale, health.oldestPendingAt),
            })}
          </span>
          <span>
            {t('metaAds.health.deliveredCount', {
              count: formatNumber(locale, health.delivered),
            })}
          </span>
        </div>
      </SectionCard>

      <SectionCard title={t('metaAds.diagnosticsTitle')}>
        <p className="text-sm leading-6 text-muted-foreground">
          {t('metaAds.diagnosticsDescription')}
        </p>
        <div className="mt-5 grid min-w-0 gap-3 md:grid-cols-2">
          {stats.metaAds.events.map((event) => (
            <article
              key={event.name}
              className="min-w-0 rounded-[1.15rem] border border-border/70 bg-muted/20 p-3.5"
            >
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="break-words text-sm font-semibold text-foreground">
                    {event.name}
                  </h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {t('metaAds.events.lastSeenValue', {
                      date: formatDateTime(locale, event.lastOccurredAt),
                    })}
                  </p>
                </div>
                <Activity className="size-4 shrink-0 text-muted-foreground" />
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <MobileBreakdownMetric
                  label={t('metaAds.events.columns.total')}
                  value={formatNumber(locale, event.total)}
                />
                <MobileBreakdownMetric
                  label={t('metaAds.events.columns.pixel')}
                  value={formatNumber(locale, event.pixelFired)}
                />
                <MobileBreakdownMetric
                  label={t('metaAds.events.columns.capiDelivered')}
                  value={formatNumber(locale, event.capiDelivered)}
                />
                <MobileBreakdownMetric
                  label={t('metaAds.events.columns.capiFailed')}
                  value={formatNumber(locale, event.capiFailed)}
                />
              </dl>
            </article>
          ))}
          {stats.metaAds.events.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('metaAds.events.empty')}</p>
          ) : null}
        </div>

        <details className="mt-5 min-w-0 rounded-[1.15rem] border border-border/70 bg-muted/20">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-foreground marker:hidden">
            <span className="inline-flex items-center gap-2">
              <Send className="size-4 text-muted-foreground" />
              {t('metaAds.payloadsTitle')}
            </span>
          </summary>
          <div className="min-w-0 border-t border-border/70 p-3 sm:p-4">
            {stats.metaAds.recentPayloads.length > 0 ? (
              <div className="grid min-w-0 gap-3">
                {stats.metaAds.recentPayloads.map((event) => (
                  <Card
                    key={`${event.metaEventName}-${event.eventId}`}
                    className="min-w-0 overflow-hidden rounded-xl p-3 sm:p-4"
                  >
                    <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="break-words font-semibold">{event.metaEventName}</div>
                        <div className="break-all text-xs text-muted-foreground">
                          {t('metaAds.payloads.meta', {
                            analyticsEvent: event.analyticsEventName,
                            eventId: event.eventId,
                            occurredAt: formatDateTime(locale, event.occurredAt),
                          })}
                        </div>
                      </div>
                      <div
                        className={cn(
                          'shrink-0 rounded-full px-2 py-1 text-xs font-medium',
                          event.capiOk
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-800',
                        )}
                      >
                        {event.capiOk
                          ? t('metaAds.payloads.delivered')
                          : t('metaAds.payloads.failed')}
                      </div>
                    </div>
                    <pre className="mt-3 max-h-56 max-w-full overflow-auto whitespace-pre-wrap break-all rounded-lg bg-muted p-3 text-xs">
                      {JSON.stringify(event.capiPayload, null, 2)}
                    </pre>
                  </Card>
                ))}
              </div>
            ) : (
              <Empty className="border-none">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Target />
                  </EmptyMedia>
                  <EmptyTitle>{t('metaAds.payloads.emptyTitle')}</EmptyTitle>
                  <EmptyDescription>{t('metaAds.payloads.emptyDescription')}</EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </div>
        </details>
      </SectionCard>
    </div>
  );
}
