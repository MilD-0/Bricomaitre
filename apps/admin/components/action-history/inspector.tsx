'use client';
import { ChevronDown, CirclePlus, PencilLine, RotateCcw, RotateCw, Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';
import {
  dayKey,
  type HistoryDetailItem,
  type HistoryDetailResponse,
  type HistoryListItem,
  type HistoryPreview,
} from './contract';

export function formatDay(value: string, locale: string, t: ReturnType<typeof useTranslations>) {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (dayKey(value) === dayKey(today.toISOString())) return t('history.today');
  if (dayKey(value) === dayKey(yesterday.toISOString())) return t('history.yesterday');
  return new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric',
  }).format(date);
}

function fieldLabel(
  t: ReturnType<typeof useTranslations>,
  change: Pick<HistoryPreview, 'key' | 'kind' | 'field'>,
) {
  const messageKey =
    change.kind === 'group'
      ? `history.summaryGroups.${change.key}`
      : `history.fields.${change.key}`;
  return t.has(messageKey) ? t(messageKey) : change.field;
}

export function eventSummary(item: HistoryListItem, t: ReturnType<typeof useTranslations>) {
  if (item.operation === 'create') return t('history.summaries.created');
  if (item.operation === 'delete') return t('history.summaries.deleted');
  const labels = item.changePreview.map((change) => fieldLabel(t, change));
  if (labels.length === 0) return t('history.summaries.updated');
  const remaining = Math.max(0, item.semanticChangeCount - labels.length);
  return remaining > 0
    ? t('history.summaries.fieldsAndMore', { fields: labels.join(', '), count: remaining })
    : t('history.summaries.fields', { fields: labels.join(', ') });
}

export function operationIcon(operation: HistoryListItem['operation']) {
  if (operation === 'create') return CirclePlus;
  if (operation === 'delete') return Trash2;
  return PencilLine;
}

function valueSummary(t: ReturnType<typeof useTranslations>, value: unknown) {
  if (value == null || value === '') return t('history.noValue');
  if (typeof value === 'boolean')
    return t(value ? 'history.boolean.true' : 'history.boolean.false');
  if (Array.isArray(value)) return t('history.details.arraySummary', { count: value.length });
  if (typeof value === 'object')
    return t('history.details.objectSummary', { count: Object.keys(value).length });
  return String(value);
}

function HistoryValue({ value }: { value: unknown }) {
  const t = useTranslations();
  const summary = valueSummary(t, value);
  if (typeof value === 'string' && value.length > 160) {
    return (
      <details className="group text-sm">
        <summary className="cursor-pointer list-none text-foreground hover:text-primary">
          {value.slice(0, 120)}…{' '}
          <ChevronDown className="ms-1 inline size-3.5 transition-transform group-open:rotate-180" />
        </summary>
        <p className="mt-2 whitespace-pre-wrap rounded-lg bg-muted/45 p-3 text-xs leading-5 text-muted-foreground">
          {value}
        </p>
      </details>
    );
  }
  if (value == null || typeof value !== 'object') {
    return <span className="wrap-break-word text-sm text-foreground">{summary}</span>;
  }
  return (
    <details className="group text-sm">
      <summary className="cursor-pointer list-none text-foreground hover:text-primary">
        {summary}{' '}
        <ChevronDown className="ms-1 inline size-3.5 transition-transform group-open:rotate-180" />
      </summary>
      <pre className="mt-2 max-h-52 overflow-auto whitespace-pre-wrap rounded-lg bg-muted/45 p-3 text-xs leading-5 text-muted-foreground">
        {JSON.stringify(value, null, 2)}
      </pre>
    </details>
  );
}

