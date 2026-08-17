'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  History,
  MapPin,
  MoreHorizontal,
  Package,
  Printer,
  RefreshCw,
  Save,
  Search,
  Send,
  Trash2,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useLocale, useTranslations } from 'next-intl';
import { Fragment, useDeferredValue, useEffect, useMemo, useState, useTransition } from 'react';

import { requestJson } from '../../lib/admin-api';
import type {
  EcotrackCatalogResponse,
  EcotrackDispatchBatchResponse,
  EcotrackLabelsResponse,
  EcotrackRefreshBatchResponse,
  EcotrackShipmentDetail,
  EcotrackShipmentListItem,
  EcotrackShipmentsResponse,
  EcotrackShipmentSortDirection,
  EcotrackShipmentSortKey,
} from '../../lib/ecotrack-admin-contracts';
import {
  formatOrderPhoneForDisplay,
  resolveEcotrackDeliveryFee,
} from '../../lib/order-presentation';
import { parseNumericAmount } from '../../lib/orders';
import { cn } from '../../lib/utils';
import { toast } from '../../lib/toast';
import { SearchField } from '../search-field';
import { SplitActionButton, type SplitActionOption } from '../split-action-button';
import {
  buildEditableProducts,
  OrderProductsEditor,
  summarizeEditableProducts,
  type EditableOrderProduct,
  type ProductSearchItem,
} from './order-products-editor';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { Checkbox } from '../ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '../ui/empty';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '../ui/field';
import { Input } from '../ui/input';
import { PendingInline, sectionTransitionProps, SurfacePendingOverlay } from '../ui/motion';
import { NativeSelect, NativeSelectOption } from '../ui/native-select';
import { Switch } from '../ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Textarea } from '../ui/textarea';
import { TablePaginationControls } from '../table-pagination-controls';
import {
  buildEcotrackFailureSummary as buildFailureSummary,
  formatEcotrackAmountInput as formatAmountInput,
  formatEcotrackDateTime as formatDateTime,
  formatEcotrackMoney as formatMoney,
  getEcotrackDeliveryLabelKey as getDeliveryLabelKey,
} from './orders-ecotrack-presentation';
import {
  EcotrackShipmentHistoryPanel as ShipmentHistoryPanel,
  EcotrackStatusBadge as StatusBadge,
  OrdersEcotrackMobileSkeleton,
  OrdersEcotrackTableSkeleton,
} from './orders-ecotrack-status';

type SortKey = EcotrackShipmentSortKey;
type SortDirection = EcotrackShipmentSortDirection;

type OrdersEcotrackManagerProps = {
  initialOrders?: EcotrackShipmentsResponse;
  initialCatalog?: EcotrackCatalogResponse;
};

type EditDialogState = {
  mode: 'edit' | 'recreate' | 'finalize';
  orderId: number;
  fullName: string;
  firstName: string;
  lastName: string;
  phoneNumber1: string;
  phoneNumber2: string;
  delivery: 0 | 1;
  state: string;
  city: string;
  homeAddress: string;
  note: string;
  cartProducts: string[];
  editableProducts: EditableOrderProduct[];
  search: string;
  subtotalInput: string;
  subtotalOverride: number | null;
  hasManualSubtotalOverride: boolean;
  deliveryFeeInput: string;
};

type DispatchDialogState = {
  orderIds: number[];
  label: string;
  count: number;
  askCollection: boolean;
};

type RowPrimaryAction = {
  label: string;
  icon: React.ReactNode;
  onPrimaryClick: () => void | Promise<void>;
};

type DeleteDialogState = {
  orderId: number;
  fullName: string;
};

type MajDialogState = {
  orderId: number;
  fullName: string;
  content: string;
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
  'paye_et_archive',
  'retour_chez_livreur',
  'retour_transit_entrepot',
  'retour_en_traitement',
  'retour_recu',
  'retour_archive',
  'annule',
] as const;

function openPdfBlob(blob: Blob) {
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener,noreferrer');
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 60_000);
}

function decodeBase64Pdf(base64: string) {
  const binary = window.atob(base64);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new Blob([bytes], { type: 'application/pdf' });
}

