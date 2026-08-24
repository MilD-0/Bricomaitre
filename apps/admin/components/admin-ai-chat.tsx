'use client';

import {
  ArrowUpRight,
  Bot,
  Check,
  Pencil,
  Send,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { consumeAdminAiChatResponse, type AdminAiChatStatus } from '../lib/admin-ai-chat-stream';
import { localizedStatsUrl } from '../lib/analytics2-routes';
import type { Analytics2View } from '../lib/analytics2';
import { suggestionKeysForAdminAi } from '../lib/admin-ai-capabilities';
import {
  adminAiToolActivityKey,
  adminAiToolMutatesApplication,
  adminAiToolPresentation,
} from '../lib/admin-ai-tool-presentation';
import {
  adminAiMetricsFromUnknown,
  adminAiResultTables,
  adminAiScalarEntries,
  adminAiToolResultsFromUnknown,
  isAdminAiScalar,
  type AdminAiToolResult,
} from '../lib/admin-ai-result-view';
import type { PermissionKey } from '../lib/permissions';
import {
  ADMIN_AI_DEFAULT_MODEL,
  ADMIN_AI_DEFAULT_REASONING_EFFORT,
  ADMIN_AI_MODEL_OPTIONS,
  adminAiModelIdSchema,
  adminAiReasoningEffortSchema,
  getAdminAiModelOption,
  getDefaultAdminAiReasoningEffort,
  supportsAdminAiReasoningEffort,
  type AdminAiModelId,
  type AdminAiReasoningEffort,
} from '../lib/admin-ai-models';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Markdown } from './ui/markdown';
import { Spinner } from './ui/spinner';
import { Switch } from './ui/switch';
import { Textarea } from './ui/textarea';
import { useAdminAiSurfaceContext } from './admin-ai-surface-context';
import { ADMIN_AI_OPEN_EVENT, notifyAdminAiMutation } from '../lib/admin-ai-events';
import { ChatSidebar } from './admin-ai-chat/chat-sidebar';
import { AdminAiResultTable } from './admin-ai-chat/result-table';
import type { AiJob, ConversationSummary } from './admin-ai-chat/types';

type AnalyticsMetricResult = {
  key: string;
  name?: string;
  value: unknown;
  previous?: unknown;
  changePct?: number | null;
  unit?: string;
  definition?: string;
  requestedRange?: { startDate?: string | null; endDate?: string | null };
  effectiveRange?: { startDate?: string | null; endDate?: string | null };
  dateBasis?: string;
  asOf?: string | null;
  coveragePct?: number | null;
  maturity?: string;
  estimated?: boolean;
  assumptions?: string[];
  attributionCoveragePct?: number | null;
  comparisonStatus?: string;
  comparisonReason?: string;
  warning?: string | null;
};
type AnalyticsFocusResult = {
  dimension?: string;
  definition?: string;
  dateBasis?: string;
  totalSemantics?: string;
  requestedRange?: { startDate?: string | null; endDate?: string | null };
  effectiveRange?: { startDate?: string | null; endDate?: string | null };
  available?: number;
  matched?: number;
  included?: number;
  truncated?: boolean;
  warning?: string | null;
  fieldContract?: Array<{
    field?: string;
    definition?: string;
    unit?: string;
    modeled?: boolean;
    estimation?: string | null;
    maturity?: string | null;
    attribution?: string | null;
  }>;
  rows?: unknown[];
};
type AnalyticsInvestigation = {
  comparisonStatus?: 'aligned' | 'unavailable';
  requestedRange?: { startDate?: string | null; endDate?: string | null };
  commonEffectiveRange?: { startDate?: string | null; endDate?: string | null } | null;
  warning?: string | null;
};
type AnalyticsResult = {
  query?: string;
  view?: string;
  source?: string;
  definition?: string;
  metrics?: AnalyticsMetricResult[];
  focus?: AnalyticsFocusResult | null;
  data?: unknown;
  caveats?: string[];
  filters?: {
    startDate?: string | null;
    endDate?: string | null;
    range?: string;
    grain?: string;
  };
  generatedAt?: string;
  sources?: Array<Record<string, unknown>>;
  warnings?: unknown[];
  truncations?: Array<{ path?: string; available?: number; included?: number }>;
  investigation?: AnalyticsInvestigation;
};
type Proposal = { id: number; status: 'proposed' | 'applied' | 'rejected' };
type ChatMessage = {
  id?: string;
  messageRecordId?: number;
  role: 'user' | 'assistant';
  content: string;
  feedback?: 'helpful' | 'not_helpful';
  analytics?: AnalyticsResult[];
  proposals?: Proposal[];
  results?: AdminAiToolResult[];
  terminal?: boolean;
  jobId?: string;
};
type LandingPageGenerationPresentation = {
  status: 'completed' | 'partial-fallback' | 'full-fallback';
  generatedSections: number;
  plannedSections: number;
  preservedSections: number;
  fallbackSections: number;
  skippedSections: number;
  deletedSections: number;
  retryCount: number;
  reasoning: string | null;
  failures: Array<{ type: string | null; reason: string }>;
};
type ProposalNextAction = 'refresh' | 'regenerate' | 'review' | 'retry';

export const ADMIN_AI_AUTO_ACCEPT_STORAGE_KEY = 'bricomaitre:admin-ai:auto-accept';
export const ADMIN_AI_MODEL_STORAGE_KEY = 'bricomaitre:admin-ai:model';
export const ADMIN_AI_REASONING_EFFORT_STORAGE_KEY = 'bricomaitre:admin-ai:reasoning-effort';

const analyticsChartMetricKeys = [
  'postedUnits',
  'paidUnits',
  'postedOrders',
  'paidOrders',
  'adCostDzd',
  'spendEur',
  'impressions',
  'outboundClicks',
  'clicks',
  'purchases',
  'unitsSold',
  'orders',
  'views',
  'inventoryQuantity',
  'discountAmount',
  'revenue',
  'profit',
  'sessions',
  'pageViews',
  'count',
  'totalValue',
  'contributionLtvDzd',
  'projectedContributionDzd',
] as const;
const analyticsChartPalette = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
] as const;

function finiteNumber(value: unknown) {
  const numeric =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim()
        ? Number(value)
        : Number.NaN;
  return Number.isFinite(numeric) ? numeric : null;
}

export function selectAnalyticsChartMetric(rows: Record<string, unknown>[], columns: string[]) {
  for (const key of analyticsChartMetricKeys) {
    if (columns.includes(key) && rows.some((row) => Math.abs(finiteNumber(row[key]) ?? 0) > 0)) {
      return key;
    }
  }
  return null;
}

export function analyticsChartRows(rows: Record<string, unknown>[], valueKey: string | null) {
  if (!valueKey) return [];
  return rows.flatMap((row) => {
    const value = finiteNumber(row[valueKey]);
    return value == null ? [] : [{ ...row, __chartValue: value }];
  });
}

const analyticsViews = new Set<Analytics2View>([
  'command',
  'money',
  'acquisition',
  'fulfillment',
  'storefront',
  'search',
  'catalog',
  'assumptions',
]);

function analyticsWorkspaceUrl(result: AnalyticsResult, locale: string) {
  const view = result.view;
  if (!view || !analyticsViews.has(view as Analytics2View)) return `/${locale}/stats`;
  const source = Object.fromEntries(
    Object.entries(result.filters ?? {}).flatMap(([key, value]) =>
      typeof value === 'string' ? [[key, value]] : [],
    ),
  );
  return localizedStatsUrl(locale, view as Analytics2View, source);
}

function analyticsFocusTable(focus: AnalyticsFocusResult | null | undefined) {
  const rows = (focus?.rows ?? []).filter(
    (row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object',
  );
  if (!rows.length) return null;
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))]
    .filter((column) => rows.some((row) => isAdminAiScalar(row[column])))
    .slice(0, 8);
  return columns.length
    ? {
        path: focus?.dimension ?? 'focus',
        rows: rows.slice(0, 20),
        columns,
        available: focus?.matched ?? rows.length,
      }
    : null;
}

function analyticsRangesDiffer(metric: AnalyticsMetricResult) {
  return Boolean(
    metric.requestedRange &&
    metric.effectiveRange &&
    (metric.requestedRange.startDate !== metric.effectiveRange.startDate ||
      metric.requestedRange.endDate !== metric.effectiveRange.endDate),
  );
}

