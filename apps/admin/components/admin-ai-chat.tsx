'use client';

import {
  Bot,
  Check,
  ChevronLeft,
  ChevronRight,
  MessageSquarePlus,
  Pencil,
  Search,
  Send,
  Sparkles,
  Trash2,
  ThumbsDown,
  ThumbsUp,
  X,
} from 'lucide-react';
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

import { consumeAdminAiChatResponse } from '../lib/admin-ai-chat-stream';
import { suggestionKeysForAdminAi } from '../lib/admin-ai-capabilities';
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
import { Input } from './ui/input';
import { Spinner } from './ui/spinner';
import { Switch } from './ui/switch';
import { Textarea } from './ui/textarea';
import { useAdminAiSurfaceContext } from './admin-ai-surface-context';

type AnalyticsResult = {
  query?: string;
  view?: string;
  source?: string;
  definition?: string;
  data?: unknown;
  caveats?: string[];
  filters?: { startDate?: string | null; endDate?: string | null; range?: string };
  generatedAt?: string;
  sources?: Array<Record<string, unknown>>;
  warnings?: unknown[];
  truncations?: Array<{ path?: string; available?: number; included?: number }>;
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
};
type ConversationSummary = {
  id: number;
  sessionKey: string;
  title: string | null;
  createdAt?: string;
  updatedAt?: string;
};
type AiJob = {
  id: string;
  queue: string;
  kind: string;
  type?: string;
  cancellable?: boolean;
  status: 'queued' | 'running' | 'completed' | 'cancelled' | 'failed';
  progress: { phase: string; current: number; total: number; percentage: number };
  errorMessage: string | null;
  resultSummary: Record<string, unknown> | null;
};
type ProposalNextAction = 'refresh' | 'regenerate' | 'review' | 'retry';

const ADMIN_AI_JOB_LABEL_KEYS: Record<string, string> = {
  ai_categorization: 'ai_categorization',
  ai_content: 'ai_content',
  product_export: 'product_export',
  catalog_feed_refresh: 'catalog_feed_refresh',
  order_export: 'order_export',
  order_ecotrack: 'order_ecotrack',
  stats_import: 'stats_import',
  ad_cost_import: 'ad_cost_import',
  reporting_refresh: 'reporting_refresh',
  ecotrack_catalog_sync: 'ecotrack_catalog_sync',
  ecotrack_shipment_sync: 'ecotrack_shipment_sync',
  'ai-product-categorization': 'ai_categorization',
  'ai-product-content': 'ai_content',
};
export const ADMIN_AI_AUTO_ACCEPT_STORAGE_KEY = 'bricomaitre:admin-ai:auto-accept';
export const ADMIN_AI_MODEL_STORAGE_KEY = 'bricomaitre:admin-ai:model';
export const ADMIN_AI_REASONING_EFFORT_STORAGE_KEY = 'bricomaitre:admin-ai:reasoning-effort';

const analyticsChartMetricKeys = [
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
  const [selected] = analyticsChartMetricKeys
    .filter((key) => columns.includes(key))
    .map((key) => ({
      key,
      magnitude: Math.max(0, ...rows.map((row) => Math.abs(finiteNumber(row[key]) ?? 0))),
    }))
    .sort((left, right) => right.magnitude - left.magnitude);
  return selected && selected.magnitude > 0 ? selected.key : null;
}

function resultFromUnknown(value: unknown, depth = 0): AnalyticsResult[] {
  if (depth > 5 || value == null) return [];
  if (Array.isArray(value)) return value.flatMap((item) => resultFromUnknown(item, depth + 1));
  if (typeof value !== 'object') return [];
  const item = value as Record<string, unknown>;
  return [
    ...(typeof item.query === 'string' && 'data' in item ? [item as AnalyticsResult] : []),
    ...Object.values(item).flatMap((child) => resultFromUnknown(child, depth + 1)),
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
    ...presentationFromUnknown(message.toolResults),
  };
}

