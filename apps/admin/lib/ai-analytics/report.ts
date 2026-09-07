import type {
  AnalyticsEffectiveRange,
  AnalyticsMetric,
  AnalyticsPayload,
  AnalyticsSource,
  AnalyticsView,
} from '../analytics';
import { type AdminAiAnalyticsMetric, definitionFor, type MetricDefinition } from './metrics';

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function numberAt(value: unknown, path: string[]): number | null {
  let current = value;
  for (const key of path) current = record(current)?.[key];
  return typeof current === 'number' && Number.isFinite(current) ? current : null;
}

function relevantRange(view: AnalyticsView, key: string) {
  if (view === 'command') {
    if (key === 'storefrontConversion') return 'storefront';
    if (key === 'automaticPaidProfit' || key === 'postedOrders' || key === 'paidOrders') {
      return 'fulfillment';
    }
    return 'economics';
  }
  if (view === 'money')
    return key.startsWith('automaticPaid') || key === 'paidProfitCoverage' ? 'paid' : 'economics';
  if (view === 'acquisition') return 'acquisition';
  if (view === 'fulfillment') return 'fulfillment';
  if (view === 'storefront') return 'storefront';
  if (view === 'search') return 'search';
  if (view === 'catalog') return 'catalog';
  return 'assumptions';
}

function sourceAsOf(payload: AnalyticsPayload, keys: AnalyticsSource['key'][]) {
  const dates = payload.sources
    .filter((source) => keys.includes(source.key) && source.throughDate)
    .map((source) => source.throughDate as string)
    .sort();
  return dates.at(0) ?? null;
}

function sourceWarning(payload: AnalyticsPayload, keys: AnalyticsSource['key'][]) {
  const source = payload.sources.find(
    (item) =>
      keys.includes(item.key) &&
      (item.state === 'missing' || item.state === 'partial' || item.state === 'lagged'),
  );
  return source
    ? `${source.key} is ${source.state}; values beyond its covered period are unavailable, not zero.`
    : null;
}

function exactCostCoverage(payload: AnalyticsPayload, key: string) {
  if (key === 'projectedCoverage') {
    const metric = record(payload.data)?.metrics;
    const rows = Array.isArray(metric) ? metric : [];
    const row = rows.find((item) => record(item)?.key === key);
    const value = record(row)?.value;
    return typeof value === 'number' ? value : null;
  }
  if (key === 'automaticPaidProfit' || key === 'paidProfitCoverage') {
    return (
      numberAt(payload.data, ['automaticPaid', 'summary', 'profitCoveragePct']) ??
      numberAt(payload.data, ['economics', 'automaticPaid', 'summary', 'profitCoveragePct'])
    );
  }
  if (['trueProfit', 'profitX', 'adjustedProfit', 'grossProfit'].includes(key)) {
    const paths: Partial<Record<AnalyticsView, string[]>> = {
      command: ['economics', 'coverage', 'projectedCoveragePct'],
      money: ['coverage', 'projectedCoveragePct'],
      acquisition: ['coverage', 'projectedCoveragePct'],
      catalog: ['coverage', 'projectedCoveragePct'],
    };
    const path = paths[payload.view];
    return path ? numberAt(payload.data, path) : null;
  }
  return null;
}

function attributionCoverage(payload: AnalyticsPayload, key: string) {
  if (
    payload.view !== 'acquisition' ||
    !['postedOrders', 'costPerPosted', 'costPerDelivered'].includes(key)
  ) {
    return null;
  }
  return numberAt(payload.data, ['efficiency', 'exactAdAttributionCoveragePct']);
}

function metricWarning(
  payload: AnalyticsPayload,
  metric: AnalyticsMetric,
  definition: MetricDefinition,
  coveragePct: number | null,
) {
  if (metric.key === 'profitX' && metric.value == null) {
    const metrics = record(payload.data)?.metrics;
    const adCost = Array.isArray(metrics)
      ? metrics.find((value) => record(value)?.key === 'adCost')
      : null;
    if (record(adCost)?.value === 0) {
      return 'Unavailable because comparable Meta ad cost is zero; Profit × is neither zero nor infinity.';
    }
  }
  if (metric.value == null)
    return 'Unavailable for this effective range; do not interpret it as zero.';
  if (coveragePct != null && coveragePct < 95) {
    return `Exact purchase-cost coverage is ${coveragePct.toFixed(1)}%; uncovered economics use the canonical 30% estimated margin.`;
  }
  return sourceWarning(payload, definition.sources);
}

function metricComparison(
  payload: AnalyticsPayload,
  metric: AnalyticsMetric,
  definition: MetricDefinition,
): Pick<AdminAiAnalyticsMetric, 'comparisonStatus' | 'comparisonReason'> {
  if (metric.previous != null) {
    return {
      comparisonStatus: 'comparable',
      comparisonReason: 'Matched prior-period value is available over canonical source coverage.',
    };
  }
  if (definition.comparison === 'not_applicable') {
    return {
      comparisonStatus: 'not_applicable',
      comparisonReason: 'This metric is presented as current configuration or coverage evidence.',
    };
  }
  if (!payload.filters.comparisonStartDate || !payload.filters.comparisonEndDate) {
    return {
      comparisonStatus: 'not_applicable',
      comparisonReason: 'The requested range has no matched prior-period window.',
    };
  }
  return {
    comparisonStatus: 'unavailable',
    comparisonReason:
      'No comparable prior value is available; this can reflect source coverage, an unavailable denominator, or no prior population and must not be read as zero.',
  };
}

function effectiveRangeFor(
  payload: AnalyticsPayload,
  metric: AnalyticsMetric,
): AnalyticsEffectiveRange {
  return (
    payload.effectiveRanges.find(
      (range) => range.key === relevantRange(payload.view, metric.key),
    ) ?? {
      key: 'requested',
      startDate: payload.filters.startDate,
      endDate: payload.filters.endDate,
      sources: [],
    }
  );
}

export function analyticsMetricsForAssistant(payload: AnalyticsPayload): AdminAiAnalyticsMetric[] {
  const metrics = record(payload.data)?.metrics;
  if (!Array.isArray(metrics)) return [];
  return metrics.flatMap((value) => {
    const metric = record(value) as AnalyticsMetric | null;
    if (!metric || typeof metric.key !== 'string') return [];
    const definition = definitionFor(payload.view, metric.key);
    const effectiveRange = effectiveRangeFor(payload, metric);
    const coveragePct = exactCostCoverage(payload, metric.key);
    const usesFallbackCost = coveragePct != null && coveragePct < 100;
    const attributionCoveragePct = attributionCoverage(payload, metric.key);
    const comparison = metricComparison(payload, metric, definition);
    return [
      {
        ...metric,
        name: metric.key,
        definition: definition.definition,
        sources: definition.sources,
        requestedRange: {
          startDate: payload.filters.startDate,
          endDate: payload.filters.endDate,
        },
        effectiveRange: {
          startDate: effectiveRange.startDate,
          endDate: effectiveRange.endDate,
        },
        dateBasis: definition.dateBasis,
        asOf: sourceAsOf(payload, definition.sources),
        coveragePct,
        maturity: definition.maturity ?? 'Observed over the declared effective range.',
        assumptions: [
          ...(definition.assumptions ?? []),
          ...(usesFallbackCost ? ['30% fallback margin for missing immutable purchase costs'] : []),
        ],
        attributionCoveragePct,
        ...comparison,
        warning: metricWarning(payload, metric, definition, coveragePct),
      },
    ];
  });
}