function resultFromUnknown(
  value: unknown,
  depth = 0,
  investigation?: AnalyticsInvestigation,
): AnalyticsResult[] {
  if (depth > 5 || value == null) return [];
  if (Array.isArray(value))
    return value.flatMap((item) => resultFromUnknown(item, depth + 1, investigation));
  if (typeof value !== 'object') return [];
  const item = value as Record<string, unknown>;
  const nextInvestigation: AnalyticsInvestigation | undefined =
    item.kind === 'analytics_investigation'
      ? {
          comparisonStatus:
            item.comparisonStatus === 'aligned' || item.comparisonStatus === 'unavailable'
              ? (item.comparisonStatus as AnalyticsInvestigation['comparisonStatus'])
              : undefined,
          requestedRange:
            item.requestedRange && typeof item.requestedRange === 'object'
              ? (item.requestedRange as AnalyticsInvestigation['requestedRange'])
              : undefined,
          commonEffectiveRange:
            item.commonEffectiveRange && typeof item.commonEffectiveRange === 'object'
              ? (item.commonEffectiveRange as {
                  startDate?: string | null;
                  endDate?: string | null;
                })
              : null,
          warning: typeof item.warning === 'string' ? item.warning : null,
        }
      : investigation;
  return [
    ...(typeof item.query === 'string' && 'data' in item
      ? [{ ...(item as AnalyticsResult), investigation: nextInvestigation }]
      : []),
    ...Object.values(item).flatMap((child) =>
      resultFromUnknown(child, depth + 1, nextInvestigation),
    ),
  ];
}

function proposalsFromUnknown(value: unknown, depth = 0): Proposal[] {
  if (depth > 5 || value == null) return [];
  if (Array.isArray(value)) return value.flatMap((item) => proposalsFromUnknown(item, depth + 1));
  if (typeof value !== 'object') return [];
  const item = value as Record<string, unknown>;
  const proposal =
    typeof item.id === 'number' &&
    Number.isSafeInteger(item.id) &&
    item.id > 0 &&
    item.status === 'proposed'
      ? [{ id: item.id, status: 'proposed' as const }]
      : [];
  return [
    ...proposal,
    ...Object.values(item).flatMap((child) => proposalsFromUnknown(child, depth + 1)),
  ];
}

function queryLabel(value: string | undefined) {
  return (
    value
      ?.replaceAll('_', ' ')
      .replaceAll('.', ' · ')
      .replace(/([a-z\d])([A-Z])/g, '$1 $2')
      .toLowerCase() ?? ''
  );
}

function presentationFromUnknown(value: unknown) {
  return {
    analytics: resultFromUnknown(value),
    proposals: [
      ...new Map(proposalsFromUnknown(value).map((proposal) => [proposal.id, proposal])).values(),
    ],
    results: adminAiToolResultsFromUnknown(value).filter(
      (result) => result.toolName !== 'query_analytics',
    ),
  };
}

function notifyAdminAiToolMutations(results: readonly AdminAiToolResult[]) {
  notifyAdminAiMutation(
    results.map((result) => result.toolName).filter(adminAiToolMutatesApplication),
  );
}

function hydrateChatMessage(
  message: ChatMessage & { toolResults?: unknown },
  index: number,
): ChatMessage {
  if (message.role !== 'assistant' || !('toolResults' in message)) return message;
  return {
    id: message.id ?? `saved-assistant-${index}`,
    messageRecordId: message.messageRecordId,
    role: message.role,
    content: message.content,
    feedback: message.feedback,
    terminal: message.terminal,
    jobId: message.jobId,
    ...presentationFromUnknown(message.toolResults),
  };
}

function displayAdminAiValue(
  value: unknown,
  locale: string,
  yes: string,
  no: string,
  unit?: string,
): string {
  if (Array.isArray(value) && value.every(isAdminAiScalar)) {
    const text: string = value.map((item) => displayAdminAiValue(item, locale, yes, no)).join(', ');
    return text.length > 180 ? `${text.slice(0, 179)}…` : text;
  }
  if (typeof value === 'number') {
    if (unit === 'dzd' || unit === 'eur') {
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: unit.toUpperCase(),
        maximumFractionDigits: 2,
      }).format(value);
    }
    const formatted = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
    return unit === 'percent' ? `${formatted}%` : formatted;
  }
  if (value == null) return '—';
  if (typeof value === 'boolean') return value ? yes : no;
  const text = String(value);
  return text.length > 180 ? `${text.slice(0, 179)}…` : text;
}

