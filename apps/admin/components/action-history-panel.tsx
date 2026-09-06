'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  CirclePlus,
  History,
  PencilLine,
  RotateCcw,
  RotateCw,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useDeferredValue, useMemo, useState } from 'react';

import { requestJson as request } from '../lib/admin-api';
import { formatRelativeTime } from '../lib/date-format';
import type {
  ActionHistoryPreview,
  ActionHistoryQuery,
  ActionHistoryRecovery,
  toActionHistoryItem,
  toActionHistoryListItem,
} from '../lib/action-history';
import { useAdminAiSurfaceDetails } from './admin-ai-surface-context';
import type { PaginationMeta } from '../lib/pagination';
import { toast } from '../lib/toast';
import { cn } from '../lib/utils';
import { SearchField } from './search-field';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { SurfacePendingOverlay } from './ui/motion';
import { NativeSelect } from './ui/native-select';
import { SidePanel } from './ui/side-panel';
import { Switch } from './ui/switch';
import { WorkspacePagination } from './ui/workspace-pagination';
import { useMediaQuery } from './ui/use-media-query';

type HistoryState = ActionHistoryQuery['state'];
type HistoryOperationFilter = ActionHistoryQuery['operation'];
type HistoryResourceFilter = ActionHistoryQuery['resource'];
type HistoryPreview = ActionHistoryPreview;
type HistoryListItem = ReturnType<typeof toActionHistoryListItem>;
type HistoryDetailItem = ReturnType<typeof toActionHistoryItem>;
type HistoryListResponse = { items: HistoryListItem[]; pagination: PaginationMeta };
type HistoryDetailResponse = { item: HistoryDetailItem; recovery: ActionHistoryRecovery };

const wideLayoutQuery = '(min-width: 1280px)';

