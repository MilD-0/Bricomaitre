'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useDeferredValue, useMemo, useState } from 'react';

import { appendSortParams, getSortRuleState, toggleSortRule, type SortRule } from '../lib/multi-sort';
import { toast } from '../lib/toast';
import { MultiSortHeader } from './multi-sort-header';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Input } from './ui/input';
import { SurfacePendingOverlay } from './ui/motion';
import { NativeSelect, NativeSelectOption } from './ui/native-select';
import { Switch } from './ui/switch';
import { TablePaginationControls } from './table-pagination-controls';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';

type ActionHistoryItem = {
  id: number;
  resource: string;
  entityType: string;
  entityId: number;
  entityLabel: string;
  operation: 'create' | 'update' | 'delete';
  createdBy: string | null;
  createdByName: string | null;
  isReversible: boolean;
  isUndone: boolean;
  changes: Array<{
    field: string;
    before: unknown;
    after: unknown;
  }>;
  createdAt: string;
  undoneAt: string | null;
  redoneAt: string | null;
};

type PaginationMeta = {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
};

type ActionHistoryResponse = {
  items: ActionHistoryItem[];
  pagination: PaginationMeta;
};

type ActionHistorySortKey = 'operation' | 'resource' | 'createdBy' | 'createdAt' | 'isUndone';
type ActionHistorySortRule = SortRule<ActionHistorySortKey>;
type ActionHistoryState = 'all' | 'applied' | 'undone';
type ActionHistoryOperationFilter = 'all' | 'create' | 'update' | 'delete';
type ActionHistoryResourceFilter = 'all' | 'products' | 'orders' | 'assets' | 'brandsCategories' | 'bulletin' | 'stats' | 'settings' | 'ecotrack';

function formatChangeValue(t: ReturnType<typeof useTranslations>, value: unknown) {
  if (value == null || value === '') {
    return t('history.noValue');
  }

  if (typeof value === 'boolean') {
    return value ? t('history.boolean.true') : t('history.boolean.false');
  }

  if (Array.isArray(value)) {
    return value.length > 0 ? value.join(', ') : t('history.noValue');
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });

  if (!res.ok) {
    const contentType = res.headers.get('content-type') ?? '';

    if (contentType.includes('application/json')) {
      const payload = await res.json() as { error?: unknown };

      if (typeof payload.error === 'string' && payload.error.trim().length > 0) {
        throw new Error(payload.error);
      }

      throw new Error(JSON.stringify(payload));
    }

    throw new Error(await res.text());
  }

  return res.json() as Promise<T>;
}

function SearchField({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <div className="relative w-full max-w-sm">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input className="pl-9" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </div>
  );
}