function objectValue(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function landingPageGenerationPresentation(
  toolName: string,
  output: unknown,
): LandingPageGenerationPresentation | null {
  if (toolName !== 'create_landing_page' && toolName !== 'edit_landing_page') return null;
  const generation = objectValue(objectValue(output)?.generation);
  const stages = objectValue(generation?.stages);
  if (!stages) return null;
  const status = stages.status;
  if (status !== 'completed' && status !== 'partial-fallback' && status !== 'full-fallback')
    return null;
  const count = (value: unknown) =>
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
  const failures = Array.isArray(stages.failures)
    ? stages.failures.flatMap((value) => {
        const failure = objectValue(value);
        return failure && typeof failure.reason === 'string'
          ? [
              {
                type: typeof failure.type === 'string' ? failure.type : null,
                reason: failure.reason,
              },
            ]
          : [];
      })
    : [];
  return {
    status,
    generatedSections: count(stages.generatedSections),
    plannedSections: count(stages.plannedSections),
    preservedSections: count(stages.preservedSections),
    fallbackSections: count(stages.fallbackSections),
    skippedSections: count(stages.skippedSections),
    deletedSections: count(stages.deletedSections),
    retryCount: count(stages.retryCount),
    reasoning: typeof generation?.reasoning === 'string' ? generation.reasoning : null,
    failures,
  };
}

type EcotrackTerminalRow = {
  orderId: number | null;
  reference: string | null;
  tracking: string | null;
  message: string;
};

type EcotrackTerminalPresentation = {
  provider: string | null;
  attemptNumber: number;
  retryCount: number;
  successes: EcotrackTerminalRow[];
  validationFailures: EcotrackTerminalRow[];
  providerRejections: EcotrackTerminalRow[];
  alreadyPosted: EcotrackTerminalRow[];
  repairableOrderIds: number[];
  retryableOrderIds: number[];
};

function ecotrackTerminalPresentation(
  toolName: string,
  output: unknown,
): EcotrackTerminalPresentation | null {
  if (toolName !== 'ecotrack_posting_terminal') return null;
  const record = objectValue(output);
  if (record?.kind !== 'ecotrack_posting_terminal') return null;
  const rows = (value: unknown) =>
    Array.isArray(value)
      ? value.flatMap((item) => {
          const row = objectValue(item);
          if (!row || typeof row.message !== 'string') return [];
          return [
            {
              orderId: typeof row.orderId === 'number' ? row.orderId : null,
              reference: typeof row.reference === 'string' ? row.reference : null,
              tracking: typeof row.tracking === 'string' ? row.tracking : null,
              message: row.message,
            },
          ];
        })
      : [];
  const orderIds = (value: unknown) =>
    Array.isArray(value)
      ? value.filter((item): item is number => Number.isSafeInteger(item) && Number(item) > 0)
      : [];

  return {
    provider: typeof record.provider === 'string' ? record.provider : null,
    attemptNumber: typeof record.attemptNumber === 'number' ? record.attemptNumber : 1,
    retryCount: typeof record.retryCount === 'number' ? record.retryCount : 0,
    successes: rows(record.successes),
    validationFailures: rows(record.validationFailures),
    providerRejections: rows(record.providerRejections),
    alreadyPosted: rows(record.alreadyPosted),
    repairableOrderIds: orderIds(record.repairableOrderIds),
    retryableOrderIds: orderIds(record.retryableOrderIds),
  };
}

function adminAiNoticeText(value: unknown) {
  if (isAdminAiScalar(value)) return queryLabel(String(value ?? ''));
  const entries = adminAiScalarEntries(value, 5);
  return entries.map(([key, child]) => `${queryLabel(key)}: ${String(child ?? '—')}`).join(' · ');
}

function AdminAiActivity({ status }: { status: AdminAiChatStatus | null }) {
  const t = useTranslations();
  const phase = status?.phase ?? 'running';
  const toolName = status?.toolName;

  if (!toolName) {
    return (
      <span
        role="status"
        aria-live="polite"
        data-slot="admin-ai-activity"
        className="flex min-w-0 items-center gap-2 rounded-full bg-card px-3 py-2 shadow-[var(--shadow-vapor)]"
      >
        <Spinner className="size-3.5 shrink-0" />
        <span className="truncate">{t('aiChat.thinking')}</span>
      </span>
    );
  }

  const tool = t(`aiChat.toolActivity.labels.${adminAiToolActivityKey(toolName)}`);
  return (
    <span
      role="status"
      aria-live="polite"
      data-slot="admin-ai-activity"
      data-phase={phase}
      className="flex min-w-0 items-center gap-2 rounded-full bg-card px-3 py-2 shadow-[var(--shadow-vapor)]"
    >
      {phase === 'running' ? <Spinner className="size-3.5 shrink-0" /> : null}
      {phase === 'completed' ? <Check className="size-3.5 shrink-0 text-emerald-600" /> : null}
      {phase === 'failed' ? <X className="size-3.5 shrink-0 text-destructive" /> : null}
      <span className="truncate">{t(`aiChat.toolActivity.${phase}`, { tool })}</span>
    </span>
  );
}

function AnalyticsCard({
  result,
  onNavigate,
}: {
  result: AnalyticsResult;
  onNavigate: () => void;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const displayValue = (value: unknown, unit?: string) =>
    displayAdminAiValue(value, locale, t('aiChat.yes'), t('aiChat.no'), unit);

  const data = result.data;
  const metrics = (result.metrics?.length ? result.metrics : adminAiMetricsFromUnknown(data)).slice(
    0,
    8,
  ) as AnalyticsMetricResult[];
  const focusTable = analyticsFocusTable(result.focus);
  const analyticsTables = focusTable
    ? [focusTable]
    : adminAiResultTables(data).filter((table) => !table.path.endsWith('metrics'));
  const [primaryTable] = analyticsTables;
  const rows = primaryTable?.rows ?? [];
  const summary = metrics.length === 0 ? adminAiScalarEntries(data, 8) : [];
  const allColumns = primaryTable?.columns ?? [];
  const labelKey = allColumns.find((key) =>
    [
      'title',
      'name',
      'promoCode',
      'sku',
      'risk',
      'bucket',
      'date',
      'day',
      'weekStart',
      'status',
      'key',
      'query',
      'city',
    ].includes(key),
  );
  const valueKey = selectAnalyticsChartMetric(rows, allColumns);
  const chartRows = analyticsChartRows(rows, valueKey);
  const requestedRange =
    result.investigation?.requestedRange ??
    (result.filters
      ? { startDate: result.filters.startDate, endDate: result.filters.endDate }
      : null);
  const effectiveRange =
    result.investigation?.commonEffectiveRange ??
    result.focus?.effectiveRange ??
    metrics.find(analyticsRangesDiffer)?.effectiveRange ??
    null;
  const metricWarnings = [
    ...new Set(
      metrics.map((metric) => metric.warning).filter((value): value is string => Boolean(value)),
    ),
  ];

  return (
    <section className="mt-4 overflow-hidden rounded-[1.15rem] border border-border/60 bg-card shadow-[var(--shadow-vapor)]">
      <div className="border-b border-border/60 bg-secondary/35 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold capitalize text-foreground">
              {queryLabel(result.focus?.dimension ?? result.view ?? result.query)}
            </p>
            <p className="mt-0.5 text-[0.65rem] capitalize text-muted-foreground">
              {queryLabel(result.view ?? result.query)}
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-primary/10 px-2 py-1 text-[0.62rem] font-semibold text-primary">
            Analytics
          </span>
        </div>
        {requestedRange?.startDate || requestedRange?.endDate ? (
          <p className="mt-2 text-[0.68rem] text-muted-foreground">
            {t('aiChat.analyticsRequestedRange')}: {requestedRange.startDate ?? '…'}–
            {requestedRange.endDate ?? '…'}
          </p>
        ) : null}
        {result.investigation?.comparisonStatus === 'unavailable' ? (
          <p className="mt-1 text-[0.68rem] font-medium text-amber-700 dark:text-amber-300">
            {t('aiChat.analyticsComparisonUnavailable')}
          </p>
        ) : effectiveRange &&
          (effectiveRange.startDate !== requestedRange?.startDate ||
            effectiveRange.endDate !== requestedRange?.endDate) ? (
          <p className="mt-1 text-[0.68rem] font-medium text-amber-700 dark:text-amber-300">
            {t(
              result.investigation
                ? 'aiChat.analyticsSharedRange'
                : 'aiChat.analyticsEffectiveRange',
            )}
            : {effectiveRange.startDate ?? '…'}–{effectiveRange.endDate ?? '…'}
          </p>
        ) : null}
        {(result.focus?.definition ?? result.definition) ? (
          <p className="mt-2 text-[0.68rem] leading-5 text-muted-foreground">
            {result.focus?.definition ?? result.definition}
          </p>
        ) : null}
      </div>
      {metrics.length ? (
        <div className="grid grid-cols-1 gap-px bg-border/50 sm:grid-cols-2">
          {metrics.map((metric) => (
            <div key={metric.key} className="min-w-0 bg-card px-3 py-3">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 text-[0.66rem] font-medium capitalize text-muted-foreground">
                  {queryLabel(metric.name ?? metric.key)}
                </p>
                {metric.estimated ? (
                  <span className="shrink-0 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[0.58rem] font-semibold text-amber-700 dark:text-amber-300">
                    {t('aiChat.analyticsEstimated')}
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-base font-semibold text-foreground">
                {displayValue(metric.value, metric.unit)}
              </p>
              {'previous' in metric ? (
                <p className="mt-0.5 text-[0.68rem] text-muted-foreground">
                  {t('aiChat.previous')}: {displayValue(metric.previous, metric.unit)}
                  {typeof metric.changePct === 'number'
                    ? ` · ${metric.changePct >= 0 ? '+' : ''}${metric.changePct.toFixed(1)}%`
                    : ''}
                </p>
              ) : null}
              {metric.previous == null && metric.comparisonReason ? (
                <p className="mt-1 text-[0.62rem] leading-4 text-muted-foreground">
                  {metric.comparisonReason}
                </p>
              ) : null}
              {metric.definition ? (
                <p className="mt-2 text-[0.65rem] leading-4 text-muted-foreground">
                  {metric.definition}
                </p>
              ) : null}
              {metric.asOf || typeof metric.coveragePct === 'number' ? (
                <p className="mt-1.5 text-[0.62rem] leading-4 text-muted-foreground">
                  {metric.asOf ? `${t('aiChat.analyticsAsOf')}: ${metric.asOf}` : ''}
                  {metric.asOf && typeof metric.coveragePct === 'number' ? ' · ' : ''}
                  {typeof metric.coveragePct === 'number'
                    ? `${t('aiChat.analyticsCoverage')}: ${displayValue(metric.coveragePct, 'percent')}`
                    : ''}
                </p>
              ) : null}
              {analyticsRangesDiffer(metric) ? (
                <p className="mt-1 text-[0.62rem] text-amber-700 dark:text-amber-300">
                  {t('aiChat.analyticsEffectiveRange')}: {metric.effectiveRange?.startDate ?? '…'}–
                  {metric.effectiveRange?.endDate ?? '…'}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      {result.focus ? (
        <div className="border-t border-border/50 px-4 py-3 text-[0.68rem] leading-5 text-muted-foreground">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-semibold text-foreground">
              {t('aiChat.analyticsMatched', {
                matched: result.focus.matched ?? 0,
                available: result.focus.available ?? 0,
              })}
            </span>
            {result.focus.dateBasis ? (
              <span>
                {t('aiChat.analyticsDateBasis')}: {result.focus.dateBasis}
              </span>
            ) : null}
          </div>
          {result.focus.totalSemantics ? (
            <p className="mt-1">{result.focus.totalSemantics}</p>
          ) : null}
          {result.focus.warning ? (
            <p className="mt-1 font-medium text-amber-700 dark:text-amber-300">
              {result.focus.warning}
            </p>
          ) : null}
        </div>
      ) : null}
      {summary.length ? (
        <div className="grid grid-cols-2 gap-px bg-border/50 sm:grid-cols-4">
          {summary.map(([key, value]) => (
            <div key={key} className="bg-card px-3 py-3">
              <p className="truncate text-[0.66rem] capitalize text-muted-foreground">
                {queryLabel(key)}
              </p>
              <p className="mt-1 text-sm font-semibold text-foreground">{displayValue(value)}</p>
            </div>
          ))}
        </div>
      ) : null}
      {chartRows.length && labelKey && valueKey ? (
        <div className="h-48 min-w-0 px-3 pb-2 pt-4">
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <BarChart data={chartRows}>
              <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey={labelKey}
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={{ stroke: 'hsl(var(--border))' }}
                axisLine={{ stroke: 'hsl(var(--border))' }}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={{ stroke: 'hsl(var(--border))' }}
                axisLine={{ stroke: 'hsl(var(--border))' }}
                width={42}
              />
              <Tooltip
                formatter={(value) => [displayValue(value), queryLabel(valueKey)]}
                contentStyle={{
                  borderRadius: '12px',
                  borderColor: 'hsl(var(--border))',
                  background: 'hsl(var(--popover))',
                  color: 'hsl(var(--popover-foreground))',
                }}
              />
              <Bar dataKey="__chartValue" radius={[6, 6, 0, 0]} isAnimationActive={false}>
                {chartRows.map((_, index) => (
                  <Cell
                    key={index}
                    fill={analyticsChartPalette[index % analyticsChartPalette.length]}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : null}
      {rows.length && labelKey && !valueKey ? (
        <p className="border-b border-border/45 px-4 py-3 text-xs text-muted-foreground">
          {t('aiChat.noChartData')}
        </p>
      ) : null}
      {analyticsTables.map((table) => (
        <AdminAiResultTable
          key={table.path}
          table={table}
          formatLabel={queryLabel}
          formatValue={displayValue}
          showingRows={(shown, available) => t('aiChat.showingRows', { shown, available })}
        />
      ))}
      {result.caveats?.length ? (
        <p className="border-t border-border/50 px-4 py-3 text-[0.68rem] leading-5 text-muted-foreground">
          {result.caveats[0]}
        </p>
      ) : null}
      {result.sources?.length ? (
        <div className="border-t border-border/50 px-4 py-3">
          <p className="text-[0.68rem] font-semibold text-foreground">{t('aiChat.sourceHealth')}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {result.sources.slice(0, 8).map((source, index) => (
              <span
                key={`${String(source.key)}-${index}`}
                className="rounded-full bg-secondary px-2 py-1 text-[0.65rem] text-muted-foreground"
              >
                {queryLabel(String(source.key ?? ''))} · {queryLabel(String(source.state ?? ''))}
                {typeof source.coveragePct === 'number' ? ` · ${source.coveragePct}%` : ''}
                {typeof source.throughDate === 'string'
                  ? ` · ${t('aiChat.analyticsAsOf')} ${source.throughDate}`
                  : ''}
              </span>
            ))}
          </div>
        </div>
      ) : null}
      {metricWarnings.length || result.warnings?.length || result.truncations?.length ? (
        <div className="space-y-1 border-t border-border/50 px-4 py-3 text-[0.68rem] leading-5 text-amber-700 dark:text-amber-300">
          {metricWarnings.slice(0, 3).map((warning) => (
            <p key={warning}>
              {t('aiChat.analyticsWarning')}: {warning}
            </p>
          ))}
          {result.warnings?.slice(0, 3).map((warning, index) => (
            <p key={`warning-${index}`}>
              {t('aiChat.analyticsWarning')}: {adminAiNoticeText(warning)}
            </p>
          ))}
          {result.truncations?.slice(0, 3).map((truncation, index) => (
            <p key={`truncation-${index}`}>
              {t('aiChat.showingRows', {
                shown: truncation.included ?? 0,
                available: truncation.available ?? 0,
              })}{' '}
              ({queryLabel(truncation.path)})
            </p>
          ))}
        </div>
      ) : null}
      <div className="flex items-center justify-between gap-3 border-t border-border/50 px-4 py-3">
        <p className="text-[0.62rem] text-muted-foreground">
          {result.generatedAt ? `${t('aiChat.analyticsGeneratedAt')}: ${result.generatedAt}` : ''}
        </p>
        <Link
          href={analyticsWorkspaceUrl(result, locale)}
          onClick={onNavigate}
          className="inline-flex h-8 shrink-0 items-center justify-center rounded-full bg-secondary px-3 text-xs font-semibold text-secondary-foreground shadow-[var(--shadow-vapor)] transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          {t('aiChat.openAnalytics')}
          <ArrowUpRight className="ms-1.5 size-3.5" />
        </Link>
      </div>
    </section>
  );
}

function StructuredToolResultCard({
  result,
  onNavigate,
  onPrompt,
}: {
  result: AdminAiToolResult;
  onNavigate: () => void;
  onPrompt: (prompt: string) => void;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const presentation = adminAiToolPresentation(result.toolName, result.output, locale);
  const displayValue = (value: unknown) =>
    displayAdminAiValue(value, locale, t('aiChat.yes'), t('aiChat.no'));
  const landingGeneration = landingPageGenerationPresentation(result.toolName, result.output);
  const ecotrackTerminal = ecotrackTerminalPresentation(result.toolName, result.output);
  const summary =
    landingGeneration || ecotrackTerminal ? [] : adminAiScalarEntries(result.output, 10);
  const tables = landingGeneration || ecotrackTerminal ? [] : adminAiResultTables(result.output);
  const error =
    result.output &&
    typeof result.output === 'object' &&
    typeof (result.output as { error?: unknown }).error === 'string'
      ? (result.output as { error: string }).error
      : null;

  return (
    <section className="mt-4 overflow-hidden rounded-[1.15rem] border border-border/60 bg-card shadow-[var(--shadow-vapor)]">
      <div className="border-b border-border/60 bg-secondary/35 px-4 py-3">
        <p className="text-xs font-semibold text-foreground">
          {t(`aiChat.toolLabels.${presentation.labelKey}`)}
        </p>
        <p className="mt-0.5 text-[0.65rem] capitalize text-muted-foreground">
          {queryLabel(result.toolName)}
        </p>
      </div>
      {error ? (
        <p className="px-4 py-3 text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {landingGeneration ? (
        <div className="space-y-3 px-4 py-4">
          <div>
            <p className="text-xs font-semibold text-foreground">
              {t(`aiChat.landingGeneration.status.${landingGeneration.status}`)}
            </p>
            {landingGeneration.reasoning ? (
              <p className="mt-1 text-[0.7rem] leading-5 text-muted-foreground">
                {landingGeneration.reasoning}
              </p>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {[
              ['generated', landingGeneration.generatedSections],
              ['planned', landingGeneration.plannedSections],
              ['preserved', landingGeneration.preservedSections],
              ['fallback', landingGeneration.fallbackSections],
              ['skipped', landingGeneration.skippedSections],
              ...(landingGeneration.deletedSections > 0
                ? ([['deleted', landingGeneration.deletedSections]] as const)
                : []),
              ['retries', landingGeneration.retryCount],
            ].map(([key, value]) => (
              <div key={key} className="rounded-xl bg-secondary/45 px-3 py-2.5">
                <p className="text-[0.64rem] text-muted-foreground">
                  {t(`aiChat.landingGeneration.${key}`)}
                </p>
                <p className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">{value}</p>
              </div>
            ))}
          </div>
          {landingGeneration.failures.length ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/8 px-3 py-2.5">
              <p className="text-[0.68rem] font-semibold text-amber-800 dark:text-amber-200">
                {t('aiChat.landingGeneration.fallbackDetails')}
              </p>
              <ul className="mt-1 space-y-1 text-[0.68rem] text-amber-800/90 dark:text-amber-100/90">
                {landingGeneration.failures.map((failure, index) => (
                  <li key={`${failure.type ?? 'plan'}:${failure.reason}:${index}`}>
                    {failure.type ? `${queryLabel(failure.type)} · ` : ''}
                    {t(`aiChat.landingGeneration.reasons.${failure.reason}`)}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
      {ecotrackTerminal ? (
        <div className="space-y-3 px-4 py-4">
          <p className="text-[0.68rem] text-muted-foreground">
            {t('aiChat.ecotrackTerminal.attempts', {
              attempt: ecotrackTerminal.attemptNumber,
              retries: ecotrackTerminal.retryCount,
            })}
          </p>
          {(
            [
              ['successes', ecotrackTerminal.successes, 'text-emerald-700 dark:text-emerald-300'],
              [
                'validationFailures',
                ecotrackTerminal.validationFailures,
                'text-amber-700 dark:text-amber-300',
              ],
              ['providerRejections', ecotrackTerminal.providerRejections, 'text-destructive'],
              ['alreadyPosted', ecotrackTerminal.alreadyPosted, 'text-muted-foreground'],
            ] as const
          ).map(([key, rows, tone]) =>
            rows.length ? (
              <section key={key} className="rounded-xl border border-border/55 px-3 py-2.5">
                <p className={`text-[0.68rem] font-semibold ${tone}`}>
                  {t(`aiChat.ecotrackTerminal.${key}`, { count: rows.length })}
                </p>
                <ul className="mt-1.5 space-y-1 text-[0.68rem] leading-5 text-foreground">
                  {rows.map((row, index) => (
                    <li key={`${row.orderId ?? row.reference ?? 'order'}-${index}`}>
                      <span className="font-semibold">
                        {row.orderId ? `#${row.orderId}` : (row.reference ?? t('aiChat.orders'))}
                      </span>
                      {row.tracking ? ` · ${row.tracking}` : ''} · {row.message}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null,
          )}
          {ecotrackTerminal.repairableOrderIds.length ||
          ecotrackTerminal.retryableOrderIds.length ? (
            <div className="flex flex-wrap gap-2 border-t border-border/50 pt-3">
              {ecotrackTerminal.repairableOrderIds.length ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    onPrompt(
                      t('aiChat.ecotrackTerminal.repairPrompt', {
                        ids: ecotrackTerminal.repairableOrderIds.join(', '),
                        provider: ecotrackTerminal.provider ?? 'EcoTrack',
                      }),
                    )
                  }
                >
                  <Pencil className="size-3.5" />
                  {t('aiChat.ecotrackTerminal.repair')}
                </Button>
              ) : null}
              {ecotrackTerminal.retryableOrderIds.length && ecotrackTerminal.provider ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={() =>
                    onPrompt(
                      t('aiChat.ecotrackTerminal.retryPrompt', {
                        ids: ecotrackTerminal.retryableOrderIds.join(', '),
                        provider: ecotrackTerminal.provider ?? 'EcoTrack',
                      }),
                    )
                  }
                >
                  {t('aiChat.ecotrackTerminal.retry')}
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
      {summary.length ? (
        <div className="grid grid-cols-2 gap-px bg-border/50 sm:grid-cols-4">
          {summary.map(([key, value]) => (
            <div key={key} className="min-w-0 bg-card px-3 py-3">
              <p className="truncate text-[0.66rem] capitalize text-muted-foreground">
                {queryLabel(key)}
              </p>
              <p className="mt-1 break-words text-xs font-semibold text-foreground">
                {displayValue(value)}
              </p>
            </div>
          ))}
        </div>
      ) : null}
      {tables.map((table) => (
        <AdminAiResultTable
          key={table.path}
          table={table}
          formatLabel={queryLabel}
          formatValue={displayValue}
          showingRows={(shown, available) => t('aiChat.showingRows', { shown, available })}
        />
      ))}
      {!error &&
      !landingGeneration &&
      !ecotrackTerminal &&
      summary.length === 0 &&
      tables.length === 0 ? (
        <p className="px-4 py-3 text-xs text-muted-foreground">{t('aiChat.noToolData')}</p>
      ) : null}
      {presentation.href && presentation.destinationKey ? (
        <div className="border-t border-border/50 px-3 py-2.5">
          <Link
            href={presentation.href}
            onClick={onNavigate}
            className="inline-flex min-h-8 items-center gap-1.5 rounded-[0.75rem] px-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
          >
            {t(`aiChat.toolDestinations.${presentation.destinationKey}`)}
            <ArrowUpRight className="size-3.5 rtl:-scale-x-100" />
          </Link>
        </div>
      ) : null}
    </section>
  );
}

export function AdminAiChat({ permissions = [] }: { permissions?: PermissionKey[] }) {
  const t = useTranslations();
  const surfaceContext = useAdminAiSurfaceContext();
  const suggestionKeys = useMemo(
    () => suggestionKeysForAdminAi(surfaceContext, permissions),
    [permissions, surfaceContext],
  );
  const [open, setOpen] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<'conversation' | 'chats'>('conversation');
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState(false);
  const [receivingText, setReceivingText] = useState(false);
  const [activity, setActivity] = useState<AdminAiChatStatus | null>(null);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [autoAcceptProposals, setAutoAcceptProposals] = useState(false);
  const [model, setModel] = useState<AdminAiModelId>(ADMIN_AI_DEFAULT_MODEL);
  const [reasoningEffort, setReasoningEffort] = useState<AdminAiReasoningEffort>(
    ADMIN_AI_DEFAULT_REASONING_EFFORT,
  );
  const [reviewingProposalId, setReviewingProposalId] = useState<number | null>(null);
  const [proposalReviewError, setProposalReviewError] = useState<{
    messageId: string;
    message: string;
    nextAction?: ProposalNextAction;
  } | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [conversationSearch, setConversationSearch] = useState('');
  const deferredConversationSearch = useDeferredValue(conversationSearch.trim());
  const [jobs, setJobs] = useState<AiJob[]>([]);
  const [cancellingJobId, setCancellingJobId] = useState<string | null>(null);
  const [selectedConversationId, setSelectedConversationId] = useState<number | null>(null);
  const hasActiveJobs = jobs.some((job) => job.status === 'queued' || job.status === 'running');
  const conversationKeyRef = useRef<string | null>(null);
  const activeConversationRef = useRef<ConversationSummary | null>(null);
  const conversationRequestRef = useRef(0);
  const autoAcceptProposalsRef = useRef(false);
  const responseAbortRef = useRef<AbortController | null>(null);
  const terminalJobIdsRef = useRef(new Set<string>());
  const refreshedTerminalJobIdsRef = useRef(new Set<string>());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const openAssistant = () => {
      setMobilePanel('conversation');
      setOpen(true);
    };
    window.addEventListener(ADMIN_AI_OPEN_EVENT, openAssistant);
    return () => window.removeEventListener(ADMIN_AI_OPEN_EVENT, openAssistant);
  }, []);
  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => composerRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open]);
  const selectConversation = useCallback(async (conversation: ConversationSummary) => {
    const requestId = ++conversationRequestRef.current;
    activeConversationRef.current = conversation;
    conversationKeyRef.current = conversation.sessionKey;
    setSelectedConversationId(conversation.id);
    setLoadingConversation(true);
    setMessages([]);
    try {
      const response = await fetch(`/api/ai/conversations/${conversation.id}`, {
        cache: 'no-store',
      });
      if (!response.ok || requestId !== conversationRequestRef.current) return;
      const data = (await response.json()) as {
        messages: Array<ChatMessage & { toolResults?: unknown }>;
      };
      setMessages(data.messages.map(hydrateChatMessage));
      setInput('');
    } finally {
      if (requestId === conversationRequestRef.current) setLoadingConversation(false);
    }
  }, []);
  const reconcileTerminalJobs = useCallback(
    async (conversation: ConversationSummary, terminalJobIds: string[]) => {
      const delays = [0, 250, 500, 1_000, 2_000];
      for (const delay of delays) {
        if (delay > 0) await new Promise((resolve) => window.setTimeout(resolve, delay));
        if (activeConversationRef.current?.id !== conversation.id) return;
        const response = await fetch(`/api/ai/conversations/${conversation.id}`, {
          cache: 'no-store',
        });
        if (!response.ok || activeConversationRef.current?.id !== conversation.id) continue;
        const data = (await response.json()) as {
          messages: Array<ChatMessage & { toolResults?: unknown }>;
        };
        const hydrated = data.messages.map(hydrateChatMessage);
        setMessages(hydrated);
        const terminalMessages = new Map(
          hydrated.flatMap((message) =>
            message.terminal && message.jobId ? [[message.jobId, message] as const] : [],
          ),
        );
        for (const jobId of terminalJobIds) {
          const message = terminalMessages.get(jobId);
          if (
            message?.results?.some((result) => result.toolName === 'ecotrack_posting_terminal') &&
            !refreshedTerminalJobIdsRef.current.has(jobId)
          ) {
            refreshedTerminalJobIdsRef.current.add(jobId);
            notifyAdminAiMutation(['post_orders_to_ecotrack']);
          }
        }
        if (terminalJobIds.every((jobId) => terminalMessages.has(jobId))) return;
      }
    },
    [],
  );
  const loadConversations = useCallback(
    async (selectLatest = false) => {
      setLoadingConversations(true);
      try {
        const query = deferredConversationSearch
          ? `?q=${encodeURIComponent(deferredConversationSearch)}`
          : '';
        const response = await fetch(`/api/ai/conversations${query}`, { cache: 'no-store' });
        if (!response.ok) return;
        const data = (await response.json()) as { conversations: ConversationSummary[] };
        setConversations(data.conversations);
        if (selectLatest && activeConversationRef.current === null && data.conversations[0]) {
          void selectConversation(data.conversations[0]);
        }
      } finally {
        setLoadingConversations(false);
      }
    },
    [deferredConversationSearch, selectConversation],
  );
  const loadAiHistory = useCallback(async () => {
    const response = await fetch('/api/ai/history', { cache: 'no-store' });
    if (!response.ok) return;
    const data = (await response.json()) as { jobs?: AiJob[] };
    const nextJobs = Array.isArray(data.jobs) ? data.jobs : [];
    setJobs(nextJobs);
    const terminalJobs = nextJobs.filter((job) =>
      ['completed', 'cancelled', 'failed'].includes(job.status),
    );
    const newTerminalJobIds = terminalJobs
      .filter((job) => !terminalJobIdsRef.current.has(job.id))
      .map((job) => job.id);
    terminalJobIdsRef.current = new Set(terminalJobs.map((job) => job.id));
    const activeConversation = activeConversationRef.current;
    if (newTerminalJobIds.length > 0 && activeConversation) {
      void reconcileTerminalJobs(activeConversation, newTerminalJobIds);
    }
  }, [reconcileTerminalJobs]);

  useEffect(() => {
    const enabled = window.localStorage.getItem(ADMIN_AI_AUTO_ACCEPT_STORAGE_KEY) === 'true';
    autoAcceptProposalsRef.current = enabled;
    const storedModel = adminAiModelIdSchema.safeParse(
      window.localStorage.getItem(ADMIN_AI_MODEL_STORAGE_KEY),
    );
    const nextModel = storedModel.success ? storedModel.data : ADMIN_AI_DEFAULT_MODEL;
    const storedEffort = adminAiReasoningEffortSchema.safeParse(
      window.localStorage.getItem(ADMIN_AI_REASONING_EFFORT_STORAGE_KEY),
    );
    const nextEffort =
      storedEffort.success && supportsAdminAiReasoningEffort(nextModel, storedEffort.data)
        ? storedEffort.data
        : getDefaultAdminAiReasoningEffort(nextModel);
    queueMicrotask(() => {
      setAutoAcceptProposals(enabled);
      setModel(nextModel);
      setReasoningEffort(nextEffort);
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    if (activeConversationRef.current) void selectConversation(activeConversationRef.current);
    void loadConversations(
      activeConversationRef.current === null && deferredConversationSearch.length === 0,
    );
  }, [deferredConversationSearch, open, loadConversations, selectConversation]);

  useEffect(() => {
    if (!open && !hasActiveJobs) return;
    const initial = window.setTimeout(() => void loadAiHistory(), 0);
    const interval = window.setInterval(() => void loadAiHistory(), 2_500);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [hasActiveJobs, loadAiHistory, open]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [messages, pending]);

  function newChat() {
    conversationRequestRef.current += 1;
    activeConversationRef.current = null;
    conversationKeyRef.current = crypto.randomUUID();
    setSelectedConversationId(null);
    setLoadingConversation(false);
    setMessages([]);
    setInput('');
  }

  async function renameConversation(conversation: ConversationSummary, title: string) {
    const normalized = title.trim();
    if (!normalized) return false;
    const response = await fetch(`/api/ai/conversations/${conversation.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: normalized }),
    });
    if (!response.ok) return false;
    const data = (await response.json()) as { conversation: ConversationSummary };
    setConversations((current) =>
      current.map((item) => (item.id === conversation.id ? data.conversation : item)),
    );
    if (activeConversationRef.current?.id === conversation.id)
      activeConversationRef.current = data.conversation;
    return true;
  }

  async function deleteConversation(conversation: ConversationSummary) {
    if (!window.confirm(t('aiChat.deleteChatConfirm'))) return;
    const response = await fetch(`/api/ai/conversations/${conversation.id}`, {
      method: 'DELETE',
    });
    if (!response.ok) return;
    setConversations((current) => current.filter((item) => item.id !== conversation.id));
    if (activeConversationRef.current?.id === conversation.id) newChat();
  }

  async function rateAssistantMessage(
    messageRecordId: number,
    feedback: 'helpful' | 'not_helpful',
  ) {
    const previous = messages.find(
      (message) => message.messageRecordId === messageRecordId,
    )?.feedback;
    setMessages((current) =>
      current.map((message) =>
        message.messageRecordId === messageRecordId ? { ...message, feedback } : message,
      ),
    );
    const response = await fetch(`/api/ai/messages/${messageRecordId}/feedback`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ feedback }),
    });
    if (!response.ok) {
      setMessages((current) =>
        current.map((message) =>
          message.messageRecordId === messageRecordId
            ? { ...message, feedback: previous }
            : message,
        ),
      );
    }
  }

  function updateAutoAcceptProposals(enabled: boolean) {
    autoAcceptProposalsRef.current = enabled;
    setAutoAcceptProposals(enabled);
    window.localStorage.setItem(ADMIN_AI_AUTO_ACCEPT_STORAGE_KEY, String(enabled));
  }

  function updateModel(nextModel: AdminAiModelId) {
    const nextEffort = supportsAdminAiReasoningEffort(nextModel, reasoningEffort)
      ? reasoningEffort
      : getDefaultAdminAiReasoningEffort(nextModel);
    setModel(nextModel);
    setReasoningEffort(nextEffort);
    window.localStorage.setItem(ADMIN_AI_MODEL_STORAGE_KEY, nextModel);
    window.localStorage.setItem(ADMIN_AI_REASONING_EFFORT_STORAGE_KEY, nextEffort);
  }

  function updateReasoningEffort(nextEffort: AdminAiReasoningEffort) {
    if (!supportsAdminAiReasoningEffort(model, nextEffort)) return;
    setReasoningEffort(nextEffort);
    window.localStorage.setItem(ADMIN_AI_REASONING_EFFORT_STORAGE_KEY, nextEffort);
  }

  async function submitProposalReview(
    messageId: string,
    proposalId: number,
    action: 'approve' | 'reject',
  ) {
    setReviewingProposalId(proposalId);
    setProposalReviewError(null);
    try {
      const response = await fetch(`/api/ai/proposals/${proposalId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = (await response.json()) as {
        error?: string;
        code?: string;
        nextAction?: ProposalNextAction;
        proposal?: { status?: Proposal['status']; verified?: boolean };
      };
      if (!response.ok || !data.proposal?.status) {
        setProposalReviewError({
          messageId,
          message: data.error ?? t('aiChat.proposalReviewError'),
          nextAction: data.nextAction,
        });
        return false;
      }
      if (data.proposal.status === 'applied' && data.proposal.verified !== true) {
        throw new Error(t('aiChat.proposalVerificationError'));
      }
      setMessages((items) =>
        items.map((message) =>
          message.id === messageId
            ? {
                ...message,
                proposals: message.proposals?.map((proposal) =>
                  proposal.id === proposalId
                    ? { ...proposal, status: data.proposal!.status! }
                    : proposal,
                ),
              }
            : message,
        ),
      );
      notifyAdminAiMutation(['review_ai_proposals']);
      return true;
    } catch (error) {
      setProposalReviewError({
        messageId,
        message: error instanceof Error ? error.message : t('aiChat.proposalReviewError'),
      });
      return false;
    } finally {
      setReviewingProposalId(null);
    }
  }

  async function autoApproveNewProposals(messageId: string, proposals: Proposal[]) {
    for (const proposal of proposals) {
      const applied = await submitProposalReview(messageId, proposal.id, 'approve');
      if (!applied) break;
    }
  }

  async function send() {
    const message = input.trim();
    if (!message || pending || loadingConversation) return;
    conversationKeyRef.current ??= crypto.randomUUID();
    setMessages((items) => [...items, { role: 'user', content: message }]);
    setInput('');
    setPending(true);
    setReceivingText(false);
    setActivity(null);
    const assistantId = crypto.randomUUID();
    const abortController = new AbortController();
    responseAbortRef.current = abortController;
    let receivedText = false;
    let failedToolResults: unknown;
    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message,
          conversationKey: conversationKeyRef.current,
          autoAcceptProposals: autoAcceptProposalsRef.current,
          model,
          reasoningEffort,
          context: surfaceContext.surface === 'unknown' ? undefined : surfaceContext,
        }),
        signal: abortController.signal,
      });
      await consumeAdminAiChatResponse(response, {
        onStatus(status) {
          setActivity(status);
        },
        onTextDelta(delta) {
          receivedText = true;
          setReceivingText(true);
          setMessages((items) => {
            const existing = items.findIndex((item) => item.id === assistantId);
            if (existing < 0)
              return [...items, { id: assistantId, role: 'assistant', content: delta }];
            return items.map((item, index) =>
              index === existing ? { ...item, content: `${item.content}${delta}` } : item,
            );
          });
        },
        onResult(data) {
          const presentation = presentationFromUnknown(data.toolResults);
          const { proposals } = presentation;
          notifyAdminAiToolMutations(presentation.results);
          setMessages((items) => {
            const existing = items.findIndex((item) => item.id === assistantId);
            if (existing < 0)
              return [
                ...items,
                {
                  id: assistantId,
                  messageRecordId: data.messageId ?? undefined,
                  role: 'assistant',
                  content: t('aiChat.completed'),
                  ...presentation,
                },
              ];
            return items.map((item, index) =>
              index === existing
                ? { ...item, messageRecordId: data.messageId ?? undefined, ...presentation }
                : item,
            );
          });
          conversationKeyRef.current = data.conversation.sessionKey;
          activeConversationRef.current = data.conversation;
          setSelectedConversationId(data.conversation.id);
          if (autoAcceptProposalsRef.current && proposals.length > 0) {
            void autoApproveNewProposals(assistantId, proposals);
          }
        },
        onError(error) {
          failedToolResults = error.toolResults;
          notifyAdminAiToolMutations(presentationFromUnknown(error.toolResults).results);
        },
      });
      await loadConversations();
      await loadAiHistory();
    } catch {
      if (!abortController.signal.aborted) {
        const presentation = presentationFromUnknown(failedToolResults);
        if (receivedText) {
          setMessages((items) =>
            items.map((item) =>
              item.id === assistantId
                ? {
                    ...item,
                    content: `${item.content}\n\n${t('aiChat.interrupted')}`,
                    ...presentation,
                  }
                : item,
            ),
          );
        } else {
          setMessages((items) => [
            ...items,
            {
              id: assistantId,
              role: 'assistant',
              content: t('aiChat.error'),
              ...presentation,
            },
          ]);
        }
      }
    } finally {
      if (responseAbortRef.current === abortController) responseAbortRef.current = null;
      setPending(false);
      setReceivingText(false);
      setActivity(null);
    }
  }

  function cancelResponse() {
    responseAbortRef.current?.abort();
  }

  async function reviewProposal(
    messageId: string | undefined,
    proposalId: number,
    action: 'approve' | 'reject',
  ) {
    if (!messageId || reviewingProposalId !== null) return;
    await submitProposalReview(messageId, proposalId, action);
  }

  async function cancelJob(job: AiJob) {
    if (cancellingJobId !== null) return;
    setCancellingJobId(job.id);
    try {
      await fetch('/api/ai/jobs/cancel', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(
          job.type
            ? { type: job.type, jobId: job.id }
            : { kind: job.kind === 'ai-product-categorization' ? 'categorization' : 'content' },
        ),
      });
      await loadAiHistory();
    } finally {
      setCancellingJobId(null);
    }
  }

  return (
    <>
      <Button
        type="button"
        className="group fixed bottom-4 end-4 z-30 size-12 rounded-[1rem] p-0 shadow-[var(--shadow-vapor-strong)] sm:bottom-6 sm:end-6 sm:h-12 sm:w-auto sm:px-4"
        onClick={() => setOpen(true)}
        aria-label={t('aiChat.open')}
      >
        <span className="relative grid place-items-center">
          <Bot className="size-5" />
          <Sparkles className="absolute -end-1.5 -top-1.5 size-2.5 text-amber-200" />
        </span>
        <span className="hidden sm:inline">{t('aiChat.open')}</span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex h-[min(52rem,calc(100dvh-1rem))] max-h-[calc(100dvh-1rem)] max-w-[76rem] flex-col overflow-hidden rounded-[1.75rem] border border-border/60 bg-[var(--glass-surface)] p-0 sm:h-[min(52rem,calc(100vh-2rem))] sm:max-h-[calc(100vh-2rem)]">
          <DialogHeader className="relative shrink-0 border-b border-border/60 bg-card/75 px-4 py-4 pe-16 backdrop-blur-xl sm:px-6 sm:py-5 sm:pe-20">
            <div className="flex items-start gap-3">
              <div className="grid size-11 shrink-0 place-items-center rounded-[1rem] bg-primary text-primary-foreground shadow-[var(--shadow-vapor)]">
                <Bot className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <DialogTitle className="text-base sm:text-lg">{t('aiChat.title')}</DialogTitle>
                <div className="mt-3 flex flex-wrap items-end gap-3">
                  <label className="min-w-[13rem]">
                    <span className="mb-1 block text-[0.68rem] font-medium text-muted-foreground">
                      {t('aiChat.model')}
                    </span>
                    <select
                      value={model}
                      onChange={(event) =>
                        updateModel(adminAiModelIdSchema.parse(event.target.value))
                      }
                      aria-label={t('aiChat.model')}
                      className="h-9 w-full rounded-lg border border-border/70 bg-background px-2.5 text-xs text-foreground shadow-sm outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
                    >
                      {ADMIN_AI_MODEL_OPTIONS.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label} · {option.cost}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="min-w-[8rem]">
                    <span className="mb-1 block text-[0.68rem] font-medium text-muted-foreground">
                      {t('aiChat.reasoningEffort')}
                    </span>
                    <select
                      value={reasoningEffort}
                      onChange={(event) =>
                        updateReasoningEffort(
                          adminAiReasoningEffortSchema.parse(event.target.value),
                        )
                      }
                      aria-label={t('aiChat.reasoningEffort')}
                      className="h-9 w-full rounded-lg border border-border/70 bg-background px-2.5 text-xs text-foreground shadow-sm outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
                    >
                      {getAdminAiModelOption(model).reasoningEfforts.map((effort) => (
                        <option key={effort} value={effort}>
                          {t(`aiChat.reasoningLevels.${effort}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex h-9 cursor-pointer items-center gap-2.5">
                    <Switch
                      checked={autoAcceptProposals}
                      onCheckedChange={updateAutoAcceptProposals}
                      aria-label={t('aiChat.autoAccept')}
                    />
                    <span className="text-xs font-medium text-foreground">
                      {t('aiChat.autoAccept')}
                    </span>
                  </label>
                </div>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              className="absolute end-3 top-3 size-10 rounded-[0.9rem] p-0 sm:end-5 sm:top-5"
              onClick={() => setOpen(false)}
              aria-label={t('aiChat.close')}
            >
              <X className="size-5" />
            </Button>
          </DialogHeader>

          <div
            data-slot="admin-ai-workspace"
            className="isolate grid min-h-0 min-w-0 w-full flex-1 grid-rows-[auto_minmax(0,1fr)] overflow-hidden lg:grid-cols-[minmax(0,1fr)_22rem] lg:grid-rows-1"
          >
            <div
              className="col-start-1 row-start-1 grid grid-cols-2 gap-1 border-b border-border/60 bg-card/70 p-2 lg:hidden"
              aria-label={t('aiChat.mobilePanels')}
            >
              <Button
                type="button"
                size="sm"
                variant={mobilePanel === 'conversation' ? 'outline' : 'ghost'}
                aria-pressed={mobilePanel === 'conversation'}
                onClick={() => setMobilePanel('conversation')}
              >
                {t('aiChat.conversationTab')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={mobilePanel === 'chats' ? 'outline' : 'ghost'}
                aria-pressed={mobilePanel === 'chats'}
                onClick={() => setMobilePanel('chats')}
              >
                {t('aiChat.chats')}
              </Button>
            </div>
            <section
              data-slot="admin-ai-conversation"
              className={`${mobilePanel === 'conversation' ? 'flex' : 'hidden'} isolate col-start-1 row-start-2 min-h-0 min-w-0 overflow-hidden flex-col bg-background/45 lg:col-auto lg:row-auto lg:flex`}
              aria-label={t('aiChat.conversation')}
            >
              <div
                className="relative z-0 min-h-0 flex-1 overscroll-contain overflow-y-auto px-3 py-4 sm:px-5 sm:py-5"
                aria-live="polite"
              >
                {loadingConversation ? (
                  <div className="grid min-h-full place-items-center" role="status">
                    <span className="flex items-center gap-2 rounded-full bg-card px-4 py-2.5 text-xs text-muted-foreground shadow-[var(--shadow-vapor)]">
                      <Spinner className="size-4" />
                      {t('aiChat.loadingMessages')}
                    </span>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="mx-auto flex min-h-full max-w-xl items-center justify-center py-8 text-center">
                    <div>
                      <div className="mx-auto grid size-14 place-items-center rounded-[1.25rem] bg-primary/10 text-primary">
                        <Sparkles className="size-6" />
                      </div>
                      <h3 className="mt-4 text-base font-semibold text-foreground">
                        {t('aiChat.emptyTitle')}
                      </h3>
                      <p className="mx-auto mt-2 max-w-lg text-xs leading-6 text-muted-foreground sm:text-sm">
                        {t('aiChat.currentSurface', {
                          surface: t(`aiChat.surfaceLabels.${surfaceContext.surface}`),
                        })}
                      </p>
                      <div className="mt-5 grid gap-2 text-start sm:grid-cols-2">
                        {suggestionKeys.map((key) => {
                          const prompt = t(`aiChat.surfaceSuggestions.${key}`);
                          return (
                            <button
                              key={key}
                              type="button"
                              className="rounded-xl border border-border/65 bg-card px-3 py-2.5 text-xs leading-5 text-foreground transition-colors hover:border-primary/35 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
                              onClick={() => setInput(prompt)}
                            >
                              {prompt}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="mx-auto max-w-3xl space-y-5">
                    {messages.map((message, index) => (
                      <article
                        key={message.id ?? index}
                        className={
                          message.role === 'user'
                            ? 'flex min-w-0 justify-end ps-10'
                            : 'flex min-w-0 items-start gap-2.5 sm:gap-3'
                        }
                      >
                        {message.role === 'assistant' ? (
                          <span className="grid size-8 shrink-0 place-items-center rounded-[0.8rem] bg-primary/10 text-primary">
                            <Bot className="size-4" />
                          </span>
                        ) : null}
                        <div
                          data-slot={
                            message.role === 'assistant'
                              ? 'admin-ai-assistant-bubble'
                              : 'admin-ai-user-bubble'
                          }
                          className={
                            message.role === 'user'
                              ? 'min-w-0 max-w-[88%] rounded-[1.2rem] rounded-ee-md bg-primary px-4 py-3 text-sm leading-6 text-primary-foreground shadow-[var(--shadow-vapor)] [overflow-wrap:anywhere]'
                              : 'min-w-0 w-full max-w-[42rem] overflow-hidden rounded-[1.2rem] rounded-es-md border border-border/55 bg-card px-4 py-3 text-sm leading-6 text-foreground shadow-[var(--shadow-vapor)]'
                          }
                        >
                          {message.role === 'assistant' ? (
                            <Markdown>{message.content}</Markdown>
                          ) : (
                            <p className="whitespace-pre-wrap break-words">{message.content}</p>
                          )}
                          {message.role === 'assistant'
                            ? message.analytics?.map((result, analyticsIndex) => (
                                <AnalyticsCard
                                  key={`${result.query}-${analyticsIndex}`}
                                  result={result}
                                  onNavigate={() => setOpen(false)}
                                />
                              ))
                            : null}
                          {message.role === 'assistant'
                            ? message.results?.map((result, resultIndex) => (
                                <StructuredToolResultCard
                                  key={`${result.toolName}-${resultIndex}`}
                                  result={result}
                                  onNavigate={() => setOpen(false)}
                                  onPrompt={(prompt) => {
                                    setInput(prompt);
                                    window.requestAnimationFrame(() =>
                                      composerRef.current?.focus(),
                                    );
                                  }}
                                />
                              ))
                            : null}
                          {message.role === 'assistant'
                            ? message.proposals?.map((proposal) => (
                                <div
                                  key={proposal.id}
                                  className="mt-4 flex items-center gap-2 border-t border-border/50 pt-3"
                                >
                                  {proposal.status === 'proposed' ? (
                                    <>
                                      <Button
                                        type="button"
                                        size="sm"
                                        disabled={reviewingProposalId !== null}
                                        onClick={() =>
                                          void reviewProposal(message.id, proposal.id, 'approve')
                                        }
                                      >
                                        {reviewingProposalId === proposal.id ? (
                                          <Spinner className="size-3.5" />
                                        ) : (
                                          <Check className="size-3.5" />
                                        )}
                                        {t('aiChat.approve')}
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        disabled={reviewingProposalId !== null}
                                        onClick={() =>
                                          void reviewProposal(message.id, proposal.id, 'reject')
                                        }
                                      >
                                        <X className="size-3.5" />
                                        {t('aiChat.reject')}
                                      </Button>
                                    </>
                                  ) : (
                                    <p className="text-xs font-medium text-muted-foreground">
                                      {t(
                                        proposal.status === 'applied'
                                          ? 'aiChat.applied'
                                          : 'aiChat.rejected',
                                      )}
                                    </p>
                                  )}
                                </div>
                              ))
                            : null}
                          {message.role === 'assistant' &&
                          proposalReviewError &&
                          proposalReviewError.messageId === message.id ? (
                            <div className="mt-3 text-xs text-destructive" role="alert">
                              <p>{proposalReviewError.message}</p>
                              {proposalReviewError.nextAction ? (
                                <p className="mt-1 text-muted-foreground">
                                  {t(
                                    `aiChat.proposalNextActions.${proposalReviewError.nextAction}`,
                                  )}
                                </p>
                              ) : null}
                            </div>
                          ) : null}
                          {message.role === 'assistant' && message.messageRecordId ? (
                            <div className="mt-3 flex gap-1 border-t border-border/45 pt-2">
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="size-8 p-0"
                                aria-label={t('aiChat.helpful')}
                                aria-pressed={message.feedback === 'helpful'}
                                onClick={() =>
                                  void rateAssistantMessage(message.messageRecordId!, 'helpful')
                                }
                              >
                                <ThumbsUp className="size-3.5" />
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="size-8 p-0"
                                aria-label={t('aiChat.notHelpful')}
                                aria-pressed={message.feedback === 'not_helpful'}
                                onClick={() =>
                                  void rateAssistantMessage(message.messageRecordId!, 'not_helpful')
                                }
                              >
                                <ThumbsDown className="size-3.5" />
                              </Button>
                            </div>
                          ) : null}
                        </div>
                      </article>
                    ))}
                    {pending && !receivingText ? (
                      <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
                        <span className="grid size-8 place-items-center rounded-[0.8rem] bg-primary/10 text-primary">
                          <Bot className="size-4" />
                        </span>
                        <AdminAiActivity status={activity} />
                      </div>
                    ) : null}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>

              <div className="relative z-20 min-w-0 w-full shrink-0 border-t border-border/60 bg-card/80 p-3 backdrop-blur-xl sm:p-4">
                <div className="mx-auto flex min-w-0 w-full max-w-3xl items-end gap-2 overflow-hidden rounded-[1.15rem] border border-border/70 bg-background p-2 shadow-[var(--shadow-vapor)] focus-within:border-primary/35 focus-within:ring-2 focus-within:ring-primary/10">
                  <Textarea
                    ref={composerRef}
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        void send();
                      }
                    }}
                    placeholder={t(`aiChat.surfacePlaceholders.${surfaceContext.surface}`)}
                    aria-label={t('aiChat.placeholder')}
                    className="min-h-12 min-w-0 w-auto max-h-32 flex-1 resize-none border-0 bg-transparent px-2 py-2 shadow-none focus-visible:bg-transparent focus-visible:ring-0"
                  />
                  {pending ? (
                    <Button
                      type="button"
                      variant="destructive"
                      className="relative z-10 size-10 shrink-0 rounded-[0.85rem] p-0"
                      onClick={cancelResponse}
                      aria-label={t('aiChat.stopResponse')}
                    >
                      <X className="size-4" />
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      className="relative z-10 size-10 shrink-0 rounded-[0.85rem] p-0"
                      disabled={loadingConversation || !input.trim()}
                      onClick={() => void send()}
                      aria-label={t('aiChat.send')}
                    >
                      <Send className="size-4" />
                    </Button>
                  )}
                </div>
              </div>
            </section>

            <ChatSidebar
              mobileVisible={mobilePanel === 'chats'}
              conversations={conversations}
              selectedConversationId={selectedConversationId}
              loading={loadingConversations}
              jobs={jobs}
              cancellingJobId={cancellingJobId}
              search={conversationSearch}
              onNewChat={() => {
                newChat();
                setMobilePanel('conversation');
              }}
              onSearchChange={setConversationSearch}
              onSelectConversation={(conversation) => {
                setMobilePanel('conversation');
                void selectConversation(conversation);
              }}
              onRenameConversation={renameConversation}
              onDeleteConversation={(conversation) => void deleteConversation(conversation)}
              onCancelJob={(job) => void cancelJob(job)}
              labelize={queryLabel}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