function dayKey(value: string) {
  const date = new Date(value);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function formatDay(value: string, locale: string, t: ReturnType<typeof useTranslations>) {
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

function eventSummary(item: HistoryListItem, t: ReturnType<typeof useTranslations>) {
  if (item.operation === 'create') return t('history.summaries.created');
  if (item.operation === 'delete') return t('history.summaries.deleted');
  const labels = item.changePreview.map((change) => fieldLabel(t, change));
  if (labels.length === 0) return t('history.summaries.updated');
  const remaining = Math.max(0, item.semanticChangeCount - labels.length);
  return remaining > 0
    ? t('history.summaries.fieldsAndMore', { fields: labels.join(', '), count: remaining })
    : t('history.summaries.fields', { fields: labels.join(', ') });
}

function operationIcon(operation: HistoryListItem['operation']) {
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

function HistoryInspector({
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

export function ActionHistoryPanel({
  invalidateQueryKeys = [],
  className,
}: {
  invalidateQueryKeys?: Array<readonly unknown[]>;
  className?: string;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const queryClient = useQueryClient();
  const isWideLayout = useMediaQuery(wideLayoutQuery);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [operation, setOperation] = useState<HistoryOperationFilter>('all');
  const [resource, setResource] = useState<HistoryResourceFilter>('all');
  const [state, setState] = useState<HistoryState>('all');
  const [includeEcotrackSync, setIncludeEcotrackSync] = useState(false);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [mobileInspectorOpen, setMobileInspectorOpen] = useState(false);
  const [pendingRecovery, setPendingRecovery] = useState<{
    direction: 'undo' | 'redo';
    item: HistoryDetailItem;
  } | null>(null);
  const deferredSearch = useDeferredValue(search.trim());
  const historyQuery = useQuery({
    queryKey: [
      'action-history',
      page,
      deferredSearch,
      operation,
      resource,
      state,
      includeEcotrackSync,
      sortDirection,
    ],
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: '20',
        search: deferredSearch,
        operation,
        resource,
        state,
        includeEcotrackSync: String(includeEcotrackSync),
        sortKey: 'createdAt',
        sortDirection,
      });
      return request<HistoryListResponse>(`/api/action-history?${params.toString()}`);
    },
    initialData: {
      items: [],
      pagination: {
        page: 1,
        limit: 20,
        totalItems: 0,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    },
    initialDataUpdatedAt: 0,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  const effectiveSelectedId = historyQuery.data.items.some((item) => item.id === selectedId)
    ? selectedId
    : (historyQuery.data.items[0]?.id ?? null);
  useAdminAiSurfaceDetails({
    filters: {
      page,
      search: deferredSearch,
      operation,
      resource,
      state,
      includeEcotrackSync,
      sortDirection,
    },
    selection: effectiveSelectedId
      ? { entityType: 'actionLog', ids: [effectiveSelectedId], focusedId: effectiveSelectedId }
      : null,
  });
  const detailQuery = useQuery({
    queryKey: ['action-history', 'detail', effectiveSelectedId],
    queryFn: () => request<HistoryDetailResponse>(`/api/action-history/${effectiveSelectedId}`),
    enabled: effectiveSelectedId !== null,
    staleTime: 30_000,
  });

  const groups = useMemo(() => {
    const result: Array<{ key: string; label: string; items: HistoryListItem[] }> = [];
    for (const item of historyQuery.data.items) {
      const key = dayKey(item.createdAt);
      const current = result.at(-1);
      if (current?.key === key) current.items.push(item);
      else result.push({ key, label: formatDay(item.createdAt, locale, t), items: [item] });
    }
    return result;
  }, [historyQuery.data.items, locale, t]);

  const activeFilterCount =
    Number(operation !== 'all') +
    Number(resource !== 'all') +
    Number(state !== 'all') +
    Number(includeEcotrackSync);
  const hasActiveFilters = activeFilterCount > 0 || deferredSearch.length > 0;

  async function refreshHistory() {
    await queryClient.invalidateQueries({ queryKey: ['action-history'] });
    await Promise.all(
      invalidateQueryKeys.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
    );
  }

  const recoveryMutation = useMutation({
    mutationFn: ({ direction, item }: { direction: 'undo' | 'redo'; item: HistoryDetailItem }) =>
      request(`/api/action-history/${item.id}/${direction}`, { method: 'POST' }),
    onMutate: ({ direction, item }) => ({
      toastId: toast.loading(
        t(`history.notifications.${direction}.loading`, { entity: item.entityLabel }),
      ),
    }),
    onSuccess: async (_data, variables, context) => {
      toast.success(
        t(`history.notifications.${variables.direction}.success`, {
          entity: variables.item.entityLabel,
        }),
        { id: context?.toastId },
      );
      setPendingRecovery(null);
      await refreshHistory();
    },
    onError: (error: Error, variables, context) => {
      toast.error(
        error.message ||
          t(`history.notifications.${variables.direction}.error`, {
            entity: variables.item.entityLabel,
          }),
        { id: context?.toastId },
      );
      setPendingRecovery(null);
    },
  });

  function resetFilters() {
    setPage(1);
    setSearch('');
    setOperation('all');
    setResource('all');
    setState('all');
    setIncludeEcotrackSync(false);
    setSortDirection('desc');
  }

  function selectItem(item: HistoryListItem) {
    setSelectedId(item.id);
    if (!isWideLayout) setMobileInspectorOpen(true);
  }

  const inspector = (
    <HistoryInspector
      detail={detailQuery.data}
      loading={detailQuery.isFetching}
      error={detailQuery.error}
      onRetry={() => void detailQuery.refetch()}
      onRecover={(direction, item) => setPendingRecovery({ direction, item })}
    />
  );

  return (
    <section
      className={cn(
        'overflow-hidden rounded-[var(--shape-radius-panel-relaxed)] border border-border/70 bg-background shadow-sm',
        className,
      )}
    >
      <header className="border-b border-border/60 px-3 py-3 sm:px-5 sm:py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
          <div className="flex items-center gap-3">
            <History className="hidden size-5 text-primary lg:block" />
            <div>
              <h2 className="hidden font-semibold tracking-tight text-foreground lg:block">
                {t('history.title')}
              </h2>
              <p className="text-xs text-muted-foreground">
                {t('history.itemsCount', { count: historyQuery.data.pagination.totalItems })}
              </p>
            </div>
          </div>
          <div
            className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto_auto] gap-2 lg:max-w-2xl lg:justify-end"
            data-mobile-history-controls
          >
            <div className="col-span-3 sm:col-span-1">
              <SearchField
                value={search}
                placeholder={t('history.searchPlaceholder')}
                onChange={(value) => {
                  setPage(1);
                  setSearch(value);
                }}
              />
            </div>
            <Button
              type="button"
              variant={filtersOpen || activeFilterCount > 0 ? 'default' : 'outline'}
              aria-label={t('history.filters.title')}
              onClick={() => setFiltersOpen((open) => !open)}
              aria-expanded={filtersOpen}
            >
              <SlidersHorizontal className="size-4" />
              <span className="hidden sm:inline">{t('history.filters.title')}</span>
              {activeFilterCount > 0 ? activeFilterCount : null}
            </Button>
            <Button
              type="button"
              variant="outline"
              aria-label={t(
                sortDirection === 'desc' ? 'history.sort.newest' : 'history.sort.oldest',
              )}
              onClick={() => {
                setPage(1);
                setSortDirection((current) => (current === 'desc' ? 'asc' : 'desc'));
              }}
            >
              {sortDirection === 'desc' ? (
                <ArrowDown className="size-4" />
              ) : (
                <ArrowUp className="size-4" />
              )}
            </Button>
          </div>
        </div>
      </header>

      {historyQuery.error ? (
        <div role="alert" className="flex items-center justify-between gap-3 p-4 text-sm">
          <p>{historyQuery.error.message}</p>
          <Button
            type="button"
            variant="outline"
            disabled={historyQuery.isFetching}
            onClick={() => void historyQuery.refetch()}
          >
            {t('actions.retry')}
          </Button>
        </div>
      ) : null}

      {filtersOpen ? (
        <div className="grid gap-3 border-b border-border/60 bg-muted/15 px-4 py-4 sm:grid-cols-2 sm:px-5 lg:grid-cols-[1fr_1fr_1fr_auto_auto] lg:items-center">
          <NativeSelect
            aria-label={t('history.filters.actionLabel')}
            value={operation}
            onChange={(event) => {
              setPage(1);
              setOperation(event.target.value as HistoryOperationFilter);
            }}
          >
            {['all', 'create', 'update', 'delete'].map((value) => (
              <option key={value} value={value}>
                {value === 'all'
                  ? t('history.filters.allActions')
                  : t(`history.operations.${value}`)}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect
            aria-label={t('history.filters.areaLabel')}
            value={resource}
            onChange={(event) => {
              setPage(1);
              setResource(event.target.value as HistoryResourceFilter);
            }}
          >
            <option value="all">{t('history.filters.allAreas')}</option>
            {[
              'orders',
              'products',
              'assets',
              'brandsCategories',
              'bulletin',
              'stats',
              'settings',
              'ecotrack',
            ].map((value) => (
              <option key={value} value={value}>
                {t(`history.resources.${value}`)}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect
            aria-label={t('history.filters.stateLabel')}
            value={state}
            onChange={(event) => {
              setPage(1);
              setState(event.target.value as HistoryState);
            }}
          >
            <option value="all">{t('history.filters.allStates')}</option>
            <option value="applied">{t('history.state.applied')}</option>
            <option value="undone">{t('history.state.undone')}</option>
          </NativeSelect>
          <div className="flex items-center gap-2 text-sm text-foreground">
            <Switch
              checked={includeEcotrackSync}
              aria-label={t('history.filters.includeEcotrackSyncLabel')}
              onCheckedChange={(checked) => {
                setPage(1);
                setIncludeEcotrackSync(checked);
              }}
            />
            <span>{t('history.filters.includeAutomation')}</span>
          </div>
          {hasActiveFilters ? (
            <Button type="button" variant="ghost" onClick={resetFilters}>
              {t('history.resetFilters')}
            </Button>
          ) : null}
        </div>
      ) : null}

      <div
        className="grid min-h-0 xl:h-[calc(100vh-10rem)] xl:min-h-[38rem] xl:max-h-[52rem] xl:grid-cols-[minmax(21rem,0.8fr)_minmax(30rem,1.2fr)]"
        data-mobile-history-list
      >
        <div className="relative min-w-0 border-border/60 xl:overflow-y-auto xl:border-e">
          <div
            className={cn(
              historyQuery.isFetching && historyQuery.data.items.length > 0 && 'opacity-65',
              'transition-opacity',
            )}
          >
            {historyQuery.isFetching && historyQuery.data.items.length === 0 ? (
              <div className="px-5 py-16 text-center text-sm text-muted-foreground">
                {t('history.loading')}
              </div>
            ) : null}
            {!historyQuery.isFetching &&
            !historyQuery.error &&
            historyQuery.data.items.length === 0 ? (
              <div className="px-5 py-16 text-center text-sm text-muted-foreground">
                {t(hasActiveFilters ? 'history.emptyFiltered' : 'history.empty')}
              </div>
            ) : null}
            {groups.map((group) => (
              <section key={group.key} aria-labelledby={`history-day-${group.key}`}>
                <h3
                  id={`history-day-${group.key}`}
                  className="sticky top-0 z-10 border-y border-border/50 bg-background/92 px-4 py-2 text-xs font-medium text-muted-foreground backdrop-blur sm:px-5"
                >
                  {group.label}
                </h3>
                <div className="divide-y divide-border/50">
                  {group.items.map((item) => {
                    const Icon = operationIcon(item.operation);
                    const selected = item.id === effectiveSelectedId;
                    const actor = item.createdByName ?? item.createdBy ?? t('history.systemActor');
                    return (
                      <button
                        key={item.id}
                        type="button"
                        aria-current={selected ? 'true' : undefined}
                        className={cn(
                          'grid w-full grid-cols-[2rem_minmax(0,1fr)] gap-3 px-4 py-3.5 text-start transition-colors hover:bg-muted/30 sm:px-5',
                          selected && 'bg-primary/6',
                        )}
                        onClick={() => selectItem(item)}
                      >
                        <span
                          className={cn(
                            'mt-0.5 grid size-8 place-items-center rounded-full bg-muted text-muted-foreground',
                            item.operation === 'create' &&
                              'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
                            item.operation === 'delete' && 'bg-destructive/10 text-destructive',
                          )}
                        >
                          <Icon className="size-4" />
                        </span>
                        <span className="min-w-0">
                          <span className="flex items-start justify-between gap-3">
                            <span className="truncate font-medium text-foreground">
                              {item.entityLabel}
                            </span>
                            {item.isUndone ? (
                              <span className="shrink-0 text-xs font-medium text-amber-600 dark:text-amber-400">
                                {t('history.state.undone')}
                              </span>
                            ) : null}
                          </span>
                          <span className="mt-0.5 block truncate text-sm text-muted-foreground">
                            {eventSummary(item, t)}
                          </span>
                          <span className="mt-1.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                            <span>{t(`history.resources.${item.resource}`)}</span>
                            <span aria-hidden="true">·</span>
                            <span>{actor}</span>
                            <span aria-hidden="true">·</span>
                            <time
                              title={new Date(item.createdAt).toLocaleString(locale)}
                              dateTime={item.createdAt}
                            >
                              {formatRelativeTime(item.createdAt, locale)}
                            </time>
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
            <WorkspacePagination
              currentPage={historyQuery.data.pagination.page ?? page}
              totalPages={historyQuery.data.pagination.totalPages || 1}
              pending={historyQuery.isFetching}
              onPageChange={(nextPage) => {
                setPage(nextPage);
                setMobileInspectorOpen(false);
              }}
            />
          </div>
          <SurfacePendingOverlay
            active={historyQuery.isFetching && historyQuery.data.items.length > 0}
            label={t('history.loading')}
          />
        </div>
        <aside className="hidden min-w-0 overflow-y-auto bg-muted/8 xl:block">{inspector}</aside>
      </div>

      <SidePanel
        open={!isWideLayout && mobileInspectorOpen && effectiveSelectedId !== null}
        onOpenChange={setMobileInspectorOpen}
        title={detailQuery.data?.item.entityLabel ?? t('history.details.loadingTitle')}
        description={
          detailQuery.data ? t(`history.operations.${detailQuery.data.item.operation}`) : undefined
        }
        closeLabel={t('actions.close')}
        className="sm:max-w-[48rem]"
      >
        <HistoryInspector
          detail={detailQuery.data}
          loading={detailQuery.isFetching}
          error={detailQuery.error}
          onRetry={() => void detailQuery.refetch()}
          onRecover={(direction, item) => setPendingRecovery({ direction, item })}
          compact
        />
      </SidePanel>

      <Dialog
        open={pendingRecovery !== null}
        onOpenChange={(open) => {
          if (!open && !recoveryMutation.isPending) setPendingRecovery(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {pendingRecovery
                ? t(`history.recovery.confirm.${pendingRecovery.direction}Title`)
                : ''}
            </DialogTitle>
            <DialogDescription>
              {pendingRecovery
                ? t(`history.recovery.confirm.${pendingRecovery.direction}Description`, {
                    entity: pendingRecovery.item.entityLabel,
                  })
                : ''}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={recoveryMutation.isPending}
              onClick={() => setPendingRecovery(null)}
            >
              {t('actions.cancel')}
            </Button>
            <Button
              type="button"
              disabled={!pendingRecovery || recoveryMutation.isPending}
              onClick={() => {
                if (pendingRecovery) recoveryMutation.mutate(pendingRecovery);
              }}
            >
              {pendingRecovery ? t(`history.${pendingRecovery.direction}`) : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
