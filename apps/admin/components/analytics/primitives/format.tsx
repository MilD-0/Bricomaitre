'use client';
import type { AnalyticsMetric } from '../../../lib/analytics';
import { type AnalyticsCopy } from '../analytics-copy';
import {
  formatEur,
  formatDzd as formatMoney,
  formatNumber,
  formatPercent,
  formatRatio,
} from '../analytics-format';

export function formatHours(locale: string, value: number | null | undefined) {
  if (value == null) return '—';
  return `${formatNumber(locale, value)} h`;
}

export function funnelLabel(copy: AnalyticsCopy, key: string) {
  const labels: Record<string, string> = {
    Sessions: copy.labels.sessions,
    'Product-view sessions': copy.labels.productViewSessions,
    'Cart sessions': copy.labels.cartSessions,
    'Checkout sessions': copy.labels.checkoutSessions,
    'Submitted-order sessions': copy.labels.submittedOrderSessions,
    submitted: copy.labels.submitted,
    confirmed: copy.labels.confirmed,
    posted: copy.labels.posted,
    delivered: copy.labels.delivered,
    paid: copy.labels.paid,
    impressions: copy.labels.impressions,
    outboundClicks: copy.labels.outboundClicks,
    landingViews: copy.labels.landingViews,
    bricOrders: copy.labels.bricOrders,
  };
  return labels[key] ?? fulfillmentPhaseLabel(copy, key);
}

export function fulfillmentPhaseLabel(copy: AnalyticsCopy, phase: string) {
  const labels = copy.fulfillmentPhases as Record<string, string>;
  return labels[phase] ?? phase.replaceAll('_', ' ');
}

export function formatMetric(locale: string, metric: Pick<AnalyticsMetric, 'value' | 'unit'>) {
  switch (metric.unit) {
    case 'dzd':
      return formatMoney(locale, metric.value, true);
    case 'eur':
      return formatEur(locale, metric.value);
    case 'percent':
      return formatPercent(locale, metric.value);
    case 'ratio':
      return formatRatio(locale, metric.value);
    case 'hours':
      return formatHours(locale, metric.value);
    case 'number':
      return formatNumber(locale, metric.value, true);
  }
}