export function HistoryInspector({
  detail,
  loading,
  error,
  onRetry,
  onRecover,
  compact = false,
}: {
  detail: HistoryDetailResponse | undefined;
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
  onRecover: (direction: 'undo' | 'redo', item: HistoryDetailItem) => void;
  compact?: boolean;
}) {
  const t = useTranslations();
  const locale = useLocale();
  if (error) {
    return (
      <div role="alert" className="space-y-3 p-5 text-sm">
        <p>{error.message}</p>
        <Button type="button" variant="outline" disabled={loading} onClick={onRetry}>
          {t('actions.retry')}
        </Button>
      </div>
    );
  }
  if (loading && !detail) {
    return (
      <div className="animate-pulse space-y-5 p-5 sm:p-6">
        <div className="h-7 w-2/3 rounded bg-muted" />
        <div className="h-4 w-full rounded bg-muted" />
        <div className="h-32 rounded bg-muted/70" />
      </div>
    );
  }
  if (!detail) {
    return (
      <div className="grid min-h-72 place-items-center px-6 text-center text-sm text-muted-foreground">
        {t('history.details.selectPrompt')}
      </div>
    );
  }

  const { item, recovery } = detail;
  const actor = item.createdByName ?? item.createdBy ?? t('history.systemActor');
  const RecoveryIcon = recovery.nextAction === 'redo' ? RotateCw : RotateCcw;
  return (
    <div className={cn('min-w-0', !compact && 'h-full')}>
      {!compact ? (
        <header className="border-b border-border/60 px-5 py-5 sm:px-6">
          <p className="text-xs font-medium uppercase tracking-[var(--type-tracking-p150)] text-primary">
            {t(`history.operations.${item.operation}`)}
          </p>
          <h3 className="mt-1 text-xl font-semibold tracking-tight text-foreground">
            {item.entityLabel}
          </h3>
        </header>
      ) : null}

      <div className="divide-y divide-border/60">
        <section className="px-5 py-4 sm:px-6">
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted-foreground">{t('history.columns.who')}</dt>
              <dd className="mt-1 font-medium text-foreground">{actor}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t('history.columns.when')}</dt>
              <dd className="mt-1 text-foreground">
                {new Date(item.createdAt).toLocaleString(locale)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t('history.columns.where')}</dt>
              <dd className="mt-1 text-foreground">{t(`history.resources.${item.resource}`)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t('history.details.reference')}</dt>
              <dd className="mt-1 text-foreground">
                {item.entityType} #{item.entityId}
              </dd>
            </div>
          </dl>
          {item.undoneAt || item.redoneAt ? (
            <div className="mt-4 space-y-1 border-t border-border/40 pt-3 text-xs text-muted-foreground">
              {item.undoneAt ? (
                <p>
                  {t('history.details.undoneAt', {
                    value: new Date(item.undoneAt).toLocaleString(locale),
                  })}
                </p>
              ) : null}
              {item.redoneAt ? (
                <p>
                  {t('history.details.redoneAt', {
                    value: new Date(item.redoneAt).toLocaleString(locale),
                  })}
                </p>
              ) : null}
            </div>
          ) : null}
        </section>

        <section className="px-5 py-5 sm:px-6">
          <div className="flex items-baseline justify-between gap-4">
            <h4 className="font-semibold text-foreground">{t('history.details.changesTitle')}</h4>
            <span className="text-xs text-muted-foreground">
              {t('history.details.changesCount', { count: item.changes.length })}
            </span>
          </div>
          {item.changes.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">{t('history.details.noChanges')}</p>
          ) : (
            <div className="mt-3 divide-y divide-border/50 border-y border-border/50">
              {item.changes.map((change) => (
                <div
                  key={`${item.id}-${change.key}`}
                  className="grid gap-3 py-4 lg:grid-cols-[minmax(8rem,0.7fr)_minmax(0,1fr)_minmax(0,1fr)]"
                >
                  <p className="text-sm font-medium text-foreground">
                    {fieldLabel(t, { ...change, kind: 'field' })}
                  </p>
                  <div>
                    <p className="mb-1 text-[length:var(--type-size-compact)] uppercase tracking-wide text-muted-foreground">
                      {t('history.details.columns.before')}
                    </p>
                    <HistoryValue value={change.before} />
                  </div>
                  <div>
                    <p className="mb-1 text-[length:var(--type-size-compact)] uppercase tracking-wide text-muted-foreground">
                      {t('history.details.columns.after')}
                    </p>
                    <HistoryValue value={change.after} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="px-5 py-5 sm:px-6">
          <h4 className="font-semibold text-foreground">{t('history.recovery.title')}</h4>
          {recovery.nextAction ? (
            <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="max-w-xl text-sm text-muted-foreground">
                {t(`history.recovery.${recovery.nextAction}Description`)}
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={() => onRecover(recovery.nextAction!, item)}
              >
                <RecoveryIcon className="size-4" />
                {t(`history.${recovery.nextAction}`)}
              </Button>
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              {t(`history.recovery.blocked.${recovery.blockedReason ?? 'history_out_of_sync'}`)}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
