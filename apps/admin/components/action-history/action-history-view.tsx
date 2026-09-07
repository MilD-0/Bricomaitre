'use client';
import { ArrowDown, ArrowUp, History, SlidersHorizontal } from 'lucide-react';
import { formatRelativeTime } from '../../lib/date-format';
import { cn } from '../../lib/utils';
import { SearchField } from '../search-field';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { SurfacePendingOverlay } from '../ui/motion';
import { NativeSelect } from '../ui/native-select';
import { SidePanel } from '../ui/side-panel';
import { Switch } from '../ui/switch';
import { WorkspacePagination } from '../ui/workspace-pagination';
import {
  type useActionHistoryPanel,
  eventSummary,
  HistoryInspector,
  HistoryOperationFilter,
  HistoryResourceFilter,
  HistoryState,
  operationIcon,
} from './use-action-history';

export function ActionHistoryPanelView({
  className,
  t,
  historyQuery,
  search,
  setPage,
  setSearch,
  filtersOpen,
  activeFilterCount,
  setFiltersOpen,
  sortDirection,
  setSortDirection,
  operation,
  setOperation,
  resource,
  setResource,
  state,
  setState,
  includeEcotrackSync,
  setIncludeEcotrackSync,
  hasActiveFilters,
  resetFilters,
  groups,
  effectiveSelectedId,
  selectItem,
  locale,
  page,
  setMobileInspectorOpen,
  inspector,
  isWideLayout,
  mobileInspectorOpen,
  detailQuery,
  setPendingRecovery,
  pendingRecovery,
  recoveryMutation,
}: NonNullable<ReturnType<typeof useActionHistoryPanel>['view']>) {
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
