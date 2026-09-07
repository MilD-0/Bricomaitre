'use client';
export {
  type DataOf,
  chartColors,
  AnalyticsAssistantFocusContext,
  AnalyticsAssistantFocusProvider,
} from './primitives/focus';
export { formatHours, fulfillmentPhaseLabel, formatMetric } from './primitives/format';
export { MetricStrip, Section, DenseTable } from './primitives/sections';
export {
  splitPartialSeries,
  completedTrendBuckets,
  ActualOpenLine,
  chartTooltip,
} from './primitives/charts';
export { SourceRail, WarningRail } from './primitives/sources';
export { Funnel, CashPipeline } from './primitives/funnel';