function toolResultLabelKey(toolName: string) {
  if (['find_products'].includes(toolName)) return 'catalog';
  if (['find_brands', 'find_categories'].includes(toolName)) return 'taxonomy';
  if (toolName === 'inspect_orders') return 'orders';
  if (toolName === 'inspect_inventory') return 'inventory';
  if (toolName === 'inspect_assets') return 'assets';
  if (toolName === 'inspect_ai_proposals' || toolName.startsWith('propose_')) return 'proposals';
  if (toolName === 'inspect_bulletin') return 'bulletin';
  if (toolName === 'inspect_administration') return 'administration';
  if (toolName.includes('background_job')) return 'background';
  if (toolName.includes('content')) return 'content';
  if (toolName.includes('categor')) return 'categorization';
  if (toolName.startsWith('suggest_')) return 'proposals';
  return 'result';
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

function adminAiNoticeText(value: unknown) {
  if (isAdminAiScalar(value)) return queryLabel(String(value ?? ''));
  const entries = adminAiScalarEntries(value, 5);
  return entries.map(([key, child]) => `${queryLabel(key)}: ${String(child ?? '—')}`).join(' · ');
}

function AnalyticsCard({ result }: { result: AnalyticsResult }) {
  const t = useTranslations();
  const locale = useLocale();
  const displayValue = (value: unknown, unit?: string) =>
    displayAdminAiValue(value, locale, t('aiChat.yes'), t('aiChat.no'), unit);

  const data = result.data;
  const metrics = adminAiMetricsFromUnknown(data).slice(0, 8);
  const analyticsTables = adminAiResultTables(data).filter(
    (table) => !table.path.endsWith('metrics'),
  );
  const [primaryTable] = analyticsTables;
  const rows = primaryTable?.rows ?? [];
  const summary = metrics.length === 0 ? adminAiScalarEntries(data, 8) : [];
  const allColumns = primaryTable?.columns ?? [];
  const labelKey = allColumns.find((key) =>
    ['title', 'name', 'promoCode', 'sku', 'risk'].includes(key),
  );
  const valueKey = selectAnalyticsChartMetric(rows, allColumns);
  const chartRows = valueKey
    ? rows.map((row) => ({ ...row, __chartValue: finiteNumber(row[valueKey]) ?? 0 }))
    : [];

  return (
    <section className="mt-4 overflow-hidden rounded-[1.15rem] border border-border/60 bg-card shadow-[var(--shadow-vapor)]">
      <div className="border-b border-border/60 bg-secondary/35 px-4 py-3">
        <p className="text-xs font-semibold capitalize text-foreground">
          {queryLabel(result.view ?? result.query)}
        </p>
        {result.filters?.startDate || result.filters?.endDate ? (
          <p className="mt-1 text-[0.68rem] text-muted-foreground">
            {result.filters.startDate ?? '…'}–{result.filters.endDate ?? '…'}
          </p>
        ) : null}
        {result.definition ? (
          <p className="mt-1 text-[0.68rem] leading-5 text-muted-foreground">{result.definition}</p>
        ) : null}
      </div>
      {metrics.length ? (
        <div className="grid grid-cols-2 gap-px bg-border/50 sm:grid-cols-4">
          {metrics.map((metric) => (
            <div key={metric.key} className="bg-card px-3 py-3">
              <p className="truncate text-[0.66rem] capitalize text-muted-foreground">
                {queryLabel(metric.key)}
              </p>
              <p className="mt-1 text-sm font-semibold text-foreground">
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
            </div>
          ))}
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
        <div key={table.path} className="overflow-x-auto border-t border-border/50 px-3 pb-3">
          <div className="flex items-center justify-between gap-3 px-2 pb-1 pt-3 text-[0.68rem] text-muted-foreground">
            <p className="font-medium capitalize">{queryLabel(table.path)}</p>
            {table.available > table.rows.length ? (
              <p>
                {t('aiChat.showingRows', {
                  shown: table.rows.length,
                  available: table.available,
                })}
              </p>
            ) : null}
          </div>
          <table className="w-full min-w-[28rem] text-start text-xs">
            <thead>
              <tr className="text-muted-foreground">
                {table.columns.map((column) => (
                  <th key={column} className="border-b px-2 py-2 font-medium capitalize">
                    {queryLabel(column)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, index) => (
                <tr key={index}>
                  {table.columns.map((column) => (
                    <td key={column} className="border-b border-border/45 px-2 py-2">
                      {displayValue(row[column])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
              </span>
            ))}
          </div>
        </div>
      ) : null}
      {result.warnings?.length || result.truncations?.length ? (
        <div className="space-y-1 border-t border-border/50 px-4 py-3 text-[0.68rem] leading-5 text-amber-700 dark:text-amber-300">
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
    </section>
  );
}

function StructuredToolResultCard({ result }: { result: AdminAiToolResult }) {
  const t = useTranslations();
  const locale = useLocale();
  const displayValue = (value: unknown) =>
    displayAdminAiValue(value, locale, t('aiChat.yes'), t('aiChat.no'));
  const summary = adminAiScalarEntries(result.output, 10);
  const tables = adminAiResultTables(result.output);
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
          {t(`aiChat.toolLabels.${toolResultLabelKey(result.toolName)}`)}
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
        <div key={table.path} className="overflow-x-auto border-t border-border/50 px-3 pb-3">
          <div className="flex items-center justify-between gap-3 px-2 pb-1 pt-3 text-[0.68rem] text-muted-foreground">
            <p className="font-medium capitalize">{queryLabel(table.path)}</p>
            {table.available > table.rows.length ? (
              <p>
                {t('aiChat.showingRows', {
                  shown: table.rows.length,
                  available: table.available,
                })}
              </p>
            ) : null}
          </div>
          <table className="w-full min-w-[28rem] text-start text-xs">
            <thead>
              <tr className="text-muted-foreground">
                {table.columns.map((column) => (
                  <th key={column} className="border-b px-2 py-2 font-medium capitalize">
                    {queryLabel(column)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, index) => (
                <tr key={index}>
                  {table.columns.map((column) => (
                    <td
                      key={column}
                      className="max-w-48 border-b border-border/45 px-2 py-2 [overflow-wrap:anywhere]"
                    >
                      {displayValue(row[column])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      {!error && summary.length === 0 && tables.length === 0 ? (
        <p className="px-4 py-3 text-xs text-muted-foreground">{t('aiChat.noToolData')}</p>
      ) : null}
    </section>
  );
}

function ChatSidebar({
  conversations,
  selectedConversationId,
  loading,
  jobs,
  cancellingJobId,
  search,
  onNewChat,
  onSearchChange,
  onSelectConversation,
  onRenameConversation,
  onDeleteConversation,
  onCancelJob,
}: {
  conversations: ConversationSummary[];
  selectedConversationId: number | null;
  loading: boolean;
  jobs: AiJob[];
  cancellingJobId: string | null;
  search: string;
  onNewChat: () => void;
  onSearchChange: (value: string) => void;
  onSelectConversation: (conversation: ConversationSummary) => void;
  onRenameConversation: (conversation: ConversationSummary, title: string) => Promise<boolean>;
  onDeleteConversation: (conversation: ConversationSummary) => void;
  onCancelJob: (job: AiJob) => void;
}) {
  const t = useTranslations();
  const [jobIndex, setJobIndex] = useState(0);
  const [editingConversationId, setEditingConversationId] = useState<number | null>(null);
  const [titleDraft, setTitleDraft] = useState('');
  const boundedJobIndex = Math.min(jobIndex, Math.max(0, jobs.length - 1));
  const selectedJob = jobs[boundedJobIndex];

  return (
    <aside
      className="flex min-h-0 flex-col border-t border-border/60 bg-secondary/20 lg:border-s lg:border-t-0"
      aria-label={t('aiChat.chats')}
    >
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-4 sm:px-5">
        <h3 className="text-sm font-semibold">{t('aiChat.chats')}</h3>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="shrink-0 normal-case tracking-normal"
          onClick={onNewChat}
        >
          <MessageSquarePlus className="size-3.5" />
          {t('aiChat.newChat')}
        </Button>
      </div>
      <div className="relative border-b border-border/60 px-3 py-2 sm:px-4">
        <Search className="pointer-events-none absolute start-6 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground sm:start-7" />
        <Input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          className="h-9 ps-8 text-xs"
          aria-label={t('aiChat.searchChats')}
          placeholder={t('aiChat.searchChats')}
        />
      </div>
      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-3 sm:p-4">
        {loading ? (
          <div
            className="flex items-center gap-2 rounded-lg bg-card px-3 py-3 text-xs text-muted-foreground"
            role="status"
          >
            <Spinner className="size-3.5" />
            {t('aiChat.loadingChats')}
          </div>
        ) : (
          <>
            {conversations.map((conversation) => {
              const title = conversation.title || t('aiChat.untitledChat');
              if (editingConversationId === conversation.id)
                return (
                  <form
                    key={conversation.id}
                    className="flex items-center gap-1 rounded-lg bg-card p-1"
                    onSubmit={async (event) => {
                      event.preventDefault();
                      if (await onRenameConversation(conversation, titleDraft))
                        setEditingConversationId(null);
                    }}
                  >
                    <Input
                      autoFocus
                      value={titleDraft}
                      onChange={(event) => setTitleDraft(event.target.value)}
                      maxLength={80}
                      className="h-8 min-w-0 flex-1 text-xs"
                      aria-label={t('aiChat.renameChat')}
                    />
                    <Button
                      type="submit"
                      size="sm"
                      variant="ghost"
                      className="size-8 p-0"
                      disabled={!titleDraft.trim()}
                      aria-label={t('aiChat.saveChatTitle')}
                    >
                      <Check className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="size-8 p-0"
                      onClick={() => setEditingConversationId(null)}
                      aria-label={t('aiChat.cancelChatRename')}
                    >
                      <X className="size-3.5" />
                    </Button>
                  </form>
                );
              return (
                <div
                  key={conversation.id}
                  className={
                    selectedConversationId === conversation.id
                      ? 'group flex items-center rounded-lg bg-primary text-primary-foreground'
                      : 'group flex items-center rounded-lg bg-card text-foreground hover:bg-secondary'
                  }
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate px-3 py-2 text-start text-xs font-medium"
                    onClick={() => onSelectConversation(conversation)}
                  >
                    {title}
                  </button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="size-8 shrink-0 p-0 opacity-70 hover:opacity-100"
                    onClick={() => {
                      setTitleDraft(title);
                      setEditingConversationId(conversation.id);
                    }}
                    aria-label={`${t('aiChat.renameChat')} ${title}`}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="me-1 size-8 shrink-0 p-0 opacity-70 hover:opacity-100"
                    onClick={() => onDeleteConversation(conversation)}
                    aria-label={`${t('aiChat.deleteChat')} ${title}`}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              );
            })}
            {conversations.length === 0 ? (
              <p className="px-1 py-2 text-xs text-muted-foreground">
                {search ? t('aiChat.noMatchingChats') : t('aiChat.noChats')}
              </p>
            ) : null}
          </>
        )}
      </div>
      {jobs.length > 0 ? (
        <div className="border-t border-border/60 p-3 sm:p-4">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-xs font-semibold text-foreground">{t('aiChat.backgroundJobs')}</p>
            {jobs.length > 1 ? (
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="size-7 p-0"
                  onClick={() =>
                    setJobIndex((current) => (current - 1 + jobs.length) % jobs.length)
                  }
                  aria-label={t('aiChat.previousJob')}
                >
                  <ChevronLeft className="size-3.5 rtl:rotate-180" />
                </Button>
                <span className="min-w-8 text-center text-[0.68rem] tabular-nums text-muted-foreground">
                  {boundedJobIndex + 1}/{jobs.length}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="size-7 p-0"
                  onClick={() => setJobIndex((current) => (current + 1) % jobs.length)}
                  aria-label={t('aiChat.nextJob')}
                >
                  <ChevronRight className="size-3.5 rtl:rotate-180" />
                </Button>
              </div>
            ) : null}
          </div>
          {selectedJob
            ? (() => {
                const job = selectedJob;
                const active = job.status === 'queued' || job.status === 'running';
                const summary = job.resultSummary ?? {};
                const summaryEntries = Object.entries(summary)
                  .filter((entry): entry is [string, string | number | boolean | null] =>
                    isAdminAiScalar(entry[1]),
                  )
                  .slice(0, 6);
                const labelKey = ADMIN_AI_JOB_LABEL_KEYS[job.type ?? job.kind];
                return (
                  <div className="relative pb-2">
                    {jobs.length > 2 ? (
                      <div
                        className="absolute inset-x-4 bottom-0 top-4 rounded-xl border border-border/30 bg-card/35"
                        aria-hidden="true"
                      />
                    ) : null}
                    {jobs.length > 1 ? (
                      <div
                        className="absolute inset-x-2 bottom-1 top-2 rounded-xl border border-border/45 bg-card/65"
                        aria-hidden="true"
                      />
                    ) : null}
                    <section
                      key={`${job.queue}:${job.id}`}
                      className="relative rounded-xl border border-border/60 bg-card p-3 shadow-[var(--shadow-vapor)]"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-medium">
                            {labelKey ? t(`aiChat.jobLabels.${labelKey}`) : queryLabel(job.kind)}
                          </p>
                          <p className="mt-0.5 text-[0.68rem] text-muted-foreground">
                            {t(`aiChat.jobStatus.${job.status}`)}
                          </p>
                        </div>
                        {active && job.cancellable !== false ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={cancellingJobId !== null}
                            onClick={() => onCancelJob(job)}
                          >
                            {cancellingJobId === job.id ? <Spinner className="size-3.5" /> : null}
                            {t('aiChat.cancel')}
                          </Button>
                        ) : null}
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
                        <div
                          className="h-full rounded-full bg-primary transition-[width]"
                          style={{
                            width: `${Math.max(0, Math.min(job.progress.percentage, 100))}%`,
                          }}
                        />
                      </div>
                      <p className="mt-1.5 text-[0.68rem] text-muted-foreground">
                        {job.progress.current}/{job.progress.total || '—'} ·{' '}
                        {job.progress.phase.replaceAll('-', ' ')}
                      </p>
                      {job.kind === 'ai-product-categorization' &&
                      Object.keys(summary).length > 0 ? (
                        <p className="mt-2 text-[0.68rem] leading-5 text-muted-foreground">
                          {t('aiChat.categorizationSummary', {
                            proposed: Number(summary.proposed ?? 0),
                            applied: Number(summary.applied ?? 0),
                            unchanged: Number(summary.unchanged ?? 0),
                            ambiguous: Number(summary.ambiguous ?? 0),
                            failed: Number(summary.failed ?? 0),
                          })}
                        </p>
                      ) : null}
                      {job.kind !== 'ai-product-categorization' && summaryEntries.length > 0 ? (
                        <p className="mt-2 text-[0.68rem] leading-5 text-muted-foreground">
                          {summaryEntries
                            .map(([key, value]) => `${queryLabel(key)}: ${String(value ?? '—')}`)
                            .join(' · ')}
                        </p>
                      ) : null}
                      {Number(summary.autoApplyFailed ?? 0) > 0 ? (
                        <p className="mt-2 text-[0.68rem] leading-5 text-amber-700 dark:text-amber-300">
                          {t('aiChat.autoApplyFailed', {
                            count: Number(summary.autoApplyFailed),
                          })}
                        </p>
                      ) : null}
                      {job.errorMessage ? (
                        <p className="mt-2 text-[0.68rem] text-destructive">{job.errorMessage}</p>
                      ) : null}
                    </section>
                  </div>
                );
              })()
            : null}
        </div>
      ) : null}
    </aside>
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
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState(false);
  const [receivingText, setReceivingText] = useState(false);
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
  const conversationKeyRef = useRef<string | null>(null);
  const activeConversationRef = useRef<ConversationSummary | null>(null);
  const conversationRequestRef = useRef(0);
  const autoAcceptProposalsRef = useRef(false);
  const responseAbortRef = useRef<AbortController | null>(null);
  const terminalJobIdsRef = useRef(new Set<string>());
  const messagesEndRef = useRef<HTMLDivElement>(null);
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
    const hasNewTerminalJob = terminalJobs.some((job) => !terminalJobIdsRef.current.has(job.id));
    terminalJobIdsRef.current = new Set(terminalJobs.map((job) => job.id));
    const activeConversation = activeConversationRef.current;
    if (hasNewTerminalJob && activeConversation) {
      window.setTimeout(() => {
        if (activeConversationRef.current?.id === activeConversation.id)
          void selectConversation(activeConversation);
      }, 750);
    }
  }, [selectConversation]);

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
    void loadAiHistory();
    const interval = window.setInterval(() => void loadAiHistory(), 2_500);
    return () => window.clearInterval(interval);
  }, [deferredConversationSearch, open, loadAiHistory, loadConversations, selectConversation]);

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
    const assistantId = crypto.randomUUID();
    const abortController = new AbortController();
    responseAbortRef.current = abortController;
    let receivedText = false;
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
      });
      await loadConversations();
      await loadAiHistory();
    } catch {
      if (!abortController.signal.aborted && !receivedText) {
        setMessages((items) => [
          ...items,
          { id: assistantId, role: 'assistant', content: t('aiChat.error') },
        ]);
      }
    } finally {
      if (responseAbortRef.current === abortController) responseAbortRef.current = null;
      setPending(false);
      setReceivingText(false);
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

          <div className="grid min-h-0 flex-1 grid-rows-[minmax(25rem,1fr)_minmax(14rem,0.55fr)] lg:grid-cols-[minmax(0,1fr)_22rem] lg:grid-rows-1">
            <section
              className="flex min-h-0 flex-col bg-background/45"
              aria-label={t('aiChat.conversation')}
            >
              <div
                className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-5 sm:py-5"
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
                                />
                              ))
                            : null}
                          {message.role === 'assistant'
                            ? message.results?.map((result, resultIndex) => (
                                <StructuredToolResultCard
                                  key={`${result.toolName}-${resultIndex}`}
                                  result={result}
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
                        <span className="flex items-center gap-2 rounded-full bg-card px-3 py-2 shadow-[var(--shadow-vapor)]">
                          <Spinner className="size-3.5" />
                          {t('aiChat.thinking')}
                        </span>
                      </div>
                    ) : null}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>

              <div className="shrink-0 border-t border-border/60 bg-card/80 p-3 backdrop-blur-xl sm:p-4">
                <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-[1.15rem] border border-border/70 bg-background p-2 shadow-[var(--shadow-vapor)] focus-within:border-primary/35 focus-within:ring-2 focus-within:ring-primary/10">
                  <Textarea
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
                    className="min-h-12 max-h-32 resize-none border-0 bg-transparent px-2 py-2 shadow-none focus-visible:bg-transparent focus-visible:ring-0"
                  />
                  {pending ? (
                    <Button
                      type="button"
                      variant="destructive"
                      className="size-10 shrink-0 rounded-[0.85rem] p-0"
                      onClick={cancelResponse}
                      aria-label={t('aiChat.stopResponse')}
                    >
                      <X className="size-4" />
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      className="size-10 shrink-0 rounded-[0.85rem] p-0"
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
              conversations={conversations}
              selectedConversationId={selectedConversationId}
              loading={loadingConversations}
              jobs={jobs}
              cancellingJobId={cancellingJobId}
              search={conversationSearch}
              onNewChat={newChat}
              onSearchChange={setConversationSearch}
              onSelectConversation={(conversation) => void selectConversation(conversation)}
              onRenameConversation={renameConversation}
              onDeleteConversation={(conversation) => void deleteConversation(conversation)}
              onCancelJob={(job) => void cancelJob(job)}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
