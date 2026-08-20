'use client';

import { Activity, Send, Target } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import type { AnalyticsSectionPayload } from '../../lib/stats-sections';
import { cn } from '../../lib/utils';
import { Card } from '../ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '../ui/empty';
import {
  formatDateTime,
  formatNumber,
  formatPercent,
  MobileBreakdownMetric,
  SectionCard,
  StatBlock,
} from './stats-dashboard-primitives';
import { StatsMetaEconomics } from './stats-meta-economics';

function percentageOf(value: number, total: number) {
  return total > 0 ? (value / total) * 100 : 0;
}

export function StatsMetaSection({ stats }: { stats: AnalyticsSectionPayload }) {
  const locale = useLocale();
  const t = useTranslations('statsDashboard');
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

  return (
    <div className="flex min-w-0 flex-col gap-5 sm:gap-6">
      {stats.economics ? (
        <StatsMetaEconomics commerce={stats.metaAds.commerce} report={stats.economics} />
      ) : null}

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
          <div className="mt-5 max-w-full overflow-x-auto rounded-[1.15rem] border border-border/70">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-[0.14em] text-muted-foreground">
                <tr>
                  <th className="p-3">{t('metaAds.unknownCampaign')}</th>
                  <th className="p-3">{t('metaAds.paidAttribution.visits')}</th>
                  <th className="p-3">{t('metaAds.paidAttribution.orders')}</th>
                  <th className="p-3">{t('metaAds.paidAttribution.purchases')}</th>
                </tr>
              </thead>
              <tbody>
                {paid.topCampaigns.map((campaign) => (
                  <tr key={campaign.name} className="border-t border-border/70">
                    <td className="p-3 font-medium">{campaign.name}</td>
                    <td className="p-3">{formatNumber(locale, campaign.visits)}</td>
                    <td className="p-3">{formatNumber(locale, campaign.orders)}</td>
                    <td className="p-3">{formatNumber(locale, campaign.purchases)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </SectionCard>

      <details className="min-w-0 rounded-[1.5rem] border border-border/70 bg-card p-4 sm:p-5">
        <summary className="cursor-pointer list-none text-base font-semibold marker:hidden">
          {t('metaAds.performance.trackingHealth')}
        </summary>
        <div className="mt-5 flex min-w-0 flex-col gap-5 border-t border-border/70 pt-5">
          <SectionCard title={t('metaAds.health.title')}>
            <p className="text-sm leading-6 text-muted-foreground">
              {t('metaAds.health.description')}
            </p>
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
                value={formatPercent(
                  locale,
                  percentageOf(health.purchaseOrders, health.eligibleOrders),
                )}
              />
              <StatBlock
                label={t('metaAds.health.orderConfirmedCoverage')}
                value={formatPercent(
                  locale,
                  percentageOf(health.orderConfirmedOrders, health.confirmedOrders),
                )}
              />
            </div>
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground">
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
            <div className="grid min-w-0 gap-3 md:grid-cols-2">
              {stats.metaAds.events.map((event) => (
                <article
                  key={event.name}
                  className="min-w-0 rounded-[1.15rem] border border-border/70 bg-muted/20 p-3.5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold">{event.name}</h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t('metaAds.events.lastSeenValue', {
                          date: formatDateTime(locale, event.lastOccurredAt),
                        })}
                      </p>
                    </div>
                    <Activity className="size-4 text-muted-foreground" />
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
            </div>
            <details className="mt-5 rounded-[1.15rem] border border-border/70 bg-muted/20">
              <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold marker:hidden">
                <span className="inline-flex items-center gap-2">
                  <Send className="size-4" />
                  {t('metaAds.payloadsTitle')}
                </span>
              </summary>
              <div className="border-t border-border/70 p-3 sm:p-4">
                {stats.metaAds.recentPayloads.length > 0 ? (
                  <div className="grid gap-3">
                    {stats.metaAds.recentPayloads.map((event) => (
                      <Card key={event.eventId} className="min-w-0 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold">{event.metaEventName}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatDateTime(locale, event.occurredAt)}
                            </p>
                          </div>
                          <span
                            className={cn(
                              'rounded-full px-2 py-1 text-xs',
                              event.capiOk
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-amber-100 text-amber-800',
                            )}
                          >
                            {event.capiOk
                              ? t('metaAds.payloads.delivered')
                              : t('metaAds.payloads.failed')}
                          </span>
                        </div>
                        <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-muted p-3 text-xs">
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
      </details>
    </div>
  );
}
