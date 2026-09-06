'use client';

import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { MoreHorizontal, Package, Send } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useDeferredValue, useEffect, useState, useTransition } from 'react';

import { requestJson } from '../../lib/admin-api';
import { useAdminAiSurfaceDetails } from '../admin-ai-surface-context';
import type {
  EcotrackCatalogResponse,
  EcotrackDispatchBatchResponse,
  EcotrackShipmentDetail,
  EcotrackShipmentListItem,
  EcotrackShipmentsResponse,
  EcotrackShipmentSortDirection,
  EcotrackShipmentSortKey,
} from '../../lib/ecotrack-admin-contracts';
import { ORDER_STATUS, parseNumericAmount } from '../../lib/orders';
import { toast } from '../../lib/toast';
import type { SplitActionOption } from '../split-action-button';
import { buildEditableProducts } from './order-products-editor';
import {
  EcotrackActionDialogs,
  EcotrackEditDialog,
  type DeleteDialogState,
  type DispatchDialogState,
  type EditDialogState,
  type MajDialogState,
} from './orders-ecotrack-dialogs';
import {
  buildEcotrackFailureSummary as buildFailureSummary,
  formatEcotrackAmountInput as formatAmountInput,
} from './orders-ecotrack-presentation';
import { OrdersEcotrackWorkspace } from './orders-ecotrack-workspace';
import {
  criticalEcotrackToast,
  useEcotrackShipmentMutations,
} from './use-ecotrack-shipment-mutations';

type SortKey = EcotrackShipmentSortKey;
type SortDirection = EcotrackShipmentSortDirection;

type OrdersEcotrackManagerProps = {
  initialOrders?: EcotrackShipmentsResponse;
  initialCatalog?: EcotrackCatalogResponse;
};

type RowPrimaryAction = {
  label: string;
  icon: React.ReactNode;
  onPrimaryClick: () => void | Promise<void>;
};

const ECOTRACK_STATUSES = [
  'prete_a_expedier',
  'en_ramassage',
  'en_preparation_stock',
  'vers_hub',
  'en_hub',
  'vers_wilaya',
  'en_preparation',
  'en_livraison',
  'suspendu',
  'livre_non_encaisse',
  'encaisse_non_paye',
  'paiements_prets',
  'payed',
  'paye_et_archive',
  'retour_chez_livreur',
  'retour_transit_entrepot',
  'retour_en_traitement',
  'retour_recu',
  'retour_archive',
  'annule',
] as const;

