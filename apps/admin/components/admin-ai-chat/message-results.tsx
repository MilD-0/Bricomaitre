'use client';

import {
  ArrowUpRight,
  Check,
  Pencil,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';

import type { AdminAiChatStatus } from '../../lib/admin-ai-chat-stream';
import {
  adminAiEvidenceToolResults,
  adminAiPresentationFromToolResults,
  type AdminAiPresentationPlan,
} from '../../lib/admin-ai-presentation';
import {
  adminAiToolActivityKey,
  adminAiToolMutatesApplication,
  adminAiToolPresentation,
} from '../../lib/admin-ai-tool-presentation';
import {
  adminAiResultTables,
  adminAiScalarEntries,
  isAdminAiScalar,
  type AdminAiToolResult,
} from '../../lib/admin-ai-result-view';
import { notifyAdminAiMutation } from '../../lib/admin-ai-events';
import { Button } from '../ui/button';
import { Spinner } from '../ui/spinner';
import { AdminAiResultTable } from './result-table';

export type Proposal = { id: number; status: 'proposed' | 'applied' | 'rejected' };
export type ChatMessage = {
  id?: string;
  messageRecordId?: number;
  role: 'user' | 'assistant';
  content: string;
  feedback?: 'helpful' | 'not_helpful';
  proposals?: Proposal[];
  results?: AdminAiToolResult[];
  evidence?: AdminAiToolResult[];
  presentation?: AdminAiPresentationPlan | null;
  terminal?: boolean;
  jobId?: string;
};
export type ProposalNextAction = 'refresh' | 'regenerate' | 'review' | 'retry';

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

export function queryLabel(value: string | undefined) {
  return (
    value
      ?.replaceAll('_', ' ')
      .replaceAll('.', ' · ')
      .replace(/([a-z\d])([A-Z])/g, '$1 $2')
      .toLowerCase() ?? ''
  );
}

export function presentationFromUnknown(value: unknown) {
  const evidence = adminAiEvidenceToolResults(value);
  return {
    proposals: [
      ...new Map(proposalsFromUnknown(value).map((proposal) => [proposal.id, proposal])).values(),
    ],
    evidence,
    presentation: adminAiPresentationFromToolResults(value),
    results: evidence.filter(
      (result) =>
        result.toolName !== 'query_analytics' &&
        result.toolName !== 'query_ai_stats' &&
        (adminAiToolMutatesApplication(result.toolName) ||
          result.toolName === 'ecotrack_posting_terminal'),
    ),
  };
}

export function notifyAdminAiToolMutations(results: readonly AdminAiToolResult[]) {
  notifyAdminAiMutation(
    results
      .map((result) => result.toolName)
      .filter((toolName) => adminAiToolMutatesApplication(toolName)),
  );
}

export function hydrateChatMessage(
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

export function AdminAiActivity({ status }: { status: AdminAiChatStatus | null }) {
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

export function StructuredToolResultCard({
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
  const ecotrackTerminal = ecotrackTerminalPresentation(result.toolName, result.output);
  const summary = ecotrackTerminal ? [] : adminAiScalarEntries(result.output, 10);
  const tables = ecotrackTerminal ? [] : adminAiResultTables(result.output);
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
      {!error && !ecotrackTerminal && summary.length === 0 && tables.length === 0 ? (
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
