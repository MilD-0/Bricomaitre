'use client';
import { ChevronLeft, ChevronRight, SlidersHorizontal } from 'lucide-react';
import { getOrderStatusLabelKey, type OrderStatus } from '../../../lib/orders';
import { cn } from '../../../lib/utils';
import { SearchField } from '../../search-field';
import { Button } from '../../ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../../ui/dialog';
import { NativeSelect } from '../../ui/native-select';
import { Spinner } from '../../ui/spinner';
import {
  WorkspaceActions,
  WorkspaceFrame,
  WorkspaceHeader,
  WorkspaceHeading,
  WorkspaceToolbar,
} from '../../ui/workspace';
import { OrderEditor } from '../order-editor';
import { OrderSalesDesk } from '../order-sales-desk';
import { OrdersPulse } from '../orders-pulse';
import { OrdersWorkflows } from '../orders-workflows';
import { orderStatusOptions } from '../orders-workspace-presenters';
import { OrderQueue } from './order-queue';
import { ordersOverviewQueryKey, type useOrdersWorkspace } from './use-workspace';

export function OrdersWorkspaceView({
  t,
  pagination,
  orders,
  operatorId,
  initialCatalog,
  writable,
  openOrderById,
  setOpenedOrder,
  focusOrder,
  queryClient,
  overviewQuery,
  projectionBasis,
  changeProjectionBasis,
  search,
  setSearch,
  setPage,
  setSelectedIds,
  setActiveOrderId,
  statusFilter,
  mobileFiltersOpen,
  selectStatusFilter,
  activeFilterCount,
  setMobileFiltersOpen,
  selectedOrders,
  activeOrderId,
  activeOrder,
  ordersQuery,
  allVisibleSelected,
  noAnswerAttemptFilter,
  selectNoAnswerAttemptFilter,
  selectedIds,
  bulkStatus,
  bulkStatusMutation,
  setBulkStatus,
  locale,
  storefrontBaseUrl,
  copyTrackingLink,
  setDeleteTarget,
  changePage,
  returnToQueue,
  patchMutation,
  saveOrder,
  deleteTarget,
  deleteMutation,
}: NonNullable<ReturnType<typeof useOrdersWorkspace>['view']>) {
  return (
    <>
      <WorkspaceFrame className="overflow-hidden" data-admin-workspace="orders">
        <WorkspaceHeader>
          <WorkspaceHeading
            title={t('nav.orders')}
            meta={t('adminWorkspace.orders.resultCount', {
              count: pagination?.totalItems ?? orders.length,
            })}
          />
          <WorkspaceActions>
            <OrderSalesDesk
              operatorId={operatorId}
              catalog={initialCatalog}
              writable={writable}
              onOpenOrder={(id) => void openOrderById(id)}
              onCreated={async (order) => {
                setOpenedOrder(order);
                focusOrder(order.id);
                void queryClient.invalidateQueries({ queryKey: ordersOverviewQueryKey });
                await queryClient.invalidateQueries({ queryKey: ['orders-workspace'] });
              }}
            />
          </WorkspaceActions>
        </WorkspaceHeader>
        <OrdersPulse
          overview={overviewQuery.data?.overview}
          projectionBasis={projectionBasis}
          loading={overviewQuery.isPending || overviewQuery.isFetching}
          onProjectionBasisChange={changeProjectionBasis}
        />
        <WorkspaceToolbar className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
          <SearchField
            value={search}
            label={t('adminWorkspace.common.search')}
            placeholder={t('adminWorkspace.orders.searchPlaceholder')}
            className="flex-1"
            onChange={(value) => {
              setSearch(value);
              setPage(1);
              setSelectedIds([]);
              setActiveOrderId(null);
            }}
          />
          <NativeSelect
            value={statusFilter}
            className={cn(
              'order-last w-full sm:order-none sm:block sm:w-56',
              mobileFiltersOpen ? 'block' : 'hidden',
            )}
            aria-label={t('ordersManager.filters.statusLabel')}
            onChange={(event) => {
              selectStatusFilter(
                event.target.value === 'all' ? 'all' : (Number(event.target.value) as OrderStatus),
              );
            }}
          >
            <option value="all">{t('ordersManager.filters.allStatuses')}</option>
            {orderStatusOptions.map((status) => (
              <option key={status} value={status}>
                {t(`ordersManager.status.${getOrderStatusLabelKey(status)}`)}
              </option>
            ))}
          </NativeSelect>
          <Button
            type="button"
            size="sm"
            variant={mobileFiltersOpen || activeFilterCount > 0 ? 'default' : 'outline'}
            className="sm:hidden"
            aria-expanded={mobileFiltersOpen}
            onClick={() => setMobileFiltersOpen((open) => !open)}
          >
            <SlidersHorizontal className="size-4" aria-hidden="true" />
            {t('adminWorkspace.common.filters')}
            {activeFilterCount > 0 ? ` · ${activeFilterCount}` : ''}
          </Button>
        </WorkspaceToolbar>

        <OrdersWorkflows
          selectedOrders={selectedOrders}
          writable={writable}
          onOrdersChanged={async () => {
            await Promise.all([
              queryClient.invalidateQueries({ queryKey: ['orders-workspace'] }),
              queryClient.invalidateQueries({ queryKey: ['orders-workspace-detail'] }),
            ]);
          }}
        />

        <div className="grid min-h-0 lg:min-h-[680px] lg:grid-cols-[minmax(22rem,0.84fr)_minmax(28rem,1.16fr)]">
          <OrderQueue
            t={t}
            activeOrderId={activeOrderId}
            activeOrder={activeOrder}
            ordersQuery={ordersQuery}
            allVisibleSelected={allVisibleSelected}
            setSelectedIds={setSelectedIds}
            orders={orders}
            selectStatusFilter={selectStatusFilter}
            statusFilter={statusFilter}
            noAnswerAttemptFilter={noAnswerAttemptFilter}
            selectNoAnswerAttemptFilter={selectNoAnswerAttemptFilter}
            selectedIds={selectedIds}
            bulkStatus={bulkStatus}
            writable={writable}
            bulkStatusMutation={bulkStatusMutation}
            setBulkStatus={setBulkStatus}
            locale={locale}
            storefrontBaseUrl={storefrontBaseUrl}
            focusOrder={focusOrder}
            initialCatalog={initialCatalog}
            copyTrackingLink={copyTrackingLink}
            setDeleteTarget={setDeleteTarget}
            pagination={pagination}
            changePage={changePage}
          />

          <aside
            className={cn(
              'min-w-0 bg-card/20 lg:sticky lg:top-4 lg:block lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto',
              activeOrderId !== null && activeOrder !== null ? 'block' : 'hidden',
            )}
          >
            <div className="border-b border-border/60 px-3 py-2 lg:hidden">
              <Button type="button" size="sm" variant="outline" onClick={returnToQueue}>
                <ChevronLeft className="size-4 rtl:hidden" aria-hidden="true" />
                <ChevronRight className="hidden size-4 rtl:block" aria-hidden="true" />
                {t('adminWorkspace.orders.queue')}
              </Button>
            </div>
            <OrderEditor
              order={activeOrder}
              catalog={initialCatalog}
              writable={writable}
              pending={patchMutation.isPending}
              onSave={saveOrder}
            />
          </aside>
        </div>
      </WorkspaceFrame>
      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('notifications.orders.delete.confirm')}</DialogTitle>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={deleteMutation.isPending}
              onClick={() => setDeleteTarget(null)}
            >
              {t('actions.cancel')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={!deleteTarget || deleteMutation.isPending}
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget)}
            >
              {deleteMutation.isPending ? <Spinner className="size-4" /> : null}
              {t('actions.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
