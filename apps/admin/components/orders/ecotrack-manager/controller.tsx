'use client';
import { MoreHorizontal, Package, Send } from 'lucide-react';
import { useEffect } from 'react';
import { requestJson } from '../../../lib/admin-api';
import type {
  EcotrackDispatchBatchResponse,
  EcotrackShipmentDetail,
  EcotrackShipmentListItem,
  EcotrackShipmentsResponse,
} from '../../../lib/ecotrack-admin-contracts';
import { parseNumericAmount } from '../../../lib/orders';
import { toast } from '../../../lib/toast';
import type { SplitActionOption } from '../../split-action-button';
import { type EditDialogState } from '../orders-ecotrack-dialogs';
import { buildEcotrackFailureSummary as buildFailureSummary } from '../orders-ecotrack-presentation';
import {
  criticalEcotrackToast,
  useEcotrackShipmentMutations,
} from '../use-ecotrack-shipment-mutations';
import { type OrdersEcotrackManagerProps, type RowPrimaryAction } from './contract';
import { createShipmentEditor } from './shipment-editor';
import { useShipmentQueries } from './use-shipment-queries';

export function useOrdersEcotrackManager({
  initialOrders,
  initialCatalog,
}: OrdersEcotrackManagerProps) {
  const {
    setEditDialog,
    setScanQuery,
    setDeleteDialog,
    setSelectedIds,
    setExpandedIds,
    setDispatchDialog,
    setMajDialog,
    shipmentsQuery,
    selectedIds,
    queryClient,
    page,
    setPage,
    editDialog,
    t,
    setIsFinalizeSubmitting,
    scanQuery,
    locale,
    isFilterPending,
    search,
    statusFilter,
    staleOnly,
    sortKey,
    sortDirection,
    expandedIds,
    startFilterTransition,
    setSearch,
    setStatusFilter,
    setStaleOnly,
    setSortKey,
    setSortDirection,
    catalogQuery,
    isFinalizeSubmitting,
    deleteDialog,
    dispatchDialog,
    majDialog,
  } = useShipmentQueries({ initialOrders, initialCatalog });

  const {
    invalidateShipmentQueries,
    refreshManyMutation,
    updateMutation,
    scanLookupMutation,
    recreateMutation,
    deleteMutation,
    dispatchMutation,
    majMutation,
    returnMutation,
    bulkLabelsMutation,
  } = useEcotrackShipmentMutations({
    onEditComplete: () => setEditDialog(null),
    onScanComplete: (item) => {
      setScanQuery('');
      openEditDialogForItem(item, 'finalize');
    },
    onDeleteComplete: (orderId) => {
      setDeleteDialog(null);
      setSelectedIds((current) => current.filter((entry) => entry !== orderId));
      setExpandedIds((current) => current.filter((entry) => entry !== orderId));
    },
    onDispatchComplete: () => setDispatchDialog(null),
    onMajComplete: () => setMajDialog(null),
  });

  const items = shipmentsQuery.data?.items ?? [];
  const writable = shipmentsQuery.data?.writable ?? false;
  const pagination = shipmentsQuery.data?.pagination ?? {
    page: 1,
    limit: 25,
    totalItems: 0,
    totalPages: 1,
    hasNextPage: false,
    hasPreviousPage: false,
  };
  const selectedShipments = (() => {
    const selectedIdSet = new Set(selectedIds);
    const selectedShipmentById = new Map<number, EcotrackShipmentListItem>();

    queryClient
      .getQueriesData<EcotrackShipmentsResponse>({ queryKey: ['ecotrack-shipments'] })
      .forEach(([, data]) => {
        data?.items.forEach((item) => {
          if (selectedIdSet.has(item.orderId) && !selectedShipmentById.has(item.orderId)) {
            selectedShipmentById.set(item.orderId, item);
          }
        });
      });

    return selectedIds
      .map((orderId) => selectedShipmentById.get(orderId))
      .filter((item): item is EcotrackShipmentListItem => item !== undefined);
  })();
  const isInitialLoading = !shipmentsQuery.data && shipmentsQuery.isPending;
  const showRefreshingProgress = shipmentsQuery.isFetching && !isInitialLoading;

  useEffect(() => {
    if (page !== pagination.page && !shipmentsQuery.isFetching) {
      queueMicrotask(() => setPage(pagination.page));
    }
  }, [page, pagination.page, shipmentsQuery.isFetching, setPage]);

  const buildEditPayload = (current: EditDialogState) => ({
    firstName: current.firstName,
    lastName: current.lastName,
    phoneNumber1: current.phoneNumber1,
    phoneNumber2: current.phoneNumber2 || null,
    delivery: current.delivery,
    state: current.state ? Number.parseInt(current.state, 10) : null,
    city: current.city,
    homeAddress: current.homeAddress,
    note: current.note || null,
    cartProducts: current.editableProducts.map((item) => item.rawValue.trim()).filter(Boolean),
    deliveryFee: parseNumericAmount(current.deliveryFeeInput),
    subtotalOverride: current.hasManualSubtotalOverride
      ? parseNumericAmount(current.subtotalInput || '0')
      : null,
  });

  const handleSaveEdit = async ({
    dispatchAfterSave = false,
  }: { dispatchAfterSave?: boolean } = {}) => {
    if (!editDialog) {
      return;
    }

    const payload = buildEditPayload(editDialog);

    if (editDialog.mode === 'recreate') {
      try {
        await recreateMutation.mutateAsync({
          orderId: editDialog.orderId,
          payload,
        });
      } catch {}
      return;
    }

    if (dispatchAfterSave && editDialog.mode === 'finalize') {
      const toastId = toast.loading(t('ordersEcotrackManager.notifications.finalize.loading'));
      let saved = false;
      setIsFinalizeSubmitting(true);

      try {
        await requestJson<{ ok: true; item: EcotrackShipmentDetail }>(
          `/api/orders/ecotrack/shipments/${editDialog.orderId}`,
          {
            method: 'PATCH',
            body: JSON.stringify(payload),
          },
        );
        saved = true;

        const dispatchResponse = await requestJson<EcotrackDispatchBatchResponse>(
          '/api/orders/ecotrack/shipments/dispatch',
          {
            method: 'POST',
            body: JSON.stringify({ orderIds: [editDialog.orderId], askCollection: false }),
          },
        );

        await invalidateShipmentQueries(editDialog.orderId);
        await queryClient.invalidateQueries({ queryKey: ['orders-table'] });

        if (dispatchResponse.failureCount > 0) {
          setEditDialog(null);
          criticalEcotrackToast(
            t('ordersEcotrackManager.notifications.finalize.partialFailure', {
              message:
                buildFailureSummary(dispatchResponse.failures, 1) ||
                t('ordersEcotrackManager.notifications.dispatch.error'),
            }),
            toastId,
          );
          return;
        }

        setEditDialog(null);
        toast.success(t('ordersEcotrackManager.notifications.finalize.success'), { id: toastId });
      } catch (error) {
        criticalEcotrackToast(
          saved
            ? t('ordersEcotrackManager.notifications.finalize.partialFailure', {
                message:
                  error instanceof Error
                    ? error.message
                    : t('ordersEcotrackManager.notifications.dispatch.error'),
              })
            : error instanceof Error
              ? error.message
              : t('ordersEcotrackManager.notifications.finalize.error'),
          toastId,
        );
      } finally {
        setIsFinalizeSubmitting(false);
      }
      return;
    }

    try {
      await updateMutation.mutateAsync({
        orderId: editDialog.orderId,
        payload,
      });
    } catch {}
  };

  const dispatchableVisibleIds = items
    .filter((item) => item.canDispatch)
    .map((item) => item.orderId);
  const dispatchableSelectedIds = selectedShipments
    .filter((item) => item.canDispatch)
    .map((item) => item.orderId);

  const toggleHistoryForIds = (orderIds: number[]) => {
    if (orderIds.length === 0) {
      return;
    }

    setExpandedIds((current) => {
      const allExpanded = orderIds.every((orderId) => current.includes(orderId));
      return allExpanded
        ? current.filter((orderId) => !orderIds.includes(orderId))
        : [...new Set([...current, ...orderIds])];
    });
  };

  const openDispatchDialog = (orderIds: number[], label: string) => {
    if (orderIds.length === 0) {
      return;
    }

    setDispatchDialog({
      orderIds,
      label,
      count: orderIds.length,
      askCollection: false,
    });
  };

  const handleBulkLabels = async () => {
    if (selectedIds.length === 0) {
      return;
    }

    await bulkLabelsMutation.mutateAsync(selectedIds);
  };
  const { openEditDialogForItem } = createShipmentEditor({ setEditDialog });

  const handleScanSubmit = async () => {
    const normalized = scanQuery.trim();
    if (!normalized || scanLookupMutation.isPending) {
      return;
    }

    try {
      await scanLookupMutation.mutateAsync(normalized);
    } catch {}
  };

  const buildRowActionModel = (
    item: EcotrackShipmentListItem,
    expanded: boolean,
  ): {
    primary: RowPrimaryAction;
    options: SplitActionOption[];
  } => {
    const options: SplitActionOption[] = [];

    if (item.canEdit) {
      options.push({
        key: `edit-${item.orderId}`,
        label: t('actions.edit'),
        disabled: !writable,
        onSelect: () => openEditDialogForItem(item, 'edit'),
      });
    }

    if (item.canEditAndRecreate) {
      options.push({
        key: `recreate-${item.orderId}`,
        label: t('ordersEcotrackManager.actions.editAndRecreate'),
        disabled: !writable,
        onSelect: () => openEditDialogForItem(item, 'recreate'),
      });
    }

    if (item.canDelete) {
      options.push({
        key: `delete-${item.orderId}`,
        label: t('actions.delete'),
        disabled: !writable,
        onSelect: () => setDeleteDialog({ orderId: item.orderId, fullName: item.fullName }),
      });
    }

    if (item.canDispatch) {
      options.push({
        key: `dispatch-${item.orderId}`,
        label: t('ordersEcotrackManager.actions.dispatch'),
        disabled: !writable,
        onSelect: () => openDispatchDialog([item.orderId], item.fullName),
      });
    }

    if (item.canAddMaj) {
      options.push({
        key: `maj-${item.orderId}`,
        label: t('ordersEcotrackManager.actions.maj'),
        disabled: !writable,
        onSelect: () =>
          setMajDialog({ orderId: item.orderId, fullName: item.fullName, content: '' }),
      });
    }

    if (item.canAskReturn) {
      options.push({
        key: `return-${item.orderId}`,
        label: t('ordersEcotrackManager.actions.return'),
        disabled: !writable,
        onSelect: () => {
          if (!window.confirm(t('ordersEcotrackManager.confirmations.return'))) {
            return;
          }

          returnMutation.mutate(item.orderId);
        },
      });
    }

    options.push({
      key: `refresh-${item.orderId}`,
      label: t('ordersEcotrackManager.actions.refresh'),
      onSelect: () => refreshManyMutation.mutate({ orderIds: [item.orderId] }),
    });

    if (item.canPrintLabel) {
      options.push({
        key: `label-${item.orderId}`,
        label: t('ordersEcotrackManager.actions.label'),
        onSelect: async () => {
          await bulkLabelsMutation.mutateAsync([item.orderId]);
        },
      });
    }

    options.push({
      key: `history-${item.orderId}`,
      label: t(
        expanded
          ? 'ordersEcotrackManager.actions.hideHistory'
          : 'ordersEcotrackManager.actions.showHistory',
      ),
      onSelect: () => toggleHistoryForIds([item.orderId]),
    });

    if (item.canDispatch) {
      return {
        primary: {
          label: t('ordersEcotrackManager.actions.dispatch'),
          icon: <Send data-icon="inline-start" />,
          onPrimaryClick: () => openDispatchDialog([item.orderId], item.fullName),
        },
        options,
      };
    }

    if (item.canAddMaj) {
      return {
        primary: {
          label: t('ordersEcotrackManager.actions.maj'),
          icon: <Package data-icon="inline-start" />,
          onPrimaryClick: () =>
            setMajDialog({ orderId: item.orderId, fullName: item.fullName, content: '' }),
        },
        options,
      };
    }

    return {
      primary: {
        label: t('labels.actions'),
        icon: <MoreHorizontal data-icon="inline-start" />,
        onPrimaryClick: () => refreshManyMutation.mutate({ orderIds: [item.orderId] }),
      },
      options,
    };
  };

  return {
    view: {
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
    } as const,
    fallback: null,
  };
}