export function OrdersEcotrackManager({
  initialOrders,
  initialCatalog,
}: OrdersEcotrackManagerProps) {
  const t = useTranslations();
  const locale = useLocale();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(initialOrders?.pagination.page ?? 1);
  const [search, setSearch] = useState('');
  const [scanQuery, setScanQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [staleOnly, setStaleOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('createdAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [expandedIds, setExpandedIds] = useState<number[]>([]);
  const [editDialog, setEditDialog] = useState<EditDialogState | null>(null);
  const [isFinalizeSubmitting, setIsFinalizeSubmitting] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState<DeleteDialogState | null>(null);
  const [dispatchDialog, setDispatchDialog] = useState<DispatchDialogState | null>(null);
  const [majDialog, setMajDialog] = useState<MajDialogState | null>(null);
  const [isFilterPending, startFilterTransition] = useTransition();
  const deferredSearch = useDeferredValue(search);
  const deferredStatusFilter = useDeferredValue(statusFilter);
  const deferredStaleOnly = useDeferredValue(staleOnly);
  const [initialOrdersUpdatedAt] = useState(() => (initialOrders ? Date.now() : 0));
  const [initialCatalogUpdatedAt] = useState(() => (initialCatalog ? Date.now() : 0));
  useAdminAiSurfaceDetails({
    filters: {
      page,
      search: deferredSearch,
      status: deferredStatusFilter,
      staleOnly: deferredStaleOnly,
      sortKey,
      sortDirection,
    },
    selection: {
      entityType: 'order',
      ids: selectedIds,
      focusedId: editDialog?.orderId ?? expandedIds.at(-1) ?? null,
    },
  });

  const shipmentsQuery = useQuery({
    queryKey: [
      'ecotrack-shipments',
      page,
      deferredSearch,
      deferredStatusFilter,
      deferredStaleOnly,
      sortKey,
      sortDirection,
    ],
    queryFn: ({ signal }) =>
      requestJson<EcotrackShipmentsResponse>(
        `/api/orders/ecotrack/shipments?page=${page}&limit=25&search=${encodeURIComponent(deferredSearch)}&status=${encodeURIComponent(deferredStatusFilter)}&staleOnly=${deferredStaleOnly ? 'true' : 'false'}&sortKey=${sortKey}&sortDirection=${sortDirection}`,
        { signal },
      ),
    initialData: initialOrders,
    initialDataUpdatedAt: initialOrdersUpdatedAt,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  const catalogQuery = useQuery({
    queryKey: ['ecotrack-catalog'],
    queryFn: () => requestJson<EcotrackCatalogResponse>('/api/ecotrack/catalog'),
    initialData: initialCatalog,
    initialDataUpdatedAt: initialCatalogUpdatedAt,
    staleTime: 300_000,
  });

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
  }, [page, pagination.page, shipmentsQuery.isFetching]);

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

  const openEditDialogForItem = (item: EcotrackShipmentListItem, mode: EditDialogState['mode']) => {
    setEditDialog({
      mode,
      orderId: item.orderId,
      fullName: item.fullName,
      firstName: item.firstName ?? '',
      lastName: item.lastName ?? '',
      phoneNumber1: item.phoneNumber1,
      phoneNumber2: item.phoneNumber2 ?? '',
      delivery: item.delivery,
      state: item.state === null ? '' : String(item.state),
      city: item.city ?? '',
      homeAddress: item.homeAddress ?? '',
      note: item.note ?? '',
      cartProducts: item.orderProducts.flatMap((product) =>
        Array.from(
          { length: product.quantity },
          () => product.rawValue ?? String(product.productId ?? product.title),
        ),
      ),
      editableProducts: buildEditableProducts({
        id: item.orderId,
        fullName: item.fullName,
        firstName: item.firstName,
        lastName: item.lastName,
        phoneNumber1: item.phoneNumber1,
        phoneNumber2: item.phoneNumber2,
        cartProducts: item.orderProducts.flatMap((product) =>
          Array.from(
            { length: product.quantity },
            () => product.rawValue ?? String(product.productId ?? product.title),
          ),
        ),
        orderProducts: item.orderProducts.map((product) => ({
          rawValue: product.rawValue ?? String(product.productId ?? product.title),
          productId: product.productId ?? null,
          title: product.title,
          unitPrice: product.unitPrice ?? product.lineTotal / Math.max(product.quantity, 1),
          quantity: product.quantity,
          lineTotal: product.lineTotal,
          thumbnailUrl: product.thumbnailUrl ?? null,
          missing: false,
        })),
        delivery: item.delivery,
        state: item.state,
        city: item.city,
        homeAddress: item.homeAddress,
        subtotalOverride: item.subtotalOverride,
        productSubtotal: item.productSubtotal,
        deliveryFee: item.deliveryFee,
        totalAmount: item.totalAmount,
        note: item.note,
        inHouseStatus: ORDER_STATUS.DISPATCHED,
        noAnswerCount: 0,
        confirmedBy: null,
        confirmedByName: null,
        confirmedAt: null,
        hasStatusHistory: false,
        statusHistory: [],
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      }),
      search: '',
      subtotalInput: formatAmountInput(item.productSubtotal),
      subtotalOverride: item.subtotalOverride,
      hasManualSubtotalOverride: item.subtotalOverride !== null,
      deliveryFeeInput: formatAmountInput(item.deliveryFee),
    });
  };

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