function HistoryDetailsDialog({
  item,
  onOpenChange,
}: {
  item: ActionHistoryItem | null;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations();
  const locale = useLocale();

  if (!item) {
    return null;
  }

  const actor = item.createdByName ?? item.createdBy ?? t('history.systemActor');

  return (
    <Dialog open={Boolean(item)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('history.details.title', { entity: item.entityLabel })}</DialogTitle>
          <DialogDescription>{t('history.details.description')}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{t('history.columns.action')}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge className="rounded-full">{t(`history.operations.${item.operation}`)}</Badge>
              <Badge variant={item.isUndone ? 'outline' : 'secondary'} className="rounded-full">
                {t(item.isUndone ? 'history.state.undone' : 'history.state.applied')}
              </Badge>
              {!item.isReversible ? (
                <Badge variant="outline" className="rounded-full">
                  {t('history.state.nonReversible')}
                </Badge>
              ) : null}
            </div>
          </div>

          <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{t('history.columns.where')}</p>
            <p className="mt-2 font-medium text-foreground">{t(`history.resources.${item.resource}`)}</p>
            <p className="mt-1 text-sm text-muted-foreground">{item.entityType} #{item.entityId}</p>
          </div>

          <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{t('history.columns.who')}</p>
            <p className="mt-2 font-medium text-foreground">{actor}</p>
            {item.createdBy && item.createdByName ? <p className="mt-1 text-sm text-muted-foreground">{item.createdBy}</p> : null}
          </div>

          <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{t('history.columns.when')}</p>
            <p className="mt-2 font-medium text-foreground">{new Date(item.createdAt).toLocaleString(locale)}</p>
            {item.undoneAt ? <p className="mt-1 text-sm text-muted-foreground">{t('history.details.undoneAt', { value: new Date(item.undoneAt).toLocaleString(locale) })}</p> : null}
            {item.redoneAt ? <p className="mt-1 text-sm text-muted-foreground">{t('history.details.redoneAt', { value: new Date(item.redoneAt).toLocaleString(locale) })}</p> : null}
          </div>
        </div>

        <div className="mt-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">{t('history.details.changesTitle')}</h3>
              <p className="text-sm text-muted-foreground">{t('history.details.changesDescription')}</p>
            </div>
            <Badge variant="outline" className="rounded-full">
              {t('history.details.changesCount', { count: item.changes.length })}
            </Badge>
          </div>

          {item.changes.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-dashed border-border/80 px-4 py-5 text-sm text-muted-foreground">
              {t('history.details.noChanges')}
            </div>
          ) : (
            <div className="mt-4 overflow-hidden rounded-2xl border border-border/70">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>{t('history.details.columns.field')}</TableHead>
                    <TableHead>{t('history.details.columns.before')}</TableHead>
                    <TableHead>{t('history.details.columns.after')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {item.changes.map((change) => (
                    <TableRow key={`${item.id}-${change.field}`}>
                      <TableCell className="font-medium">{change.field}</TableCell>
                      <TableCell>{formatChangeValue(t, change.before)}</TableCell>
                      <TableCell>{formatChangeValue(t, change.after)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('history.details.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ActionHistoryPanel({ invalidateQueryKeys = [] }: { invalidateQueryKeys?: Array<readonly unknown[]> }) {
  const t = useTranslations();
  const locale = useLocale();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [operation, setOperation] = useState<ActionHistoryOperationFilter>('all');
  const [resource, setResource] = useState<ActionHistoryResourceFilter>('all');
  const [state, setState] = useState<ActionHistoryState>('all');
  const [includeEcotrackSync, setIncludeEcotrackSync] = useState(false);
  const [sortRules, setSortRules] = useState<ActionHistorySortRule[]>([]);
  const [detailItem, setDetailItem] = useState<ActionHistoryItem | null>(null);
  const deferredSearch = useDeferredValue(search.trim());

  const historyQuery = useQuery({
    queryKey: ['action-history', page, deferredSearch, operation, resource, state, includeEcotrackSync, sortRules],
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: '10',
        search: deferredSearch,
        operation,
        resource,
        state,
        includeEcotrackSync: String(includeEcotrackSync),
      });
      appendSortParams(params, sortRules);

      return request<ActionHistoryResponse>(`/api/action-history?${params.toString()}`);
    },
    initialData: {
      items: [],
      pagination: {
        page: 1,
        limit: 10,
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

  const operationOptions = useMemo(
    () => [
      { value: 'all', label: t('history.filters.allActions') },
      { value: 'create', label: t('history.operations.create') },
      { value: 'update', label: t('history.operations.update') },
      { value: 'delete', label: t('history.operations.delete') },
    ] satisfies Array<{ value: ActionHistoryOperationFilter; label: string }>,
    [t],
  );

  const resourceOptions = useMemo(
    () => [
      { value: 'all', label: t('history.filters.allAreas') },
      { value: 'orders', label: t('history.resources.orders') },
      { value: 'products', label: t('history.resources.products') },
      { value: 'assets', label: t('history.resources.assets') },
      { value: 'brandsCategories', label: t('history.resources.brandsCategories') },
      { value: 'bulletin', label: t('history.resources.bulletin') },
      { value: 'stats', label: t('history.resources.stats') },
      { value: 'settings', label: t('history.resources.settings') },
      { value: 'ecotrack', label: t('history.resources.ecotrack') },
    ] satisfies Array<{ value: ActionHistoryResourceFilter; label: string }>,
    [t],
  );

  const stateOptions = useMemo(
    () => [
      { value: 'all', label: t('history.filters.allStates') },
      { value: 'applied', label: t('history.state.applied') },
      { value: 'undone', label: t('history.state.undone') },
    ] satisfies Array<{ value: ActionHistoryState; label: string }>,
    [t],
  );

  const undoMutation = useMutation<unknown, Error, { id: number; label: string }, { toastId: string }>({
    mutationFn: ({ id }) => request(`/api/action-history/${id}/undo`, { method: 'POST' }),
    onMutate: ({ label }) => ({ toastId: toast.loading(t('history.notifications.undo.loading', { entity: label })) }),
    onError: (error, variables, context) => {
      toast.error(error.message || t('history.notifications.undo.error', { entity: variables.label }), { id: context?.toastId });
    },
    onSuccess: async (_data, variables, context) => {
      toast.success(t('history.notifications.undo.success', { entity: variables.label }), { id: context?.toastId });
      await queryClient.invalidateQueries({ queryKey: ['action-history'] });
      await Promise.all(invalidateQueryKeys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
    },
  });

  const redoMutation = useMutation<unknown, Error, { id: number; label: string }, { toastId: string }>({
    mutationFn: ({ id }) => request(`/api/action-history/${id}/redo`, { method: 'POST' }),
    onMutate: ({ label }) => ({ toastId: toast.loading(t('history.notifications.redo.loading', { entity: label })) }),
    onError: (error, variables, context) => {
      toast.error(error.message || t('history.notifications.redo.error', { entity: variables.label }), { id: context?.toastId });
    },
    onSuccess: async (_data, variables, context) => {
      toast.success(t('history.notifications.redo.success', { entity: variables.label }), { id: context?.toastId });
      await queryClient.invalidateQueries({ queryKey: ['action-history'] });
      await Promise.all(invalidateQueryKeys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
    },
  });

  const pendingHistoryId = undoMutation.variables?.id ?? redoMutation.variables?.id ?? null;
  const totalPages = historyQuery.data.pagination.totalPages || 1;
  const hasActiveFilters = deferredSearch.length > 0 || operation !== 'all' || resource !== 'all' || state !== 'all' || includeEcotrackSync;

  function toggleSort(nextKey: ActionHistorySortKey) {
    setPage(1);
    setSortRules((current) => toggleSortRule(current, nextKey, 'asc'));
  }

  function resetFilters() {
    setPage(1);
    setSearch('');
    setOperation('all');
    setResource('all');
    setState('all');
    setIncludeEcotrackSync(false);
    setSortRules([]);
  }

  return (
    <section className="overflow-hidden rounded-[1.75rem] border border-border/70 bg-background/95 shadow-sm">
      <div className="border-b border-border/70 bg-linear-to-r from-muted/45 via-background to-background px-5 py-4 sm:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-foreground">{t('history.title')}</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="rounded-full px-3 py-1">{t('history.itemsCount', { count: historyQuery.data.pagination.totalItems })}</Badge>
            {hasActiveFilters ? (
              <Button type="button" variant="outline" size="sm" onClick={resetFilters}>
                {t('history.resetFilters')}
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="border-b border-border/70 px-5 py-4 sm:px-6">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex w-full flex-col gap-3 lg:flex-row lg:items-center">
            <SearchField
              value={search}
              placeholder={t('history.searchPlaceholder')}
              onChange={(value) => {
                setPage(1);
                setSearch(value);
              }}
            />
            <div className="grid gap-3 sm:grid-cols-3 lg:w-[34rem]">
              <NativeSelect
                aria-label={t('history.filters.actionLabel')}
                value={operation}
                onChange={(event) => {
                  setPage(1);
                  setOperation(event.target.value as ActionHistoryOperationFilter);
                }}
              >
                {operationOptions.map((option) => (
                  <NativeSelectOption key={option.value} value={option.value}>
                    {option.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <NativeSelect
                aria-label={t('history.filters.areaLabel')}
                value={resource}
                onChange={(event) => {
                  setPage(1);
                  setResource(event.target.value as ActionHistoryResourceFilter);
                }}
              >
                {resourceOptions.map((option) => (
                  <NativeSelectOption key={option.value} value={option.value}>
                    {option.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <NativeSelect
                aria-label={t('history.filters.stateLabel')}
                value={state}
                onChange={(event) => {
                  setPage(1);
                  setState(event.target.value as ActionHistoryState);
                }}
              >
                {stateOptions.map((option) => (
                  <NativeSelectOption key={option.value} value={option.value}>
                    {option.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <label className="flex min-w-fit items-center gap-3 rounded-lg border border-border/70 bg-background px-3 py-2 text-sm">
              <Switch
                checked={includeEcotrackSync}
                aria-label={t('history.filters.includeEcotrackSyncLabel')}
                onCheckedChange={(checked) => {
                  setPage(1);
                  setIncludeEcotrackSync(checked);
                }}
              />
              <span className="flex flex-col">
                <span className="font-medium text-foreground">{t('history.filters.includeEcotrackSyncLabel')}</span>
                <span className="text-xs text-muted-foreground">{t('history.filters.includeEcotrackSyncDescription')}</span>
              </span>
            </label>
          </div>

          <p className="text-sm text-muted-foreground">
            {t('history.resultsSummary', {
              count: historyQuery.data.items.length,
              total: historyQuery.data.pagination.totalItems,
            })}
          </p>
        </div>
      </div>

      <div className="relative" aria-busy={historyQuery.isFetching && historyQuery.data.items.length > 0}>
        <div className={historyQuery.isFetching && historyQuery.data.items.length > 0 ? 'transition-opacity duration-200 opacity-70' : 'transition-opacity duration-200'}>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>
                <MultiSortHeader label={t('history.columns.action')} sortState={getSortRuleState(sortRules, 'operation')} onClick={() => toggleSort('operation')} />
              </TableHead>
              <TableHead>
                <MultiSortHeader label={t('history.columns.where')} sortState={getSortRuleState(sortRules, 'resource')} onClick={() => toggleSort('resource')} />
              </TableHead>
              <TableHead>
                <MultiSortHeader label={t('history.columns.who')} sortState={getSortRuleState(sortRules, 'createdBy')} onClick={() => toggleSort('createdBy')} />
              </TableHead>
              <TableHead>
                <MultiSortHeader label={t('history.columns.when')} sortState={getSortRuleState(sortRules, 'createdAt')} onClick={() => toggleSort('createdAt')} />
              </TableHead>
              <TableHead className="w-[240px]">
                <MultiSortHeader label={t('history.columns.actions')} sortState={getSortRuleState(sortRules, 'isUndone')} onClick={() => toggleSort('isUndone')} />
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {historyQuery.isFetching && historyQuery.data.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                  {t('history.loading')}
                </TableCell>
              </TableRow>
            ) : null}

            {!historyQuery.isFetching && historyQuery.data.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                  {t(hasActiveFilters ? 'history.emptyFiltered' : 'history.empty')}
                </TableCell>
              </TableRow>
            ) : null}

            {historyQuery.data.items.map((item) => {
              const actor = item.createdByName ?? item.createdBy ?? t('history.systemActor');
              const isUndoPending = undoMutation.isPending && pendingHistoryId === item.id;
              const isRedoPending = redoMutation.isPending && pendingHistoryId === item.id;

              return (
                <TableRow key={item.id}>
                  <TableCell>
                    <div className="min-w-[16rem]">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className="rounded-full">{t(`history.operations.${item.operation}`)}</Badge>
                        <p className="font-medium text-foreground">{item.entityLabel}</p>
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {item.entityType} #{item.entityId}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="min-w-[10rem]">
                      <p className="font-medium text-foreground">{t(`history.resources.${item.resource}`)}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{t('history.resourceContext', { entity: item.entityType })}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="min-w-[11rem]">
                      <p className="font-medium text-foreground">{actor}</p>
                      {item.createdBy && item.createdByName ? <p className="mt-1 text-sm text-muted-foreground">{item.createdBy}</p> : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="min-w-[11rem] text-sm text-muted-foreground">
                      {new Date(item.createdAt).toLocaleString(locale)}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex min-w-[15rem] flex-wrap items-center justify-end gap-2">
                      <Badge variant={item.isUndone ? 'outline' : 'secondary'} className="rounded-full">
                        {t(item.isUndone ? 'history.state.undone' : 'history.state.applied')}
                      </Badge>
                      {!item.isReversible ? (
                        <Badge variant="outline" className="rounded-full">
                          {t('history.state.nonReversible')}
                        </Badge>
                      ) : null}
                      <Button type="button" variant="outline" size="sm" onClick={() => setDetailItem(item)}>
                        {t('history.viewDetails')}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={!item.isReversible || item.isUndone || undoMutation.isPending || redoMutation.isPending}
                        onClick={() => undoMutation.mutate({ id: item.id, label: item.entityLabel })}
                      >
                        {isUndoPending ? t('history.undoPending') : t('history.undo')}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        disabled={!item.isReversible || !item.isUndone || undoMutation.isPending || redoMutation.isPending}
                        onClick={() => redoMutation.mutate({ id: item.id, label: item.entityLabel })}
                      >
                        {isRedoPending ? t('history.redoPending') : t('history.redo')}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <TablePaginationControls currentPage={historyQuery.data.pagination.page ?? page} totalPages={totalPages} onPageChange={setPage} />
        </div>
        <SurfacePendingOverlay active={historyQuery.isFetching && historyQuery.data.items.length > 0} label={t('history.loading')} />
      </div>

      <HistoryDetailsDialog item={detailItem} onOpenChange={(open) => {
        if (!open) {
          setDetailItem(null);
        }
      }}
      />
    </section>
  );
}