function criticalEcotrackToast(message: string, toastId?: string | null) {
  toast.criticalError(message, toastId ? { id: toastId } : undefined);
}

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
    queryFn: () =>
      requestJson<EcotrackShipmentsResponse>(
        `/api/orders/ecotrack/shipments?page=${page}&limit=25&search=${encodeURIComponent(deferredSearch)}&status=${encodeURIComponent(deferredStatusFilter)}&staleOnly=${deferredStaleOnly ? 'true' : 'false'}&sortKey=${sortKey}&sortDirection=${sortDirection}`,
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

  const invalidateShipmentQueries = async (orderId?: number) => {
    await queryClient.invalidateQueries({ queryKey: ['ecotrack-shipments'] });
    if (orderId) {
      await queryClient.invalidateQueries({ queryKey: ['ecotrack-shipment-detail', orderId] });
    }
  };

  const refreshManyMutation = useMutation({
    mutationFn: async ({ orderIds }: { orderIds: number[]; silent?: boolean }) => {
      return requestJson<EcotrackRefreshBatchResponse>('/api/orders/ecotrack/shipments/refresh', {
        method: 'POST',
        body: JSON.stringify({ orderIds }),
      });
    },
    onMutate: (variables) => ({
      toastId: variables.silent
        ? null
        : toast.loading(t('ordersEcotrackManager.notifications.refresh.loading')),
    }),
    onSuccess: async (response, variables, context) => {
      if (!variables.silent && context?.toastId) {
        if (response.failureCount === 0) {
          toast.success(t('ordersEcotrackManager.notifications.refresh.success'), {
            id: context.toastId,
          });
        } else if (response.successCount > 0) {
          criticalEcotrackToast(
            `${t('ordersEcotrackManager.notifications.refresh.partial', {
              successCount: response.successCount,
              failedCount: response.failureCount,
            })} ${buildFailureSummary(response.failures)}`.trim(),
            context.toastId,
          );
        } else {
          criticalEcotrackToast(
            `${t('ordersEcotrackManager.notifications.refresh.allFailed')} ${buildFailureSummary(response.failures)}`.trim(),
            context.toastId,
          );
        }
      }

      if (response.successCount > 0) {
        await invalidateShipmentQueries();
      }
    },
    onError: (error, variables, context) => {
      if (!variables.silent && context?.toastId) {
        criticalEcotrackToast(
          error.message || t('ordersEcotrackManager.notifications.refresh.error'),
          context.toastId,
        );
      }
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ orderId, payload }: { orderId: number; payload: Record<string, unknown> }) =>
      requestJson<{ ok: true; item: EcotrackShipmentDetail }>(
        `/api/orders/ecotrack/shipments/${orderId}`,
        {
          method: 'PATCH',
          body: JSON.stringify(payload),
        },
      ),
    onMutate: () => ({
      toastId: toast.loading(t('ordersEcotrackManager.notifications.update.loading')),
    }),
    onSuccess: async (_response, variables, context) => {
      toast.success(t('ordersEcotrackManager.notifications.update.success'), {
        id: context?.toastId,
      });
      setEditDialog(null);
      await invalidateShipmentQueries(variables.orderId);
    },
    onError: (error, _variables, context) => {
      criticalEcotrackToast(
        error.message || t('ordersEcotrackManager.notifications.update.error'),
        context?.toastId,
      );
    },
  });

  const scanLookupMutation = useMutation({
    mutationFn: async (trackingNumber: string) => {
      const normalized = trackingNumber.trim().toLowerCase();
      const response = await requestJson<EcotrackShipmentsResponse>(
        `/api/orders/ecotrack/shipments?page=1&limit=25&search=${encodeURIComponent(trackingNumber)}&status=all&staleOnly=false&sortKey=createdAt&sortDirection=desc`,
      );
      const item = response.items.find(
        (entry) => entry.trackingNumber.trim().toLowerCase() === normalized,
      );

      if (!item) {
        throw new Error(
          t('ordersEcotrackManager.notifications.scan.notFound', {
            trackingNumber: trackingNumber.trim(),
          }),
        );
      }

      return item;
    },
    onMutate: () => ({
      toastId: toast.loading(t('ordersEcotrackManager.notifications.scan.loading')),
    }),
    onSuccess: (item, _trackingNumber, context) => {
      if (!(item.canEdit && item.canDispatch)) {
        criticalEcotrackToast(
          t('ordersEcotrackManager.notifications.scan.notDispatchable', {
            trackingNumber: item.trackingNumber,
            status: t(`ordersEcotrackManager.statuses.${item.status.currentStatus}`),
          }),
          context?.toastId,
        );
        return;
      }

      toast.success(
        t('ordersEcotrackManager.notifications.scan.success', {
          trackingNumber: item.trackingNumber,
        }),
        { id: context?.toastId },
      );
      setScanQuery('');
      openEditDialogForItem(item, 'finalize');
    },
    onError: (error, _trackingNumber, context) => {
      criticalEcotrackToast(
        error.message || t('ordersEcotrackManager.notifications.scan.error'),
        context?.toastId,
      );
    },
  });

  const recreateMutation = useMutation({
    mutationFn: ({ orderId, payload }: { orderId: number; payload: Record<string, unknown> }) =>
      requestJson<{ ok: true; item: EcotrackShipmentDetail }>(
        `/api/orders/ecotrack/shipments/${orderId}/recreate`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
      ),
    onMutate: () => ({
      toastId: toast.loading(t('ordersEcotrackManager.notifications.recreate.loading')),
    }),
    onSuccess: async (_response, variables, context) => {
      toast.success(t('ordersEcotrackManager.notifications.recreate.success'), {
        id: context?.toastId,
      });
      setEditDialog(null);
      await invalidateShipmentQueries(variables.orderId);
      await queryClient.invalidateQueries({ queryKey: ['orders-table'] });
    },
    onError: (error, _variables, context) => {
      criticalEcotrackToast(
        error.message || t('ordersEcotrackManager.notifications.recreate.error'),
        context?.toastId,
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (orderId: number) =>
      requestJson<{ ok: true }>(`/api/orders/ecotrack/shipments/${orderId}`, { method: 'DELETE' }),
    onMutate: () => ({
      toastId: toast.loading(t('ordersEcotrackManager.notifications.delete.loading')),
    }),
    onSuccess: async (_response, orderId, context) => {
      toast.success(t('ordersEcotrackManager.notifications.delete.success'), {
        id: context?.toastId,
      });
      setDeleteDialog(null);
      setSelectedIds((current) => current.filter((entry) => entry !== orderId));
      setExpandedIds((current) => current.filter((entry) => entry !== orderId));
      await invalidateShipmentQueries(orderId);
      await queryClient.invalidateQueries({ queryKey: ['orders-table'] });
    },
    onError: (error, _variables, context) => {
      criticalEcotrackToast(
        error.message || t('ordersEcotrackManager.notifications.delete.error'),
        context?.toastId,
      );
    },
  });

  const dispatchMutation = useMutation({
    mutationFn: ({ orderIds, askCollection }: { orderIds: number[]; askCollection: boolean }) =>
      requestJson<EcotrackDispatchBatchResponse>('/api/orders/ecotrack/shipments/dispatch', {
        method: 'POST',
        body: JSON.stringify({ orderIds, askCollection }),
      }),
    onMutate: () => ({
      toastId: toast.loading(t('ordersEcotrackManager.notifications.dispatch.loading')),
    }),
    onSuccess: async (response, variables, context) => {
      if (response.failureCount > 0 && response.successCount > 0) {
        criticalEcotrackToast(
          `${t('ordersEcotrackManager.notifications.dispatch.partial', {
            successCount: response.successCount,
            failedCount: response.failureCount,
          })} ${buildFailureSummary(response.failures)}`.trim(),
          context?.toastId,
        );
      } else if (response.failureCount === 0) {
        toast.success(t('ordersEcotrackManager.notifications.dispatch.success'), {
          id: context?.toastId,
        });
      } else {
        criticalEcotrackToast(
          `${t('ordersEcotrackManager.notifications.dispatch.allFailed')} ${buildFailureSummary(response.failures)}`.trim(),
          context?.toastId,
        );
      }
      if (response.successCount > 0) {
        setDispatchDialog(null);
        await invalidateShipmentQueries();
        await queryClient.invalidateQueries({ queryKey: ['orders-table'] });
      }
    },
    onError: (error, _variables, context) => {
      criticalEcotrackToast(
        error.message || t('ordersEcotrackManager.notifications.dispatch.error'),
        context?.toastId,
      );
    },
  });

  const majMutation = useMutation({
    mutationFn: ({ orderId, content }: { orderId: number; content: string }) =>
      requestJson<{ ok: true; item: EcotrackShipmentDetail }>(
        `/api/orders/ecotrack/shipments/${orderId}/maj`,
        {
          method: 'POST',
          body: JSON.stringify({ content }),
        },
      ),
    onMutate: () => ({
      toastId: toast.loading(t('ordersEcotrackManager.notifications.maj.loading')),
    }),
    onSuccess: async (_response, variables, context) => {
      toast.success(t('ordersEcotrackManager.notifications.maj.success'), { id: context?.toastId });
      setMajDialog(null);
      await invalidateShipmentQueries(variables.orderId);
    },
    onError: (error, _variables, context) => {
      criticalEcotrackToast(
        error.message || t('ordersEcotrackManager.notifications.maj.error'),
        context?.toastId,
      );
    },
  });

  const returnMutation = useMutation({
    mutationFn: (orderId: number) =>
      requestJson<{ ok: true; item: EcotrackShipmentDetail }>(
        `/api/orders/ecotrack/shipments/${orderId}/return`,
        { method: 'POST' },
      ),
    onMutate: () => ({
      toastId: toast.loading(t('ordersEcotrackManager.notifications.return.loading')),
    }),
    onSuccess: async (_response, orderId, context) => {
      toast.success(t('ordersEcotrackManager.notifications.return.success'), {
        id: context?.toastId,
      });
      await invalidateShipmentQueries(orderId);
    },
    onError: (error, _orderId, context) => {
      criticalEcotrackToast(
        error.message || t('ordersEcotrackManager.notifications.return.error'),
        context?.toastId,
      );
    },
  });

  const bulkLabelsMutation = useMutation({
    mutationFn: async (orderIds: number[]) =>
      requestJson<EcotrackLabelsResponse>('/api/orders/ecotrack/shipments/labels', {
        method: 'POST',
        body: JSON.stringify({ orderIds }),
      }),
    onMutate: () => ({
      toastId: toast.loading(t('ordersEcotrackManager.notifications.labels.loading')),
    }),
    onSuccess: (response, _orderIds, context) => {
      if (response.pdfBase64) {
        openPdfBlob(decodeBase64Pdf(response.pdfBase64));
      }

      if (response.failureCount > 0 && response.successCount > 0) {
        criticalEcotrackToast(
          `${t('ordersEcotrackManager.notifications.labels.partial', {
            successCount: response.successCount,
            failedCount: response.failureCount,
          })} ${buildFailureSummary(response.failures)}`.trim(),
          context?.toastId,
        );
      } else if (response.successCount > 0) {
        toast.success(t('ordersEcotrackManager.notifications.labels.success'), {
          id: context?.toastId,
        });
      } else {
        criticalEcotrackToast(
          `${t('ordersEcotrackManager.notifications.labels.allFailed')} ${buildFailureSummary(response.failures)}`.trim(),
          context?.toastId,
        );
      }
    },
    onError: (error, _orderIds, context) => {
      criticalEcotrackToast(
        error.message || t('ordersEcotrackManager.notifications.labels.error'),
        context?.toastId,
      );
    },
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
  const allVisibleSelected =
    items.length > 0 && items.every((item) => selectedIds.includes(item.orderId));
  const isInitialLoading = !shipmentsQuery.data && shipmentsQuery.isPending;
  const showRefreshingProgress = shipmentsQuery.isFetching && !isInitialLoading;

  useEffect(() => {
    if (page !== pagination.page && !shipmentsQuery.isFetching) {
      queueMicrotask(() => setPage(pagination.page));
    }
  }, [page, pagination.page, shipmentsQuery.isFetching]);

  const communeOptions = (() => {
    if (!editDialog?.state || !catalogQuery.data) {
      return [];
    }

    const wilayaId = Number.parseInt(editDialog.state, 10);
    if (!Number.isInteger(wilayaId)) {
      return [];
    }

    return catalogQuery.data.communes.filter((entry) => entry.wilayaId === wilayaId);
  })();

  const selectedEditProducts = useMemo(
    () => (editDialog ? summarizeEditableProducts(editDialog.editableProducts) : []),
    [editDialog],
  );

  const derivedEditSubtotal = useMemo(
    () => selectedEditProducts.reduce((sum, product) => sum + product.lineTotal, 0),
    [selectedEditProducts],
  );

  const editSubtotalValue = editDialog
    ? parseNumericAmount(
        editDialog.subtotalInput ||
          (editDialog.hasManualSubtotalOverride ? '0' : String(derivedEditSubtotal)),
      )
    : 0;
  const editDeliveryFeeValue = editDialog ? parseNumericAmount(editDialog.deliveryFeeInput) : 0;
  const editTotalValue = editSubtotalValue + editDeliveryFeeValue;

  const updateEditDialog = (updater: (current: EditDialogState) => EditDialogState) => {
    setEditDialog((current) => (current ? updater(current) : current));
  };

  const applyDerivedDeliveryFee = (
    current: EditDialogState,
    nextDelivery: 0 | 1,
    nextState: string,
  ) => {
    const nextDeliveryFee = resolveEcotrackDeliveryFee(
      catalogQuery.data,
      nextDelivery,
      nextState,
      parseNumericAmount(current.deliveryFeeInput),
    );

    return {
      ...current,
      delivery: nextDelivery,
      state: nextState,
      deliveryFeeInput: formatAmountInput(nextDeliveryFee),
    };
  };

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
        confirmed: 3,
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
      <motion.section
        id="orders-ecotrack"
        className="scroll-mt-24 overflow-hidden rounded-[1.75rem] border border-border/70 bg-background/95 shadow-sm"
        {...sectionTransitionProps}
      >
        <div className="border-b border-border/70 bg-linear-to-b from-background to-muted/20 px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <h2 className="text-lg font-semibold">{t('nav.ecotrackShipments')}</h2>
              <PendingInline
                active={isFilterPending || shipmentsQuery.isFetching}
                label={t('labels.loading')}
              />
            </div>

            <div className="rounded-[1.5rem] border border-border/70 bg-background/90 p-3">
              <div className="flex flex-col gap-4">
                <form
                  className="flex flex-col gap-3 xl:flex-row xl:items-end"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void handleScanSubmit();
                  }}
                >
                  <Field className="w-full xl:max-w-sm">
                    <FieldLabel htmlFor="ecotrack-scan-tracking">
                      {t('ordersEcotrackManager.fields.scanTrackingNumber')}
                    </FieldLabel>
                    <Input
                      id="ecotrack-scan-tracking"
                      value={scanQuery}
                      disabled={!writable || scanLookupMutation.isPending}
                      placeholder={t('ordersEcotrackManager.fields.scanTrackingNumberPlaceholder')}
                      onChange={(event) => setScanQuery(event.target.value)}
                    />
                  </Field>
                  <Button
                    type="submit"
                    disabled={
                      !writable || scanLookupMutation.isPending || scanQuery.trim().length === 0
                    }
                  >
                    <Search data-icon="inline-start" />
                    {t('ordersEcotrackManager.actions.scanTrackingNumber')}
                  </Button>
                </form>

                <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
                  <SearchField
                    value={search}
                    placeholder={t('ordersEcotrackManager.searchPlaceholder')}
                    onChange={(value) => {
                      startFilterTransition(() => {
                        setPage(1);
                        setSearch(value);
                      });
                    }}
                  />
                  <NativeSelect
                    aria-label={t('ordersEcotrackManager.filters.statusLabel')}
                    className="w-full xl:w-56"
                    value={statusFilter}
                    onChange={(event) => {
                      startFilterTransition(() => {
                        setPage(1);
                        setStatusFilter(event.target.value);
                      });
                    }}
                  >
                    <NativeSelectOption value="all">
                      {t('ordersEcotrackManager.filters.allStatuses')}
                    </NativeSelectOption>
                    {ECOTRACK_STATUSES.map((status) => (
                      <NativeSelectOption key={status} value={status}>
                        {t(`ordersEcotrackManager.statuses.${status}`)}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                  <NativeSelect
                    aria-label={t('ordersEcotrackManager.filters.sortKeyLabel')}
                    className="w-full xl:w-56"
                    value={sortKey}
                    onChange={(event) => {
                      startFilterTransition(() => {
                        setPage(1);
                        setSortKey(event.target.value as SortKey);
                      });
                    }}
                  >
                    <NativeSelectOption value="createdAt">
                      {t('ordersEcotrackManager.sort.createdAt')}
                    </NativeSelectOption>
                    <NativeSelectOption value="trackingNumber">
                      {t('ordersEcotrackManager.sort.trackingNumber')}
                    </NativeSelectOption>
                    <NativeSelectOption value="clientName">
                      {t('ordersEcotrackManager.sort.clientName')}
                    </NativeSelectOption>
                    <NativeSelectOption value="currentStatus">
                      {t('ordersEcotrackManager.sort.currentStatus')}
                    </NativeSelectOption>
                    <NativeSelectOption value="lastStatusSyncedAt">
                      {t('ordersEcotrackManager.sort.lastStatusSyncedAt')}
                    </NativeSelectOption>
                  </NativeSelect>
                  <NativeSelect
                    aria-label={t('ordersEcotrackManager.filters.sortDirectionLabel')}
                    className="w-full xl:w-44"
                    value={sortDirection}
                    onChange={(event) => {
                      startFilterTransition(() => {
                        setPage(1);
                        setSortDirection(event.target.value as SortDirection);
                      });
                    }}
                  >
                    <NativeSelectOption value="desc">
                      {t('ordersEcotrackManager.sort.desc')}
                    </NativeSelectOption>
                    <NativeSelectOption value="asc">
                      {t('ordersEcotrackManager.sort.asc')}
                    </NativeSelectOption>
                  </NativeSelect>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <Badge variant="outline">
                    {t('labels.bulkSelectionCount', { count: selectedIds.length })}
                  </Badge>
                  <Field orientation="horizontal" className="gap-3">
                    <FieldLabel htmlFor="ecotrack-stale-only">
                      {t('ordersEcotrackManager.filters.staleOnly')}
                    </FieldLabel>
                    <Switch
                      id="ecotrack-stale-only"
                      checked={staleOnly}
                      onCheckedChange={(checked) => {
                        startFilterTransition(() => {
                          setPage(1);
                          setStaleOnly(checked);
                        });
                      }}
                    />
                  </Field>
                </div>

                <div className="flex flex-wrap gap-2">
                  <SplitActionButton
                    size="sm"
                    label={t('ordersEcotrackManager.actions.refreshVisible')}
                    icon={<RefreshCw data-icon="inline-start" />}
                    primaryDisabled={items.length === 0}
                    onPrimaryClick={() =>
                      refreshManyMutation.mutate({ orderIds: items.map((item) => item.orderId) })
                    }
                    options={[
                      {
                        key: 'refresh-selected',
                        label: t('ordersEcotrackManager.actions.refreshSelected'),
                        disabled: selectedIds.length === 0,
                        onSelect: () => refreshManyMutation.mutate({ orderIds: selectedIds }),
                      },
                    ]}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={selectedIds.length === 0}
                    onClick={() => void handleBulkLabels()}
                  >
                    <Printer data-icon="inline-start" />
                    {t('ordersEcotrackManager.actions.printSelected')}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={selectedIds.length === 0}
                    onClick={() => setSelectedIds([])}
                  >
                    {t('ordersEcotrackManager.actions.clearSelection')}
                  </Button>
                  <SplitActionButton
                    size="sm"
                    label={t('ordersEcotrackManager.actions.dispatchReady')}
                    icon={<Send data-icon="inline-start" />}
                    primaryDisabled={dispatchableVisibleIds.length === 0 || !writable}
                    onPrimaryClick={() =>
                      openDispatchDialog(
                        dispatchableVisibleIds,
                        t('ordersEcotrackManager.actions.dispatchReady'),
                      )
                    }
                    options={[
                      {
                        key: 'dispatch-selected',
                        label: t('ordersEcotrackManager.actions.dispatchSelected'),
                        disabled: dispatchableSelectedIds.length === 0 || !writable,
                        onSelect: () =>
                          openDispatchDialog(
                            dispatchableSelectedIds,
                            t('ordersEcotrackManager.actions.dispatchSelected'),
                          ),
                      },
                    ]}
                  />
                  <SplitActionButton
                    size="sm"
                    label={t('ordersEcotrackManager.actions.showHistorySelected')}
                    icon={<History data-icon="inline-start" />}
                    primaryDisabled={selectedIds.length === 0}
                    onPrimaryClick={() => toggleHistoryForIds(selectedIds)}
                    options={[
                      {
                        key: 'history-visible',
                        label: t('ordersEcotrackManager.actions.showHistoryVisible'),
                        disabled: items.length === 0,
                        onSelect: () => toggleHistoryForIds(items.map((item) => item.orderId)),
                      },
                    ]}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="relative" aria-busy={showRefreshingProgress}>
          <div
            className={cn(
              'transition-[opacity,filter] duration-200',
              showRefreshingProgress && 'opacity-70',
            )}
          >
            {isInitialLoading ? (
              <>
                <OrdersEcotrackTableSkeleton />
                <OrdersEcotrackMobileSkeleton />
              </>
            ) : null}

            {!isInitialLoading ? (
              <>
                {shipmentsQuery.isError ? (
                  <div className="px-4 pb-4 sm:px-5">
                    <Empty className="rounded-[1.5rem] border border-dashed border-border/70 bg-muted/20">
                      <EmptyHeader>
                        <EmptyTitle>{t('ordersEcotrackManager.empty.title')}</EmptyTitle>
                        <EmptyDescription>{shipmentsQuery.error.message}</EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  </div>
                ) : null}

                {!shipmentsQuery.isError && items.length === 0 ? (
                  <div className="px-4 pb-4 sm:px-5">
                    <Empty className="rounded-[1.5rem] border border-dashed border-border/70 bg-muted/20">
                      <EmptyHeader>
                        <EmptyTitle>{t('ordersEcotrackManager.empty.title')}</EmptyTitle>
                        <EmptyDescription>
                          {t('ordersEcotrackManager.empty.description')}
                        </EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  </div>
                ) : null}

                {items.length > 0 ? (
                  <>
                    <div className="hidden overflow-x-auto lg:block">
                      <Table>
                        <TableHeader>
                          <TableRow className="hover:bg-transparent">
                            <TableHead className="w-12">
                              <Checkbox
                                aria-label={t('labels.selectAll')}
                                checked={allVisibleSelected}
                                onChange={(event) => {
                                  setSelectedIds((current) =>
                                    event.target.checked
                                      ? [
                                          ...new Set([
                                            ...current,
                                            ...items.map((item) => item.orderId),
                                          ]),
                                        ]
                                      : current.filter(
                                          (id) => !items.some((item) => item.orderId === id),
                                        ),
                                  );
                                }}
                              />
                            </TableHead>
                            <TableHead className="min-w-44">
                              {t('ordersEcotrackManager.columns.trackingNumber')}
                            </TableHead>
                            <TableHead className="min-w-60">
                              {t('ordersEcotrackManager.columns.client')}
                            </TableHead>
                            <TableHead className="min-w-72">
                              {t('ordersEcotrackManager.columns.address')}
                            </TableHead>
                            <TableHead className="min-w-72">
                              {t('ordersEcotrackManager.columns.products')}
                            </TableHead>
                            <TableHead className="min-w-48">
                              {t('ordersEcotrackManager.columns.amount')}
                            </TableHead>
                            <TableHead className="min-w-56">
                              {t('ordersEcotrackManager.columns.status')}
                            </TableHead>
                            <TableHead className="min-w-80 text-center">
                              {t('labels.actions')}
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {items.map((item) => {
                            const expanded = expandedIds.includes(item.orderId);
                            const rowActionModel = buildRowActionModel(item, expanded);
                            const rowActionControl = (
                              <SplitActionButton
                                size="sm"
                                label={rowActionModel.primary.label}
                                icon={rowActionModel.primary.icon}
                                primaryDisabled={
                                  item.canDispatch || item.canAddMaj ? !writable : false
                                }
                                onPrimaryClick={rowActionModel.primary.onPrimaryClick}
                                options={rowActionModel.options}
                              />
                            );

                            return (
                              <Fragment key={item.orderId}>
                                <TableRow>
                                  <TableCell className="align-top">
                                    <Checkbox
                                      aria-label={t('labels.selectRow', { name: item.fullName })}
                                      checked={selectedIds.includes(item.orderId)}
                                      onChange={(event) => {
                                        setSelectedIds((current) =>
                                          event.target.checked
                                            ? [...new Set([...current, item.orderId])]
                                            : current.filter((id) => id !== item.orderId),
                                        );
                                      }}
                                    />
                                  </TableCell>
                                  <TableCell className="align-top">
                                    <p className="font-semibold">{item.trackingNumber}</p>
                                    <p className="mt-1 text-xs font-medium uppercase text-muted-foreground">
                                      {item.provider}
                                    </p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                      {t('ordersEcotrackManager.reference')}: {item.reference}
                                    </p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                      {formatDateTime(locale, item.createdAt)}
                                    </p>
                                  </TableCell>
                                  <TableCell className="align-top">
                                    <p className="font-semibold">{item.fullName}</p>
                                    <div className="mt-2 flex flex-col gap-1 text-sm text-muted-foreground">
                                      <p>{formatOrderPhoneForDisplay(item.phoneNumber1)}</p>
                                      {item.phoneNumber2 ? (
                                        <p>{formatOrderPhoneForDisplay(item.phoneNumber2)}</p>
                                      ) : null}
                                    </div>
                                  </TableCell>
                                  <TableCell className="align-top">
                                    <div className="flex items-start gap-2 text-sm text-muted-foreground">
                                      <MapPin className="mt-0.5 shrink-0" />
                                      <div className="flex flex-col gap-1">
                                        <p className="font-medium text-foreground">
                                          {item.homeAddress ||
                                            t('ordersEcotrackManager.missingValue')}
                                        </p>
                                        <p>
                                          {item.city || t('ordersEcotrackManager.missingValue')}
                                        </p>
                                        <p>
                                          {item.stateName ||
                                            item.state ||
                                            t('ordersEcotrackManager.missingValue')}
                                        </p>
                                        <Badge variant="outline" className="w-fit">
                                          {t(getDeliveryLabelKey(item.delivery))}
                                        </Badge>
                                      </div>
                                    </div>
                                  </TableCell>
                                  <TableCell className="align-top">
                                    <div className="flex flex-col gap-2">
                                      {item.orderProducts.length === 0 ? (
                                        <p className="text-sm text-muted-foreground">
                                          {t('ordersEcotrackManager.history.empty')}
                                        </p>
                                      ) : null}
                                      {item.orderProducts.map((product, index) => (
                                        <div
                                          key={`${item.orderId}-${index}`}
                                          className="flex items-center justify-between gap-3 text-sm"
                                        >
                                          <span className="text-foreground">{product.title}</span>
                                          <Badge variant="outline">x{product.quantity}</Badge>
                                        </div>
                                      ))}
                                    </div>
                                  </TableCell>
                                  <TableCell className="align-top">
                                    <div className="text-sm">
                                      <p>
                                        {t('ordersEcotrackManager.amounts.subtotal')}:{' '}
                                        <span className="font-medium">
                                          {formatMoney(locale, item.productSubtotal)}
                                        </span>
                                      </p>
                                      <p className="mt-1">
                                        {t('ordersEcotrackManager.amounts.deliveryFee')}:{' '}
                                        <span className="font-medium">
                                          {formatMoney(locale, item.deliveryFee)}
                                        </span>
                                      </p>
                                      <p className="mt-2 font-semibold">
                                        {t('ordersEcotrackManager.amounts.total')}:{' '}
                                        {formatMoney(locale, item.totalAmount)}
                                      </p>
                                    </div>
                                  </TableCell>
                                  <TableCell className="align-top">
                                    <StatusBadge locale={locale} status={item.status} t={t} />
                                  </TableCell>
                                  <TableCell className="align-top">
                                    <div className="flex justify-center">{rowActionControl}</div>
                                  </TableCell>
                                </TableRow>

                                {expanded ? (
                                  <TableRow className="bg-muted/10">
                                    <TableCell colSpan={8}>
                                      <ShipmentHistoryPanel
                                        locale={locale}
                                        orderId={item.orderId}
                                        enabled={expanded}
                                      />
                                    </TableCell>
                                  </TableRow>
                                ) : null}
                              </Fragment>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>

                    <div className="grid gap-4 p-4 lg:hidden">
                      {items.map((item) => {
                        const expanded = expandedIds.includes(item.orderId);
                        const rowActionModel = buildRowActionModel(item, expanded);
                        const mobileActionControl = (
                          <SplitActionButton
                            size="sm"
                            label={rowActionModel.primary.label}
                            icon={rowActionModel.primary.icon}
                            primaryDisabled={item.canDispatch || item.canAddMaj ? !writable : false}
                            onPrimaryClick={rowActionModel.primary.onPrimaryClick}
                            options={rowActionModel.options}
                          />
                        );

                        return (
                          <Card
                            key={item.orderId}
                            className="border border-border/70 bg-background/90 shadow-none"
                          >
                            <div className="flex flex-col gap-4">
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex flex-col gap-2">
                                  <p className="font-semibold">{item.trackingNumber}</p>
                                  <p className="text-xs font-medium uppercase text-muted-foreground">
                                    {item.provider}
                                  </p>
                                  <p className="text-sm text-muted-foreground">{item.fullName}</p>
                                </div>
                                <Checkbox
                                  aria-label={t('labels.selectRow', { name: item.fullName })}
                                  checked={selectedIds.includes(item.orderId)}
                                  onChange={(event) => {
                                    setSelectedIds((current) =>
                                      event.target.checked
                                        ? [...new Set([...current, item.orderId])]
                                        : current.filter((id) => id !== item.orderId),
                                    );
                                  }}
                                />
                              </div>

                              <div className="grid gap-3 text-sm">
                                <div>
                                  <p className="text-xs font-semibold uppercase tracking-[0.05em] text-muted-foreground">
                                    {t('ordersEcotrackManager.columns.client')}
                                  </p>
                                  <p className="mt-1">{item.fullName}</p>
                                  <p className="text-muted-foreground">
                                    {formatOrderPhoneForDisplay(item.phoneNumber1)}
                                  </p>
                                  {item.phoneNumber2 ? (
                                    <p className="text-muted-foreground">
                                      {formatOrderPhoneForDisplay(item.phoneNumber2)}
                                    </p>
                                  ) : null}
                                </div>
                                <div>
                                  <p className="text-xs font-semibold uppercase tracking-[0.05em] text-muted-foreground">
                                    {t('ordersEcotrackManager.columns.address')}
                                  </p>
                                  <p className="mt-1">
                                    {item.homeAddress || t('ordersEcotrackManager.missingValue')}
                                  </p>
                                  <p className="text-muted-foreground">
                                    {[item.city, item.stateName ?? item.state]
                                      .filter(Boolean)
                                      .join(', ')}
                                  </p>
                                  <Badge variant="outline" className="mt-2">
                                    {t(getDeliveryLabelKey(item.delivery))}
                                  </Badge>
                                </div>
                                <div>
                                  <p className="text-xs font-semibold uppercase tracking-[0.05em] text-muted-foreground">
                                    {t('ordersEcotrackManager.columns.products')}
                                  </p>
                                  <div className="mt-1 flex flex-col gap-1">
                                    {item.orderProducts.map((product, index) => (
                                      <p
                                        key={`${item.orderId}-mobile-${index}`}
                                        className="text-muted-foreground"
                                      >
                                        {product.title} x{product.quantity}
                                      </p>
                                    ))}
                                  </div>
                                </div>
                                <div>
                                  <p className="text-xs font-semibold uppercase tracking-[0.05em] text-muted-foreground">
                                    {t('ordersEcotrackManager.columns.amount')}
                                  </p>
                                  <p className="mt-1 text-muted-foreground">
                                    {t('ordersEcotrackManager.amounts.subtotal')}:{' '}
                                    {formatMoney(locale, item.productSubtotal)}
                                  </p>
                                  <p className="text-muted-foreground">
                                    {t('ordersEcotrackManager.amounts.deliveryFee')}:{' '}
                                    {formatMoney(locale, item.deliveryFee)}
                                  </p>
                                  <p className="font-semibold">
                                    {t('ordersEcotrackManager.amounts.total')}:{' '}
                                    {formatMoney(locale, item.totalAmount)}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-xs font-semibold uppercase tracking-[0.05em] text-muted-foreground">
                                    {t('ordersEcotrackManager.columns.status')}
                                  </p>
                                  <div className="mt-2">
                                    <StatusBadge locale={locale} status={item.status} t={t} />
                                  </div>
                                </div>
                              </div>

                              <div className="flex flex-wrap gap-2">{mobileActionControl}</div>

                              {expanded ? (
                                <div className="rounded-[1rem] border border-border/70 bg-muted/10 p-3">
                                  <ShipmentHistoryPanel
                                    locale={locale}
                                    orderId={item.orderId}
                                    enabled={expanded}
                                  />
                                </div>
                              ) : null}
                            </div>
                          </Card>
                        );
                      })}
                    </div>

                    <TablePaginationControls
                      currentPage={pagination.page}
                      totalPages={pagination.totalPages}
                      onPageChange={setPage}
                    />
                  </>
                ) : null}
              </>
            ) : null}
          </div>
          <SurfacePendingOverlay
            active={showRefreshingProgress}
            label={t('ordersEcotrackManager.loading.refreshing')}
          />
        </div>
      </motion.section>

      <Dialog open={editDialog !== null} onOpenChange={(open) => !open && setEditDialog(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>
              {editDialog?.mode === 'recreate'
                ? t('ordersEcotrackManager.dialogs.recreateTitle')
                : editDialog?.mode === 'finalize'
                  ? t('ordersEcotrackManager.dialogs.finalizeTitle')
                  : t('ordersEcotrackManager.dialogs.editTitle')}
            </DialogTitle>
            <DialogDescription>
              {editDialog?.mode === 'recreate'
                ? t('ordersEcotrackManager.dialogs.recreateDescription', {
                    name: editDialog?.fullName ?? '',
                  })
                : editDialog?.mode === 'finalize'
                  ? t('ordersEcotrackManager.dialogs.finalizeDescription', {
                      name: editDialog?.fullName ?? '',
                    })
                  : t('ordersEcotrackManager.dialogs.editDescription')}
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <div className="grid gap-4 md:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="ecotrack-edit-first-name">
                  {t('ordersEcotrackManager.fields.firstName')}
                </FieldLabel>
                <Input
                  id="ecotrack-edit-first-name"
                  value={editDialog?.firstName ?? ''}
                  onChange={(event) =>
                    updateEditDialog((current) => ({ ...current, firstName: event.target.value }))
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="ecotrack-edit-last-name">
                  {t('ordersEcotrackManager.fields.lastName')}
                </FieldLabel>
                <Input
                  id="ecotrack-edit-last-name"
                  value={editDialog?.lastName ?? ''}
                  onChange={(event) =>
                    updateEditDialog((current) => ({ ...current, lastName: event.target.value }))
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="ecotrack-edit-phone">
                  {t('ordersEcotrackManager.fields.phoneNumber1')}
                </FieldLabel>
                <Input
                  id="ecotrack-edit-phone"
                  value={editDialog?.phoneNumber1 ?? ''}
                  onChange={(event) =>
                    updateEditDialog((current) => ({
                      ...current,
                      phoneNumber1: event.target.value,
                    }))
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="ecotrack-edit-phone-2">
                  {t('ordersEcotrackManager.fields.phoneNumber2')}
                </FieldLabel>
                <Input
                  id="ecotrack-edit-phone-2"
                  value={editDialog?.phoneNumber2 ?? ''}
                  onChange={(event) =>
                    updateEditDialog((current) => ({
                      ...current,
                      phoneNumber2: event.target.value,
                    }))
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="ecotrack-edit-delivery">
                  {t('ordersEcotrackManager.fields.delivery')}
                </FieldLabel>
                <NativeSelect
                  id="ecotrack-edit-delivery"
                  value={String(editDialog?.delivery ?? 0)}
                  onChange={(event) =>
                    updateEditDialog((current) =>
                      applyDerivedDeliveryFee(
                        current,
                        Number.parseInt(event.target.value, 10) as 0 | 1,
                        current.state,
                      ),
                    )
                  }
                >
                  <NativeSelectOption value="0">
                    {t('ordersManager.delivery.home')}
                  </NativeSelectOption>
                  <NativeSelectOption value="1">
                    {t('ordersManager.delivery.office')}
                  </NativeSelectOption>
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel htmlFor="ecotrack-edit-state">
                  {t('ordersEcotrackManager.fields.state')}
                </FieldLabel>
                <NativeSelect
                  id="ecotrack-edit-state"
                  value={editDialog?.state ?? ''}
                  onChange={(event) =>
                    updateEditDialog((current) => ({
                      ...applyDerivedDeliveryFee(current, current.delivery, event.target.value),
                      city: '',
                    }))
                  }
                >
                  <NativeSelectOption value="">
                    {t('ordersEcotrackManager.fields.statePlaceholder')}
                  </NativeSelectOption>
                  {(catalogQuery.data?.wilayas ?? []).map((wilaya) => (
                    <NativeSelectOption key={wilaya.wilayaId} value={String(wilaya.wilayaId)}>
                      {wilaya.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
            </div>
            <div className="grid gap-4 md:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)]">
              <Field>
                <FieldLabel htmlFor="ecotrack-edit-city">
                  {t('ordersEcotrackManager.fields.city')}
                </FieldLabel>
                {communeOptions.length > 0 ? (
                  <NativeSelect
                    id="ecotrack-edit-city"
                    value={editDialog?.city ?? ''}
                    onChange={(event) =>
                      updateEditDialog((current) => ({ ...current, city: event.target.value }))
                    }
                  >
                    <NativeSelectOption value="">
                      {t('ordersEcotrackManager.fields.cityPlaceholder')}
                    </NativeSelectOption>
                    {communeOptions.map((commune) => (
                      <NativeSelectOption key={commune.communeId} value={commune.name}>
                        {commune.name}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                ) : (
                  <Input
                    id="ecotrack-edit-city"
                    value={editDialog?.city ?? ''}
                    onChange={(event) =>
                      updateEditDialog((current) => ({ ...current, city: event.target.value }))
                    }
                  />
                )}
              </Field>
              <Field>
                <FieldLabel htmlFor="ecotrack-edit-address">
                  {t('ordersEcotrackManager.fields.homeAddress')}
                </FieldLabel>
                <Input
                  id="ecotrack-edit-address"
                  value={editDialog?.homeAddress ?? ''}
                  onChange={(event) =>
                    updateEditDialog((current) => ({ ...current, homeAddress: event.target.value }))
                  }
                />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="ecotrack-edit-note">
                {t('ordersEcotrackManager.fields.note')}
              </FieldLabel>
              <Textarea
                id="ecotrack-edit-note"
                value={editDialog?.note ?? ''}
                onChange={(event) =>
                  updateEditDialog((current) => ({ ...current, note: event.target.value }))
                }
              />
              <FieldDescription>{t('ordersEcotrackManager.dialogs.editHint')}</FieldDescription>
            </Field>
            {editDialog ? (
              <OrderProductsEditor
                customerName={editDialog.fullName}
                items={editDialog.editableProducts}
                search={editDialog.search}
                onSearchChange={(value) =>
                  updateEditDialog((current) => ({ ...current, search: value }))
                }
                onAddProduct={(product: ProductSearchItem) =>
                  updateEditDialog((current) => {
                    const nextItems = [
                      ...current.editableProducts,
                      {
                        rawValue: String(product.id),
                        productId: product.id,
                        title: product.title,
                        unitPrice: parseNumericAmount(product.price),
                        thumbnailUrl: product.images[0] ?? null,
                        missing: false,
                      },
                    ];
                    const nextDerivedSubtotal = summarizeEditableProducts(nextItems).reduce(
                      (sum, item) => sum + item.lineTotal,
                      0,
                    );
                    return {
                      ...current,
                      editableProducts: nextItems,
                      cartProducts: nextItems.map((item) => item.rawValue),
                      subtotalInput: formatAmountInput(nextDerivedSubtotal),
                      subtotalOverride: null,
                      hasManualSubtotalOverride: false,
                    };
                  })
                }
                onIncreaseQuantity={(rawValue) =>
                  updateEditDialog((current) => {
                    const item = current.editableProducts.find(
                      (entry) => entry.rawValue === rawValue,
                    );
                    if (!item) {
                      return current;
                    }
                    const nextItems = [...current.editableProducts, { ...item }];
                    const nextDerivedSubtotal = summarizeEditableProducts(nextItems).reduce(
                      (sum, entry) => sum + entry.lineTotal,
                      0,
                    );
                    return {
                      ...current,
                      editableProducts: nextItems,
                      cartProducts: nextItems.map((entry) => entry.rawValue),
                      subtotalInput: formatAmountInput(nextDerivedSubtotal),
                      subtotalOverride: null,
                      hasManualSubtotalOverride: false,
                    };
                  })
                }
                onDecreaseQuantity={(rawValue) =>
                  updateEditDialog((current) => {
                    const index = current.editableProducts.findIndex(
                      (entry) => entry.rawValue === rawValue,
                    );
                    if (index === -1) {
                      return current;
                    }
                    const nextItems = current.editableProducts.filter(
                      (_, itemIndex) => itemIndex !== index,
                    );
                    const nextDerivedSubtotal = summarizeEditableProducts(nextItems).reduce(
                      (sum, entry) => sum + entry.lineTotal,
                      0,
                    );
                    return {
                      ...current,
                      editableProducts: nextItems,
                      cartProducts: nextItems.map((entry) => entry.rawValue),
                      subtotalInput: formatAmountInput(nextDerivedSubtotal),
                      subtotalOverride: null,
                      hasManualSubtotalOverride: false,
                    };
                  })
                }
                onRemoveProduct={(rawValue) =>
                  updateEditDialog((current) => {
                    const nextItems = current.editableProducts.filter(
                      (entry) => entry.rawValue !== rawValue,
                    );
                    const nextDerivedSubtotal = summarizeEditableProducts(nextItems).reduce(
                      (sum, entry) => sum + entry.lineTotal,
                      0,
                    );
                    return {
                      ...current,
                      editableProducts: nextItems,
                      cartProducts: nextItems.map((entry) => entry.rawValue),
                      subtotalInput: formatAmountInput(nextDerivedSubtotal),
                      subtotalOverride: null,
                      hasManualSubtotalOverride: false,
                    };
                  })
                }
                footer={
                  <div className="grid gap-4">
                    <Field>
                      <FieldLabel htmlFor="ecotrack-edit-subtotal">
                        {t('ordersEcotrackManager.amounts.subtotal')}
                      </FieldLabel>
                      <Input
                        id="ecotrack-edit-subtotal"
                        type="number"
                        step="0.01"
                        value={editDialog.subtotalInput}
                        onChange={(event) =>
                          updateEditDialog((current) => ({
                            ...current,
                            subtotalInput: event.target.value,
                            subtotalOverride: parseNumericAmount(event.target.value),
                            hasManualSubtotalOverride: true,
                          }))
                        }
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="ecotrack-edit-delivery-fee">
                        {t('ordersEcotrackManager.amounts.deliveryFee')}
                      </FieldLabel>
                      <Input
                        id="ecotrack-edit-delivery-fee"
                        type="number"
                        step="0.01"
                        value={editDialog.deliveryFeeInput}
                        onChange={(event) =>
                          updateEditDialog((current) => ({
                            ...current,
                            deliveryFeeInput: event.target.value,
                          }))
                        }
                      />
                    </Field>
                    <div className="rounded-2xl bg-muted/40 p-3 text-sm">
                      <p>
                        {t('ordersEcotrackManager.amounts.subtotal')}:{' '}
                        {formatMoney(locale, editSubtotalValue)}
                      </p>
                      <p>
                        {t('ordersEcotrackManager.amounts.deliveryFee')}:{' '}
                        {formatMoney(locale, editDeliveryFeeValue)}
                      </p>
                      <p className="font-semibold">
                        {t('ordersEcotrackManager.amounts.total')}:{' '}
                        {formatMoney(locale, editTotalValue)}
                      </p>
                    </div>
                  </div>
                }
              />
            ) : null}
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditDialog(null)}>
              {t('actions.cancel')}
            </Button>
            {editDialog?.mode === 'finalize' ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void handleSaveEdit()}
                  disabled={
                    updateMutation.isPending || recreateMutation.isPending || isFinalizeSubmitting
                  }
                >
                  <Save data-icon="inline-start" />
                  {t('ordersEcotrackManager.actions.saveOnly')}
                </Button>
                <Button
                  type="button"
                  onClick={() => void handleSaveEdit({ dispatchAfterSave: true })}
                  disabled={
                    updateMutation.isPending || recreateMutation.isPending || isFinalizeSubmitting
                  }
                >
                  <Send data-icon="inline-start" />
                  {t('ordersEcotrackManager.actions.saveAndDispatch')}
                </Button>
              </>
            ) : (
              <Button
                type="button"
                onClick={() => void handleSaveEdit()}
                disabled={
                  updateMutation.isPending || recreateMutation.isPending || isFinalizeSubmitting
                }
              >
                <Save data-icon="inline-start" />
                {editDialog?.mode === 'recreate'
                  ? t('ordersEcotrackManager.actions.editAndRecreate')
                  : t('actions.save')}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialog !== null} onOpenChange={(open) => !open && setDeleteDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('ordersEcotrackManager.dialogs.deleteTitle')}</DialogTitle>
            <DialogDescription>
              {t('ordersEcotrackManager.dialogs.deleteDescription', {
                name: deleteDialog?.fullName ?? '',
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteDialog(null)}>
              {t('actions.cancel')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => deleteDialog && deleteMutation.mutate(deleteDialog.orderId)}
              disabled={deleteMutation.isPending}
            >
              <Trash2 data-icon="inline-start" />
              {t('actions.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={dispatchDialog !== null}
        onOpenChange={(open) => !open && setDispatchDialog(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('ordersEcotrackManager.dialogs.dispatchTitle')}</DialogTitle>
            <DialogDescription>
              {t('ordersEcotrackManager.dialogs.dispatchDescription', {
                name: dispatchDialog?.label ?? '',
              })}
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field
              orientation="horizontal"
              className="justify-between rounded-[1rem] border border-border/70 bg-muted/10 p-3"
            >
              <div className="flex flex-col gap-1">
                <FieldLabel htmlFor="ecotrack-ask-collection">
                  {t('ordersEcotrackManager.fields.askCollection')}
                </FieldLabel>
                <FieldDescription>
                  {t('ordersEcotrackManager.fields.askCollectionDescription')}
                </FieldDescription>
              </div>
              <Switch
                id="ecotrack-ask-collection"
                checked={dispatchDialog?.askCollection ?? false}
                onCheckedChange={(checked) =>
                  setDispatchDialog((current) =>
                    current ? { ...current, askCollection: checked } : current,
                  )
                }
              />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDispatchDialog(null)}>
              {t('actions.cancel')}
            </Button>
            <Button
              type="button"
              onClick={() =>
                dispatchDialog &&
                dispatchMutation.mutate({
                  orderIds: dispatchDialog.orderIds,
                  askCollection: dispatchDialog.askCollection,
                })
              }
              disabled={dispatchMutation.isPending}
            >
              <Send data-icon="inline-start" />
              {t('ordersEcotrackManager.actions.dispatch')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={majDialog !== null} onOpenChange={(open) => !open && setMajDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('ordersEcotrackManager.dialogs.majTitle')}</DialogTitle>
            <DialogDescription>
              {t('ordersEcotrackManager.dialogs.majDescription', {
                name: majDialog?.fullName ?? '',
              })}
            </DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="ecotrack-maj-content">
              {t('ordersEcotrackManager.fields.majContent')}
            </FieldLabel>
            <Textarea
              id="ecotrack-maj-content"
              maxLength={255}
              value={majDialog?.content ?? ''}
              onChange={(event) =>
                setMajDialog((current) =>
                  current ? { ...current, content: event.target.value } : current,
                )
              }
            />
            <FieldDescription>{t('ordersEcotrackManager.fields.majHint')}</FieldDescription>
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setMajDialog(null)}>
              {t('actions.cancel')}
            </Button>
            <Button
              type="button"
              onClick={() => majDialog && majMutation.mutate(majDialog)}
              disabled={majMutation.isPending || !majDialog?.content.trim()}
            >
              <Package data-icon="inline-start" />
              {t('ordersEcotrackManager.actions.maj')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
