'use client';
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  MessageSquareText,
  Trash2,
} from 'lucide-react';
import { formatOrderRegionLabel } from '../../../lib/order-presentation';
import { buildOrderTrackingUrl } from '../../../lib/order-tracking-link';
import { getOrderStatusLabelKey, ORDER_STATUS, type OrderStatus } from '../../../lib/orders';
import { cn } from '../../../lib/utils';
import { Button } from '../../ui/button';
import { Checkbox } from '../../ui/checkbox';
import { CompactMenu, CompactMenuItem } from '../../ui/compact-menu';
import { NativeSelect } from '../../ui/native-select';
import { Spinner } from '../../ui/spinner';
import { WorkspacePagination } from '../../ui/workspace-pagination';
import {
  formatOrderDate,
  formatOrderListTimestamp,
  formatOrderMoney,
  orderStatusOptions,
  orderStatusTone,
  summarizeOrderProducts,
} from '../orders-workspace-presenters';
import { noAnswerAttemptFilters } from './use-workspace';
import type { OrdersWorkspaceView } from './workspace-view';
export function OrderQueue({
  t,
  activeOrderId,
  activeOrder,
  ordersQuery,
  allVisibleSelected,
  setSelectedIds,
  orders,
  selectStatusFilter,
  statusFilter,
  noAnswerAttemptFilter,
  selectNoAnswerAttemptFilter,
  selectedIds,
  bulkStatus,
  writable,
  bulkStatusMutation,
  setBulkStatus,
  locale,
  storefrontBaseUrl,
  focusOrder,
  initialCatalog,
  copyTrackingLink,
  setDeleteTarget,
  pagination,
  changePage,
}: Pick<
  Parameters<typeof OrdersWorkspaceView>[0],
  | 't'
  | 'activeOrderId'
  | 'activeOrder'
  | 'ordersQuery'
  | 'allVisibleSelected'
  | 'setSelectedIds'
  | 'orders'
  | 'selectStatusFilter'
  | 'statusFilter'
  | 'noAnswerAttemptFilter'
  | 'selectNoAnswerAttemptFilter'
  | 'selectedIds'
  | 'bulkStatus'
  | 'writable'
  | 'bulkStatusMutation'
  | 'setBulkStatus'
  | 'locale'
  | 'storefrontBaseUrl'
  | 'focusOrder'
  | 'initialCatalog'
  | 'copyTrackingLink'
  | 'setDeleteTarget'
  | 'pagination'
  | 'changePage'
>) {
  return (
    <section
      aria-label={t('adminWorkspace.orders.queue')}
      className={cn(
        'min-w-0 border-border/60 lg:block lg:border-e',
        activeOrderId !== null && activeOrder !== null ? 'hidden' : 'block',
      )}
    >
      {ordersQuery.isError ? (
        <p className="border-b border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {ordersQuery.error.message}
        </p>
      ) : null}
      <div className="flex gap-1 overflow-x-auto border-b border-border/60 bg-muted/[0.16] px-2 py-2">
        <label className="grid size-9 shrink-0 place-items-center">
          <span className="sr-only">{t('labels.selectAll')}</span>
          <Checkbox
            aria-label={t('labels.selectAll')}
            checked={allVisibleSelected}
            onChange={(event) =>
              setSelectedIds(event.target.checked ? orders.map((order) => order.id) : [])
            }
          />
        </label>
        {(
          [
            'all',
            ORDER_STATUS.NOT_CONTACTED,
            ORDER_STATUS.NO_ANSWER,
            ORDER_STATUS.CONFIRMED,
            ORDER_STATUS.POSTED,
          ] as const
        ).map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => selectStatusFilter(status)}
            className={cn(
              'shrink-0 rounded-[var(--shape-radius-soft-sm)] px-3 py-1.5 text-sm font-medium transition-colors',
              statusFilter === status
                ? 'bg-primary text-primary-foreground shadow-[var(--shadow-vapor)]'
                : 'text-muted-foreground hover:bg-background hover:text-foreground',
            )}
          >
            {status === 'all'
              ? t('adminWorkspace.common.all')
              : t(`ordersManager.status.${getOrderStatusLabelKey(status)}`)}
          </button>
        ))}
      </div>
      {statusFilter === ORDER_STATUS.NO_ANSWER ? (
        <div className="flex items-center gap-3 overflow-x-auto border-b border-border/60 px-3 py-1.5">
          <span className="shrink-0 text-xs font-medium text-muted-foreground">
            {t('adminWorkspace.orders.noAnswerAttempts')}
          </span>
          <div className="flex items-center gap-1">
            {noAnswerAttemptFilters.map((filter) => {
              const ariaLabel =
                filter === 'all'
                  ? t('ordersManager.filters.allNoAnswerCounts')
                  : filter === '3-plus'
                    ? t('ordersManager.filters.noAnswerCountAtLeast', { count: 3 })
                    : t('ordersManager.status.noAnswerWithCount', { count: filter });
              const label =
                filter === 'all'
                  ? t('adminWorkspace.common.all')
                  : filter === '3-plus'
                    ? '3+'
                    : String(filter);

              return (
                <button
                  key={filter}
                  type="button"
                  aria-label={ariaLabel}
                  aria-pressed={noAnswerAttemptFilter === filter}
                  dir={filter === '3-plus' ? 'ltr' : undefined}
                  onClick={() => selectNoAnswerAttemptFilter(filter)}
                  className={cn(
                    'min-w-8 shrink-0 border-b-2 px-2 py-1 text-xs font-medium transition-colors',
                    noAnswerAttemptFilter === filter
                      ? 'border-primary text-foreground'
                      : 'border-transparent text-muted-foreground hover:text-foreground',
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
      {selectedIds.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-border/60 bg-primary/[0.045] px-3 py-2.5">
          <span className="me-auto text-sm font-medium">
            {t('labels.bulkSelectionCount', { count: selectedIds.length })}
          </span>
          <NativeSelect
            aria-label={t('ordersManager.bulk.statusLabel')}
            value={String(bulkStatus)}
            className="min-w-40 sm:w-auto"
            disabled={!writable || bulkStatusMutation.isPending}
            onChange={(event) => setBulkStatus(Number(event.target.value) as OrderStatus)}
          >
            {orderStatusOptions
              .filter((status) => status !== ORDER_STATUS.POSTED)
              .map((status) => (
                <option key={status} value={status}>
                  {t(`ordersManager.status.${getOrderStatusLabelKey(status)}`)}
                </option>
              ))}
          </NativeSelect>
          <Button
            type="button"
            size="sm"
            disabled={!writable || bulkStatusMutation.isPending}
            onClick={() => bulkStatusMutation.mutate()}
          >
            {bulkStatusMutation.isPending ? <Spinner className="size-4" /> : null}
            {t('ordersManager.bulk.applyStatus')}
          </Button>
        </div>
      ) : null}
      <div className="divide-y divide-border/55">
        {orders.map((order) => {
          const trackingUrl = buildOrderTrackingUrl(order.publicToken, locale, storefrontBaseUrl);
          const note = order.note?.trim();
          const statusLabel =
            order.inHouseStatus === ORDER_STATUS.NO_ANSWER
              ? t('ordersManager.status.noAnswerWithCount', {
                  count: order.noAnswerCount,
                })
              : t(`ordersManager.status.${getOrderStatusLabelKey(order.inHouseStatus)}`);

          return (
            <div
              key={order.id}
              className={cn(
                'group relative grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3 px-3 py-3.5 transition-colors hover:bg-primary/[0.035] sm:px-4 sm:py-4',
                activeOrderId === order.id && 'bg-primary/[0.055]',
              )}
            >
              <span className="pt-1">
                <Checkbox
                  aria-label={t('labels.selectRow', { name: order.fullName })}
                  checked={selectedIds.includes(order.id)}
                  onChange={(event) =>
                    setSelectedIds((current) =>
                      event.target.checked
                        ? [...new Set([...current, order.id])]
                        : current.filter((id) => id !== order.id),
                    )
                  }
                />
              </span>
              <button
                type="button"
                onClick={() => focusOrder(order.id)}
                className="min-w-0 rounded-sm text-start focus-visible:outline-none focus-visible:ring-[length:var(--focus-ring-width)] focus-visible:ring-ring/30"
              >
                <span
                  className={cn(
                    'flex min-w-0 items-baseline gap-2',
                    trackingUrl ? 'pe-[4.75rem]' : 'pe-10',
                  )}
                >
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                    {order.fullName}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">#{order.id}</span>
                </span>
                <span className="mt-2 flex min-w-0 items-center justify-between gap-3 pe-[4.75rem]">
                  <span className="flex min-w-0 items-center gap-1.5 whitespace-nowrap text-xs font-medium">
                    <span
                      className={cn(
                        'size-2 shrink-0 rounded-full',
                        orderStatusTone(order.inHouseStatus),
                      )}
                      aria-hidden="true"
                    />
                    {statusLabel}
                  </span>
                  <time
                    dateTime={order.createdAt}
                    title={formatOrderDate(locale, order.createdAt, true)}
                    dir="ltr"
                    className="shrink-0 whitespace-nowrap text-[length:var(--type-size-caption)] font-normal tabular-nums"
                  >
                    {formatOrderListTimestamp(locale, order.createdAt)}
                  </time>
                </span>
                <span className="mt-1.5 flex min-w-0 items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-xs leading-5 text-muted-foreground">
                    {summarizeOrderProducts(order)} ·{' '}
                    {formatOrderRegionLabel(
                      initialCatalog,
                      order.state,
                      order.city,
                      t('adminWorkspace.orders.noLocation'),
                    )}
                  </span>
                  <span className="shrink-0 text-sm font-semibold text-foreground tabular-nums">
                    {formatOrderMoney(locale, order.totalAmount)}
                  </span>
                </span>
                {note ? (
                  <span className="mt-1.5 flex min-w-0 items-center gap-1.5 text-xs leading-5 text-muted-foreground">
                    <MessageSquareText className="size-3.5 shrink-0" aria-hidden="true" />
                    <span className="truncate">{note}</span>
                  </span>
                ) : null}
              </button>
              <div className="absolute end-3 top-3.5 flex items-center gap-0.5 sm:end-4 sm:top-4">
                {trackingUrl ? (
                  <a
                    href={trackingUrl}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={t('adminWorkspace.orders.openTracking', {
                      name: order.fullName,
                    })}
                    className="grid size-9 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-primary focus-visible:outline-none focus-visible:ring-[length:var(--focus-ring-width)] focus-visible:ring-ring/30"
                  >
                    <ExternalLink className="size-4" aria-hidden="true" />
                  </a>
                ) : null}
                <CompactMenu label={`${t('labels.actions')} · ${order.fullName}`}>
                  <CompactMenuItem onClick={() => focusOrder(order.id)}>
                    <ChevronRight className="size-4 rtl:hidden" aria-hidden="true" />
                    <ChevronLeft className="hidden size-4 rtl:block" aria-hidden="true" />
                    {t('actions.edit')}
                  </CompactMenuItem>
                  <CompactMenuItem onClick={() => void copyTrackingLink(order)}>
                    <Copy className="size-4" aria-hidden="true" />
                    {t('ordersManager.tracking.copy')}
                  </CompactMenuItem>
                  <CompactMenuItem
                    destructive
                    disabled={!writable}
                    onClick={() => setDeleteTarget({ id: order.id, label: order.fullName })}
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                    {t('actions.delete')}
                  </CompactMenuItem>
                </CompactMenu>
              </div>
            </div>
          );
        })}
      </div>
      {ordersQuery.isFetching ? (
        <div className="flex items-center justify-center gap-2 px-4 py-5 text-sm text-muted-foreground">
          <Spinner className="size-4" />
          {t('labels.loading')}
        </div>
      ) : orders.length === 0 ? (
        <div className="grid min-h-64 place-items-center px-6 text-center text-sm text-muted-foreground">
          {t('adminWorkspace.common.noResults')}
        </div>
      ) : null}
      {pagination ? (
        <WorkspacePagination
          currentPage={pagination.page}
          totalPages={pagination.totalPages}
          pending={ordersQuery.isFetching}
          onPageChange={changePage}
        />
      ) : null}
    </section>
  );
}
