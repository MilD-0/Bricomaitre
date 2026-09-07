'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { AdminApiError, requestJson as request } from '../../../lib/admin-api';
import { type OrderRecord } from '../../../lib/orders';
import {
  type ShoppingListDraftItem,
  type ShoppingListDraftRecord,
  type ShoppingListSourceMode,
} from '../../../lib/shopping-list-drafts';
import type { ProductSearchItem } from '../order-products-editor';
import type {
  EcotrackPostingPreviewState,
  EcotrackPreviewResponse,
  ShoppingListSaveStatus,
  ShoppingListState,
} from '../orders-workflow-model';
import { type InventoryApplyResponse, type OrderJobResponse } from './contract';
export function useWorkflowQueries() {
  const t = useTranslations();
  const locale = useLocale();
  const queryClient = useQueryClient();
  const [shoppingListState, setShoppingListState] = useState<ShoppingListState>(null);
  const [shoppingListOpen, setShoppingListOpen] = useState(false);
  const [stockReviewOpen, setStockReviewOpen] = useState(false);
  const [inventoryBusy, setInventoryBusy] = useState(false);
  const [shoppingListSaveStatus, setShoppingListSaveStatus] =
    useState<ShoppingListSaveStatus>('idle');
  const [ecotrackPreviewState, setEcotrackPreviewState] =
    useState<EcotrackPostingPreviewState>(null);
  const [activeEcotrackJobId, setActiveEcotrackJobId] = useState<string | null>(null);
  const selectedShoppingListOrdersRef = useRef<OrderRecord[]>([]);
  const shoppingListSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shoppingListSaveSeqRef = useRef(0);
  const announcedJobIdsRef = useRef<Set<string>>(new Set());
  const lastEcotrackStatusRef = useRef<string | null>(null);

  useEffect(
    () => () => {
      if (shoppingListSaveTimeoutRef.current) clearTimeout(shoppingListSaveTimeoutRef.current);
    },
    [],
  );

  const ecotrackJobQuery = useQuery({
    queryKey: ['orders-selected-ecotrack-job', activeEcotrackJobId],
    queryFn: () =>
      request<OrderJobResponse>(
        `/api/orders/ecotrack?jobId=${encodeURIComponent(activeEcotrackJobId ?? '')}`,
      ),
    enabled: activeEcotrackJobId !== null,
    initialData: { job: null },
    initialDataUpdatedAt: 0,
    refetchInterval: (query) => {
      const status = query.state.data?.job?.status;
      return status === 'queued' || status === 'running' ? 1_000 : false;
    },
    refetchIntervalInBackground: true,
    staleTime: 0,
  });
  const previewEcotrackMutation = useMutation({
    mutationFn: (payload: {
      mode: 'selected' | 'confirmed';
      provider?: 'delivro' | 'emir';
      orderIds: number[];
    }) =>
      request<EcotrackPreviewResponse>('/api/orders/ecotrack/preview', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
  });
  const startEcotrackMutation = useMutation({
    mutationFn: (payload: {
      mode: 'selected' | 'confirmed';
      provider?: 'delivro' | 'emir';
      orderIds: number[];
    }) =>
      request<OrderJobResponse>('/api/orders/ecotrack', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
  });
  const cancelEcotrackMutation = useMutation({
    mutationFn: () => request<OrderJobResponse>('/api/orders/ecotrack', { method: 'DELETE' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['orders-selected-ecotrack-job'] });
    },
  });
  const addShoppingListProductMutation = useMutation({
    mutationFn: async (product: ProductSearchItem) => {
      const brandId = product.brandId ?? null;
      const details = await request<{
        products: Array<{
          id: number;
          inventoryQuantity: number;
          purchasePrice: number | string | null;
        }>;
        brands: Array<{ id: number; name: string }>;
      }>('/api/orders/shopping-list-details', {
        method: 'POST',
        body: JSON.stringify({
          productIds: [product.id],
          brandIds: brandId === null ? [] : [brandId],
        }),
      });
      const detail = details.products.find((item) => item.id === product.id);
      if (!detail) throw new Error(t('ordersManager.shoppingList.addProductError'));
      return {
        product: { ...product, ...detail, brandId },
        brandName:
          details.brands.find((brand) => brand.id === brandId)?.name ?? t('labels.noBrand'),
      };
    },
  });
  type InventoryRequest = {
    sourceMode: ShoppingListSourceMode;
    orderIds: number[];
    revision: number;
    draftIds: string[];
  };
  const inventoryEdits = (items: ShoppingListDraftItem[]) =>
    JSON.stringify(
      items.map(({ draftId, quantity, inventoryDecreaseQuantity, checked }) => ({
        draftId,
        quantity,
        inventoryDecreaseQuantity,
        checked,
      })),
    );
  const inventoryRequestRef = useRef<{
    fingerprint: string;
    requestId: string;
    payload: InventoryRequest;
    draftFingerprint: string;
  } | null>(null);
  const applyInventoryMutation = useMutation({
    mutationFn: (payload: {
      sourceMode: ShoppingListSourceMode;
      orderIds: number[];
      revision: number;
      draftIds: string[];
    }) => {
      const fingerprint = JSON.stringify(payload);
      if (inventoryRequestRef.current?.fingerprint !== fingerprint) {
        inventoryRequestRef.current = {
          fingerprint,
          requestId: crypto.randomUUID(),
          payload,
          draftFingerprint: inventoryEdits(shoppingListState?.draftItems ?? []),
        };
      }
      return request<InventoryApplyResponse & { draft: ShoppingListDraftRecord }>(
        '/api/orders/shopping-list-draft/apply',
        {
          method: 'POST',
          body: JSON.stringify({ ...payload, requestId: inventoryRequestRef.current.requestId }),
        },
      );
    },
    onError: (error) => {
      if (error instanceof AdminApiError && error.status >= 400 && error.status < 500)
        inventoryRequestRef.current = null;
    },
    onSuccess: async () => {
      inventoryRequestRef.current = null;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['inventory-table'] }),
        queryClient.invalidateQueries({ queryKey: ['products-workspace'] }),
      ]);
    },
  });

  const ecotrackJob = ecotrackJobQuery.data.job;
  return {
    ecotrackJob,
    lastEcotrackStatusRef,
    announcedJobIdsRef,
    t,
    shoppingListSaveTimeoutRef,
    shoppingListSaveSeqRef,
    setShoppingListSaveStatus,
    setShoppingListState,
    selectedShoppingListOrdersRef,
    setShoppingListOpen,
    shoppingListState,
    addShoppingListProductMutation,
    setStockReviewOpen,
    inventoryRequestRef,
    inventoryEdits,
    setInventoryBusy,
    applyInventoryMutation,
    previewEcotrackMutation,
    setActiveEcotrackJobId,
    setEcotrackPreviewState,
    ecotrackPreviewState,
    startEcotrackMutation,
    locale,
    shoppingListOpen,
    stockReviewOpen,
    inventoryBusy,
    shoppingListSaveStatus,
    cancelEcotrackMutation,
  } as const;
}
