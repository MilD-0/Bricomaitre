'use client';
import { EcotrackActionDialogs, EcotrackEditDialog } from '../orders-ecotrack-dialogs';
import { OrdersEcotrackWorkspace } from '../orders-ecotrack-workspace';
import { ECOTRACK_STATUSES, type useOrdersEcotrackManager } from './use-ecotrack-manager';

export function OrdersEcotrackManagerView({
  locale,
  items,
  pagination,
  writable,
  isInitialLoading,
  isFilterPending,
  showRefreshingProgress,
  shipmentsQuery,
  search,
  scanQuery,
  statusFilter,
  staleOnly,
  sortKey,
  sortDirection,
  selectedIds,
  expandedIds,
  scanLookupMutation,
  startFilterTransition,
  setPage,
  setSearch,
  setScanQuery,
  handleScanSubmit,
  setStatusFilter,
  setStaleOnly,
  setSortKey,
  setSortDirection,
  setSelectedIds,
  setExpandedIds,
  refreshManyMutation,
  handleBulkLabels,
  openDispatchDialog,
  dispatchableVisibleIds,
  t,
  dispatchableSelectedIds,
  toggleHistoryForIds,
  buildRowActionModel,
  editDialog,
  catalogQuery,
  updateMutation,
  recreateMutation,
  isFinalizeSubmitting,
  setEditDialog,
  handleSaveEdit,
  deleteDialog,
  dispatchDialog,
  majDialog,
  deleteMutation,
  dispatchMutation,
  majMutation,
  setDeleteDialog,
  setDispatchDialog,
  setMajDialog,
}: NonNullable<ReturnType<typeof useOrdersEcotrackManager>['view']>) {
  return (
    <>
      <OrdersEcotrackWorkspace
        locale={locale}
        items={items}
        pagination={{
          page: pagination.page,
          totalPages: pagination.totalPages,
          total: pagination.totalItems,
        }}
        writable={writable}
        isInitialLoading={isInitialLoading}
        isRefreshing={isFilterPending || showRefreshingProgress}
        error={shipmentsQuery.isError ? shipmentsQuery.error.message : null}
        search={search}
        scanQuery={scanQuery}
        statusFilter={statusFilter}
        staleOnly={staleOnly}
        sortKey={sortKey}
        sortDirection={sortDirection}
        statuses={ECOTRACK_STATUSES}
        selectedIds={selectedIds}
        inspectedIds={expandedIds}
        scanPending={scanLookupMutation.isPending}
        onSearchChange={(value) => {
          startFilterTransition(() => {
            setPage(1);
            setSearch(value);
          });
        }}
        onScanQueryChange={setScanQuery}
        onScanSubmit={() => void handleScanSubmit()}
        onStatusChange={(value) => {
          startFilterTransition(() => {
            setPage(1);
            setStatusFilter(value);
          });
        }}
        onStaleOnlyChange={(value) => {
          startFilterTransition(() => {
            setPage(1);
            setStaleOnly(value);
          });
        }}
        onSortKeyChange={(value) => {
          startFilterTransition(() => {
            setPage(1);
            setSortKey(value);
          });
        }}
        onSortDirectionChange={(value) => {
          startFilterTransition(() => {
            setPage(1);
            setSortDirection(value);
          });
        }}
        onPageChange={setPage}
        onToggleSelected={(orderId, selected) => {
          setSelectedIds((current) =>
            selected ? [...new Set([...current, orderId])] : current.filter((id) => id !== orderId),
          );
        }}
        onToggleVisible={(selected) => {
          setSelectedIds((current) =>
            selected
              ? [...new Set([...current, ...items.map((item) => item.orderId)])]
              : current.filter((id) => !items.some((item) => item.orderId === id)),
          );
        }}
        onInspect={(orderId) => {
          setExpandedIds((current) =>
            current.includes(orderId)
              ? current.filter((id) => id !== orderId)
              : [...current.filter((id) => items.some((item) => item.orderId === id)), orderId],
          );
        }}
        onRefreshVisible={() =>
          refreshManyMutation.mutate({ orderIds: items.map((item) => item.orderId) })
        }
        onRefreshSelected={() => refreshManyMutation.mutate({ orderIds: selectedIds })}
        onPrintSelected={() => void handleBulkLabels()}
        onClearSelection={() => setSelectedIds([])}
        onDispatchReady={() =>
          openDispatchDialog(
            dispatchableVisibleIds,
            t('ordersEcotrackManager.actions.dispatchReady'),
          )
        }
        onDispatchSelected={() =>
          openDispatchDialog(
            dispatchableSelectedIds,
            t('ordersEcotrackManager.actions.dispatchSelected'),
          )
        }
        onShowSelectedHistory={() => toggleHistoryForIds(selectedIds)}
        buildRowActionModel={buildRowActionModel}
      />

      <EcotrackEditDialog
        state={editDialog}
        catalog={catalogQuery.data}
        pending={updateMutation.isPending || recreateMutation.isPending || isFinalizeSubmitting}
        onChange={(updater) => setEditDialog((current) => (current ? updater(current) : current))}
        onClose={() => setEditDialog(null)}
        onSave={(dispatchAfterSave) => void handleSaveEdit({ dispatchAfterSave })}
      />
      <EcotrackActionDialogs
        deleteState={deleteDialog}
        dispatchState={dispatchDialog}
        majState={majDialog}
        deleting={deleteMutation.isPending}
        dispatching={dispatchMutation.isPending}
        postingUpdate={majMutation.isPending}
        onDeleteClose={() => setDeleteDialog(null)}
        onDelete={(orderId) => deleteMutation.mutate(orderId)}
        onDispatchChange={(updater) =>
          setDispatchDialog((current) => (current ? updater(current) : current))
        }
        onDispatchClose={() => setDispatchDialog(null)}
        onDispatch={(state) =>
          dispatchMutation.mutate({
            orderIds: state.orderIds,
            askCollection: state.askCollection,
          })
        }
        onMajChange={(updater) => setMajDialog((current) => (current ? updater(current) : current))}
        onMajClose={() => setMajDialog(null)}
        onMaj={(state) => majMutation.mutate(state)}
      />
    </>
  );
}
