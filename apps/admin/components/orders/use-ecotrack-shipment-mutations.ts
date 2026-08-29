'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

import { requestJson } from '../../lib/admin-api';
import type {
  EcotrackDispatchBatchResponse,
  EcotrackLabelsResponse,
  EcotrackRefreshBatchResponse,
  EcotrackShipmentDetail,
  EcotrackShipmentListItem,
  EcotrackShipmentsResponse,
} from '../../lib/ecotrack-admin-contracts';
import { toast } from '../../lib/toast';
import { buildEcotrackFailureSummary as buildFailureSummary } from './orders-ecotrack-presentation';

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

export function criticalEcotrackToast(message: string, toastId?: string | null) {
  toast.criticalError(message, toastId ? { id: toastId } : undefined);
}

type EcotrackMutationCallbacks = {
  onEditComplete: () => void;
  onScanComplete: (item: EcotrackShipmentListItem) => void;
  onDeleteComplete: (orderId: number) => void;
  onDispatchComplete: () => void;
  onMajComplete: () => void;
};

export function useEcotrackShipmentMutations({
  onEditComplete,
  onScanComplete,
  onDeleteComplete,
  onDispatchComplete,
  onMajComplete,
}: EcotrackMutationCallbacks) {
  const t = useTranslations();
  const queryClient = useQueryClient();

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
      onEditComplete();
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
      onScanComplete(item);
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
      onEditComplete();
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
      onDeleteComplete(orderId);
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
        onDispatchComplete();
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
      onMajComplete();
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

  return {
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
  };
}
