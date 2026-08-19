'use client';

import {
  Bot,
  Check,
  ChevronLeft,
  ChevronRight,
  MessageSquarePlus,
  Send,
  Sparkles,
  X,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
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

type AnalyticsResult = {
  query?: string;
  source?: string;
  definition?: string;
  data?: unknown;
  caveats?: string[];
  comparison?: boolean;
  currentPeriod?: { startDate: string; endDate: string; data: unknown };
  previousPeriod?: { startDate: string; endDate: string; data: unknown };
  deltas?: Record<
    string,
    { current: number; previous: number; absolute: number; percent: number | null }
  >;
};
type Proposal = { id: number; status: 'proposed' | 'applied' | 'rejected' };
type ChatMessage = {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  analytics?: AnalyticsResult[];
  proposals?: Proposal[];
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
const ADMIN_AI_VISIBLE_JOB_KINDS = new Set(['ai-product-categorization', 'ai-product-content']);

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

function isScalar(value: unknown): value is string | number | boolean | null {
  return value == null || ['string', 'number', 'boolean'].includes(typeof value);
}

function resultFromUnknown(value: unknown, depth = 0): AnalyticsResult[] {
  if (depth > 5 || value == null) return [];
  if (Array.isArray(value)) return value.flatMap((item) => resultFromUnknown(item, depth + 1));
  if (typeof value !== 'object') return [];
  const item = value as Record<string, unknown>;
  return [
    ...(typeof item.query === 'string' && ('data' in item || item.comparison === true)
      ? [item as AnalyticsResult]
      : []),
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
  return value?.replaceAll('_', ' ') ?? '';
}

function AnalyticsCard({ result }: { result: AnalyticsResult }) {
  const t = useTranslations();
  const locale = useLocale();
  const displayValue = (value: unknown) => {
    if (typeof value === 'number')
      return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
    if (value == null) return '—';
    if (typeof value === 'boolean') return value ? t('aiChat.yes') : t('aiChat.no');
    return String(value);
  };

  if (result.comparison && result.currentPeriod && result.previousPeriod && result.deltas) {
    const rows = Object.entries(result.deltas).slice(0, 8);
    return (
      <section className="mt-4 overflow-hidden rounded-[1.15rem] border border-border/60 bg-card shadow-[var(--shadow-vapor)]">
        <div className="border-b border-border/60 bg-secondary/35 px-4 py-3">
          <p className="text-xs font-semibold capitalize text-foreground">
            {queryLabel(result.query)}
          </p>
          <p className="mt-1 text-[0.68rem] text-muted-foreground">
            {result.currentPeriod.startDate}–{result.currentPeriod.endDate} {t('aiChat.vs')}{' '}
            {result.previousPeriod.startDate}–{result.previousPeriod.endDate}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-px bg-border/50 sm:grid-cols-4">
          {rows.map(([key, delta]) => (
            <div key={key} className="bg-card px-3 py-3">
              <p className="truncate text-[0.66rem] text-muted-foreground">{queryLabel(key)}</p>
              <p className="mt-1 text-sm font-semibold text-foreground">
                {displayValue(delta.current)}
              </p>
              <p
                className={
                  delta.absolute >= 0
                    ? 'mt-0.5 text-[0.68rem] font-medium text-emerald-600'
                    : 'mt-0.5 text-[0.68rem] font-medium text-destructive'
                }
              >
                {delta.percent == null
                  ? '—'
                  : `${delta.percent >= 0 ? '+' : ''}${(delta.percent * 100).toFixed(1)}%`}
              </p>
            </div>
          ))}
        </div>
        <div className="overflow-x-auto px-3 pb-3 pt-2">
          <table className="w-full min-w-[30rem] text-start text-xs">
            <thead>
              <tr className="text-muted-foreground">
                <th className="border-b px-2 py-2 font-medium">{t('aiChat.metric')}</th>
                <th className="border-b px-2 py-2 font-medium">{t('aiChat.current')}</th>
                <th className="border-b px-2 py-2 font-medium">{t('aiChat.previous')}</th>
                <th className="border-b px-2 py-2 font-medium">{t('aiChat.change')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([key, delta]) => (
                <tr key={key}>
                  <td className="border-b border-border/45 px-2 py-2 font-medium capitalize">
                    {queryLabel(key)}
                  </td>
                  <td className="border-b border-border/45 px-2 py-2">
                    {displayValue(delta.current)}
                  </td>
                  <td className="border-b border-border/45 px-2 py-2">
                    {displayValue(delta.previous)}
                  </td>
                  <td
                    className={
                      delta.absolute >= 0
                        ? 'border-b border-border/45 px-2 py-2 text-emerald-600'
                        : 'border-b border-border/45 px-2 py-2 text-destructive'
                    }
                  >
                    {displayValue(delta.absolute)} (
                    {delta.percent == null ? '—' : `${(delta.percent * 100).toFixed(1)}%`})
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {result.caveats?.length ? (
          <p className="border-t border-border/50 px-4 py-3 text-[0.68rem] leading-5 text-muted-foreground">
            {result.caveats[0]}
          </p>
        ) : null}
      </section>
    );
  }

  const data = result.data;
  const rows = Array.isArray(data)
    ? data
        .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object')
        .slice(0, 10)
    : [];
  const summary =
    !Array.isArray(data) && data && typeof data === 'object'
      ? Object.entries(data as Record<string, unknown>)
          .filter(([, value]) => isScalar(value))
          .slice(0, 10)
      : [];
  const allColumns = rows.length
    ? Object.keys(rows[0]).filter((key) => rows.some((row) => isScalar(row[key])))
    : [];
  const columns = allColumns.slice(0, 8);
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
          {queryLabel(result.query)}
        </p>
        {result.definition ? (
          <p className="mt-1 text-[0.68rem] leading-5 text-muted-foreground">{result.definition}</p>
        ) : null}
      </div>
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
      {rows.length ? (
        <div className="overflow-x-auto px-3 pb-3">
          <table className="w-full min-w-[28rem] text-start text-xs">
            <thead>
              <tr className="text-muted-foreground">
                {columns.map((column) => (
                  <th key={column} className="border-b px-2 py-2 font-medium capitalize">
                    {queryLabel(column)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index}>
                  {columns.map((column) => (
                    <td key={column} className="border-b border-border/45 px-2 py-2">
                      {displayValue(row[column])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {result.caveats?.length ? (
        <p className="border-t border-border/50 px-4 py-3 text-[0.68rem] leading-5 text-muted-foreground">
          {result.caveats[0]}
        </p>
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
  onNewChat,
  onSelectConversation,
  onCancelJob,
}: {
  conversations: ConversationSummary[];
  selectedConversationId: number | null;
  loading: boolean;
  jobs: AiJob[];
  cancellingJobId: string | null;
  onNewChat: () => void;
  onSelectConversation: (conversation: ConversationSummary) => void;
  onCancelJob: (job: AiJob) => void;
}) {
  const t = useTranslations();
  const [jobIndex, setJobIndex] = useState(0);
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
            {conversations.map((conversation) => (
              <button
                key={conversation.id}
                type="button"
                className={
                  selectedConversationId === conversation.id
                    ? 'w-full truncate rounded-lg bg-primary px-3 py-2 text-start text-xs font-medium text-primary-foreground'
                    : 'w-full truncate rounded-lg bg-card px-3 py-2 text-start text-xs text-foreground hover:bg-secondary'
                }
                onClick={() => onSelectConversation(conversation)}
              >
                {conversation.title || t('aiChat.untitledChat')}
              </button>
            ))}
            {conversations.length === 0 ? (
              <p className="px-1 py-2 text-xs text-muted-foreground">{t('aiChat.noChats')}</p>
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
                            {job.kind === 'ai-product-categorization'
                              ? t('aiChat.categorizationJob')
                              : job.kind === 'ai-product-content'
                                ? t('aiChat.contentJob')
                                : queryLabel(job.kind)}
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

export function AdminAiChat() {
  const t = useTranslations();
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
  } | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
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
      const data = (await response.json()) as { messages: ChatMessage[] };
      setMessages(data.messages);
      setInput('');
    } finally {
      if (requestId === conversationRequestRef.current) setLoadingConversation(false);
    }
  }, []);
  const loadConversations = useCallback(
    async (selectLatest = false) => {
      setLoadingConversations(true);
      try {
        const response = await fetch('/api/ai/conversations', { cache: 'no-store' });
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
    [selectConversation],
  );
  const loadAiHistory = useCallback(async () => {
    const response = await fetch('/api/ai/history', { cache: 'no-store' });
    if (!response.ok) return;
    const data = (await response.json()) as { jobs?: AiJob[] };
    const nextJobs = Array.isArray(data.jobs)
      ? data.jobs.filter((job) => ADMIN_AI_VISIBLE_JOB_KINDS.has(job.kind))
      : [];
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
    void loadConversations(activeConversationRef.current === null);
    void loadAiHistory();
    const interval = window.setInterval(() => void loadAiHistory(), 2_500);
    return () => window.clearInterval(interval);
  }, [open, loadAiHistory, loadConversations, selectConversation]);

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
        proposal?: { status?: Proposal['status']; verified?: boolean };
      };
      if (!response.ok || !data.proposal?.status)
        throw new Error(data.error ?? 'Proposal review failed.');
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
          const analytics = resultFromUnknown(data.toolResults);
          const proposals = [
            ...new Map(
              proposalsFromUnknown(data.toolResults).map((proposal) => [proposal.id, proposal]),
            ).values(),
          ];
          setMessages((items) => {
            const existing = items.findIndex((item) => item.id === assistantId);
            if (existing < 0)
              return [
                ...items,
                {
                  id: assistantId,
                  role: 'assistant',
                  content: t('aiChat.completed'),
                  analytics,
                  proposals,
                },
              ];
            return items.map((item, index) =>
              index === existing ? { ...item, analytics, proposals } : item,
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
        className="group fixed bottom-[5.5rem] end-4 z-30 size-12 rounded-[1rem] p-0 shadow-[var(--shadow-vapor-strong)] sm:bottom-6 sm:end-6 sm:h-12 sm:w-auto sm:px-4"
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
                        {t('aiChat.examples')}
                      </p>
                      <div className="mt-5 flex flex-wrap justify-center gap-2">
                        <span className="rounded-full border border-border/60 bg-card px-3 py-1.5 text-[0.68rem] text-muted-foreground">
                          {t('aiChat.capabilityCatalog')}
                        </span>
                        <span className="rounded-full border border-border/60 bg-card px-3 py-1.5 text-[0.68rem] text-muted-foreground">
                          {t('aiChat.capabilityAnalytics')}
                        </span>
                        <span className="rounded-full border border-border/60 bg-card px-3 py-1.5 text-[0.68rem] text-muted-foreground">
                          {t('aiChat.capabilityPricing')}
                        </span>
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
                            <p className="mt-3 text-xs text-destructive" role="alert">
                              {proposalReviewError.message}
                            </p>
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
                    placeholder={t('aiChat.placeholder')}
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
              onNewChat={newChat}
              onSelectConversation={(conversation) => void selectConversation(conversation)}
              onCancelJob={(job) => void cancelJob(job)}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
