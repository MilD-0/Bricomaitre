'use client';

import { ChevronDown, ChevronUp } from 'lucide-react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

import {
  type AssetBannerPayload,
  type AssetBannerRecord,
  type AssetMetaBrand,
  type AssetMetaCategory,
  type AssetMetaProduct,
  type AssetsResponse,
  type FeaturedProductGroupInput,
  type FeaturedProductGroupPayload,
  type FeaturedProductGroupRecord,
  type ProductCardPayload,
  type ProductCardRecord,
} from '../lib/assets';
import { requestJson as request } from '../lib/admin-api';
import { toast } from '../lib/toast';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from './ui/empty';
import { Skeleton } from './ui/skeleton';
import { Switch } from './ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';

const BannerDialogForm = dynamic(() =>
  import('./assets/asset-editor-dialogs').then((module) => module.BannerDialogForm),
);
const FeaturedGroupDialogForm = dynamic(() =>
  import('./assets/asset-editor-dialogs').then((module) => module.FeaturedGroupDialogForm),
);
const ProductCardDialogForm = dynamic(() =>
  import('./assets/asset-editor-dialogs').then((module) => module.ProductCardDialogForm),
);

type MutationMessages = {
  loading: string;
  success: string;
  error: string;
};

type AssetSection = 'banners' | 'featuredGroups' | 'productCards';
type AssetReorderKind = 'banner' | 'featured-group' | 'product-card';
type DeleteState =
  | { kind: 'banner'; id: number; label: string }
  | { kind: 'featured-group'; id: number; label: string }
  | { kind: 'product-card'; id: number; label: string };

type MutationContext = {
  messages: MutationMessages;
  snapshot: AssetsResponse | undefined;
  toastId: string;
};

type AssetsMetaResponse = {
  products: AssetMetaProduct[];
  brands: AssetMetaBrand[];
  categories: AssetMetaCategory[];
};

function timestampLabel(value: string) {
  return new Date(value).toLocaleString();
}

function toGroupFormValues(group: FeaturedProductGroupRecord): FeaturedProductGroupInput {
  return {
    ...group,
    nameAr: group.nameAr ?? '',
    cta: group.cta ?? '',
    ctaAr: group.ctaAr ?? '',
    link: group.link ?? '',
  };
}

function updateBanners(
  current: AssetsResponse | undefined,
  updater: (items: AssetBannerRecord[]) => AssetBannerRecord[],
) {
  if (!current) {
    return current;
  }

  return { ...current, banners: updater(current.banners) };
}

function updateFeaturedGroups(
  current: AssetsResponse | undefined,
  updater: (items: FeaturedProductGroupRecord[]) => FeaturedProductGroupRecord[],
) {
  if (!current) {
    return current;
  }

  return { ...current, featuredGroups: updater(current.featuredGroups) };
}

function updateProductCards(
  current: AssetsResponse | undefined,
  updater: (items: ProductCardRecord[]) => ProductCardRecord[],
) {
  if (!current) {
    return current;
  }

  return { ...current, productCards: updater(current.productCards) };
}

function updateAssetsSection(
  current: AssetsResponse | undefined,
  section: AssetSection,
  updater: {
    banners?: (items: AssetBannerRecord[]) => AssetBannerRecord[];
    featuredGroups?: (items: FeaturedProductGroupRecord[]) => FeaturedProductGroupRecord[];
    productCards?: (items: ProductCardRecord[]) => ProductCardRecord[];
  },
) {
  if (section === 'banners' && updater.banners) {
    return updateBanners(current, updater.banners);
  }

  if (section === 'featuredGroups' && updater.featuredGroups) {
    return updateFeaturedGroups(current, updater.featuredGroups);
  }

  if (section === 'productCards' && updater.productCards) {
    return updateProductCards(current, updater.productCards);
  }

  return current;
}

function reorderItems<T extends { id: number; sortOrder: number; updatedAt: string }>(
  items: T[],
  activeId: number,
  overId: number,
) {
  const sourceIndex = items.findIndex((item) => item.id === activeId);
  const destinationIndex = items.findIndex((item) => item.id === overId);

  if (sourceIndex === -1 || destinationIndex === -1 || sourceIndex === destinationIndex) {
    return items;
  }

  const nextItems = [...items];
  const [moved] = nextItems.splice(sourceIndex, 1);
  nextItems.splice(destinationIndex, 0, moved);

  const now = new Date().toISOString();
  return nextItems.map((item, index) => ({
    ...item,
    sortOrder: index,
    updatedAt: item.id === activeId ? now : item.updatedAt,
  }));
}

function serializeSortOrder(items: Array<{ id: number; sortOrder: number }>) {
  return items.map(({ id, sortOrder }) => ({ id, sortOrder }));
}

function getNextSortOrder(items: Array<{ sortOrder: number }>) {
  return items.reduce((max, item) => Math.max(max, item.sortOrder), -1) + 1;
}

function AssetsTableSkeleton() {
  return (
    <div className="overflow-x-auto">
      <div className="hidden lg:block">
        <div className="grid grid-cols-[5rem_7rem_minmax(12rem,1fr)_minmax(12rem,1fr)_10rem_10rem] gap-4 border-y border-border/70 px-4 py-3 sm:px-5">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-4 w-full" />
          ))}
        </div>
        <div className="flex flex-col">
          {Array.from({ length: 3 }).map((_, rowIndex) => (
            <div
              key={rowIndex}
              className="grid grid-cols-[5rem_7rem_minmax(12rem,1fr)_minmax(12rem,1fr)_10rem_10rem] gap-4 border-b border-border/60 px-4 py-4 sm:px-5"
            >
              {Array.from({ length: 6 }).map((_, cellIndex) => (
                <Skeleton key={cellIndex} className="h-8 w-full" />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="grid gap-3 px-4 pb-4 lg:hidden">
        {Array.from({ length: 2 }).map((_, index) => (
          <div key={index} className="rounded-2xl border border-border/70 bg-background p-4">
            <div className="flex flex-col gap-3">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-12 w-full" />
              <div className="flex gap-2">
                <Skeleton className="h-9 flex-1" />
                <Skeleton className="h-9 flex-1" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SectionEmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="px-4 pb-4 sm:px-5">
      <Empty className="rounded-[1.5rem] border border-dashed border-border/70 bg-muted/20">
        <EmptyHeader>
          <EmptyTitle>{title}</EmptyTitle>
          <EmptyDescription>{description}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  );
}

function DeleteDialog({
  open,
  title,
  description,
  pending,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const t = useTranslations();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('actions.cancel')}
          </Button>
          <Button type="button" variant="destructive" disabled={pending} onClick={onConfirm}>
            {t('actions.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AssetsManager({
  initialAssets,
  initialMeta,
}: {
  initialAssets?: AssetsResponse;
  initialMeta?: AssetsMetaResponse;
}) {
  const t = useTranslations('assetsManager');
  const globalT = useTranslations();
  const queryClient = useQueryClient();
  const [bannerDialogOpen, setBannerDialogOpen] = useState(false);
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [cardDialogOpen, setCardDialogOpen] = useState(false);
  const [editingBanner, setEditingBanner] = useState<AssetBannerRecord | null>(null);
  const [editingGroup, setEditingGroup] = useState<FeaturedProductGroupRecord | null>(null);
  const [editingCard, setEditingCard] = useState<ProductCardRecord | null>(null);
  const [deleteState, setDeleteState] = useState<DeleteState | null>(null);
  const [optimisticId, setOptimisticId] = useState(-1);
  const [initialAssetsUpdatedAt] = useState(() => (initialAssets ? Date.now() : 0));
  const [initialMetaUpdatedAt] = useState(() => (initialMeta ? Date.now() : 0));

  const getNextOptimisticId = () => {
    const nextId = optimisticId;
    setOptimisticId((current) => current - 1);
    return nextId;
  };

  const assetsQuery = useQuery({
    queryKey: ['assets-manager'],
    queryFn: () => request<AssetsResponse>('/api/assets'),
    initialData: initialAssets,
    initialDataUpdatedAt: initialAssetsUpdatedAt,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

  const metaQuery = useQuery({
    queryKey: ['assets-meta'],
    queryFn: () => request<AssetsMetaResponse>('/api/assets/meta'),
    initialData: initialMeta,
    initialDataUpdatedAt: initialMetaUpdatedAt,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

  const createMutation = useMutation<
    unknown,
    Error,
    {
      section: AssetSection;
      kind: string;
      data: unknown;
      optimisticItem: AssetBannerRecord | FeaturedProductGroupRecord | ProductCardRecord;
      messages: MutationMessages;
    },
    MutationContext
  >({
    mutationFn: ({ kind, data }) =>
      request('/api/assets', {
        method: 'POST',
        body: JSON.stringify({ kind, data }),
      }),
    onMutate: async ({ section, optimisticItem, messages }) => {
      await queryClient.cancelQueries({ queryKey: ['assets-manager'] });
      const snapshot = queryClient.getQueryData<AssetsResponse>(['assets-manager']);
      const toastId = toast.loading(messages.loading);

      queryClient.setQueryData<AssetsResponse>(['assets-manager'], (current) =>
        updateAssetsSection(current, section, {
          banners:
            section === 'banners'
              ? (items) => [...items, optimisticItem as AssetBannerRecord]
              : undefined,
          featuredGroups:
            section === 'featuredGroups'
              ? (items) => [...items, optimisticItem as FeaturedProductGroupRecord]
              : undefined,
          productCards:
            section === 'productCards'
              ? (items) => [...items, optimisticItem as ProductCardRecord]
              : undefined,
        }),
      );

      return { messages, snapshot, toastId };
    },
    onError: (_error, _variables, context) => {
      if (!context) {
        return;
      }

      queryClient.setQueryData(['assets-manager'], context.snapshot);
      toast.error(context.messages.error, { id: context.toastId });
    },
    onSuccess: (_data, _variables, context) => {
      if (!context) {
        return;
      }

      toast.success(context.messages.success, { id: context.toastId });
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ['assets-manager'] });
    },
  });

  const updateMutation = useMutation<
    unknown,
    Error,
    { section: AssetSection; kind: string; id: number; data: unknown; messages: MutationMessages },
    MutationContext
  >({
    mutationFn: ({ kind, id, data }) =>
      request(`/api/assets/${kind}/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ data }),
      }),
    onMutate: async ({ section, id, data, messages }) => {
      await queryClient.cancelQueries({ queryKey: ['assets-manager'] });
      const snapshot = queryClient.getQueryData<AssetsResponse>(['assets-manager']);
      const toastId = toast.loading(messages.loading);

      queryClient.setQueryData<AssetsResponse>(['assets-manager'], (current) =>
        updateAssetsSection(current, section, {
          banners:
            section === 'banners'
              ? (items) =>
                  items.map((item) =>
                    item.id === id
                      ? { ...item, ...(data as object), updatedAt: new Date().toISOString() }
                      : item,
                  )
              : undefined,
          featuredGroups:
            section === 'featuredGroups'
              ? (items) =>
                  items.map((item) =>
                    item.id === id
                      ? { ...item, ...(data as object), updatedAt: new Date().toISOString() }
                      : item,
                  )
              : undefined,
          productCards:
            section === 'productCards'
              ? (items) =>
                  items.map((item) =>
                    item.id === id
                      ? { ...item, ...(data as object), updatedAt: new Date().toISOString() }
                      : item,
                  )
              : undefined,
        }),
      );

      return { messages, snapshot, toastId };
    },
    onError: (_error, _variables, context) => {
      if (!context) {
        return;
      }

      queryClient.setQueryData(['assets-manager'], context.snapshot);
      toast.error(context.messages.error, { id: context.toastId });
    },
    onSuccess: (_data, _variables, context) => {
      if (!context) {
        return;
      }

      toast.success(context.messages.success, { id: context.toastId });
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ['assets-manager'] });
    },
  });

  const toggleMutation = useMutation<
    unknown,
    Error,
    {
      section: AssetSection;
      kind: string;
      id: number;
      changes: Partial<
        Pick<AssetBannerRecord, 'active'> &
          Pick<FeaturedProductGroupRecord, 'showAtTopOfProductsPage' | 'active'> &
          Pick<ProductCardRecord, 'active'>
      >;
      messages: MutationMessages;
    },
    MutationContext
  >({
    mutationFn: ({ kind, id, changes }) =>
      request(`/api/assets/${kind}/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(changes),
      }),
    onMutate: async ({ section, id, changes, messages }) => {
      await queryClient.cancelQueries({ queryKey: ['assets-manager'] });
      const snapshot = queryClient.getQueryData<AssetsResponse>(['assets-manager']);
      const toastId = toast.loading(messages.loading);

      queryClient.setQueryData<AssetsResponse>(['assets-manager'], (current) =>
        updateAssetsSection(current, section, {
          banners:
            section === 'banners'
              ? (items) =>
                  items.map((item) =>
                    item.id === id
                      ? { ...item, ...changes, updatedAt: new Date().toISOString() }
                      : item,
                  )
              : undefined,
          featuredGroups:
            section === 'featuredGroups'
              ? (items) =>
                  items.map((item) =>
                    item.id === id
                      ? { ...item, ...changes, updatedAt: new Date().toISOString() }
                      : item,
                  )
              : undefined,
          productCards:
            section === 'productCards'
              ? (items) =>
                  items.map((item) =>
                    item.id === id
                      ? { ...item, ...changes, updatedAt: new Date().toISOString() }
                      : item,
                  )
              : undefined,
        }),
      );

      return { messages, snapshot, toastId };
    },
    onError: (_error, _variables, context) => {
      if (!context) {
        return;
      }

      queryClient.setQueryData(['assets-manager'], context.snapshot);
      toast.error(context.messages.error, { id: context.toastId });
    },
    onSuccess: (_data, _variables, context) => {
      if (!context) {
        return;
      }

      toast.success(context.messages.success, { id: context.toastId });
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ['assets-manager'] });
    },
  });

  const deleteMutation = useMutation<
    unknown,
    Error,
    { section: AssetSection; kind: string; id: number; messages: MutationMessages },
    MutationContext
  >({
    mutationFn: ({ kind, id }) => request(`/api/assets/${kind}/${id}`, { method: 'DELETE' }),
    onMutate: async ({ section, id, messages }) => {
      await queryClient.cancelQueries({ queryKey: ['assets-manager'] });
      const snapshot = queryClient.getQueryData<AssetsResponse>(['assets-manager']);
      const toastId = toast.loading(messages.loading);

      queryClient.setQueryData<AssetsResponse>(['assets-manager'], (current) =>
        updateAssetsSection(current, section, {
          banners:
            section === 'banners' ? (items) => items.filter((item) => item.id !== id) : undefined,
          featuredGroups:
            section === 'featuredGroups'
              ? (items) => items.filter((item) => item.id !== id)
              : undefined,
          productCards:
            section === 'productCards'
              ? (items) => items.filter((item) => item.id !== id)
              : undefined,
        }),
      );
      setDeleteState(null);

      return { messages, snapshot, toastId };
    },
    onError: (_error, _variables, context) => {
      if (!context) {
        return;
      }

      queryClient.setQueryData(['assets-manager'], context.snapshot);
      toast.error(context.messages.error, { id: context.toastId });
    },
    onSuccess: (_data, _variables, context) => {
      if (!context) {
        return;
      }

      toast.success(context.messages.success, { id: context.toastId });
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ['assets-manager'] });
    },
  });

  const reorderMutation = useMutation<
    unknown,
    Error,
    {
      section: AssetSection;
      kind: AssetReorderKind;
      items: Array<{ id: number; sortOrder: number }>;
      optimisticItems: Array<AssetBannerRecord | FeaturedProductGroupRecord | ProductCardRecord>;
      messages: MutationMessages;
    },
    MutationContext
  >({
    mutationFn: ({ kind, items }) =>
      request('/api/assets/reorder', {
        method: 'POST',
        body: JSON.stringify({ kind, items }),
      }),
    onMutate: async ({ section, optimisticItems, messages }) => {
      await queryClient.cancelQueries({ queryKey: ['assets-manager'] });
      const snapshot = queryClient.getQueryData<AssetsResponse>(['assets-manager']);
      const toastId = toast.loading(messages.loading);

      queryClient.setQueryData<AssetsResponse>(['assets-manager'], (current) =>
        updateAssetsSection(current, section, {
          banners: section === 'banners' ? () => optimisticItems as AssetBannerRecord[] : undefined,
          featuredGroups:
            section === 'featuredGroups'
              ? () => optimisticItems as FeaturedProductGroupRecord[]
              : undefined,
          productCards:
            section === 'productCards' ? () => optimisticItems as ProductCardRecord[] : undefined,
        }),
      );

      return { messages, snapshot, toastId };
    },
    onError: (_error, _variables, context) => {
      if (!context) {
        return;
      }

      queryClient.setQueryData(['assets-manager'], context.snapshot);
      toast.error(context.messages.error, { id: context.toastId });
    },
    onSuccess: (_data, _variables, context) => {
      if (!context) {
        return;
      }

      toast.success(context.messages.success, { id: context.toastId });
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ['assets-manager'] });
    },
  });

  function closeBannerDialog() {
    setBannerDialogOpen(false);
    setEditingBanner(null);
  }

  function closeGroupDialog() {
    setGroupDialogOpen(false);
    setEditingGroup(null);
  }

  function closeCardDialog() {
    setCardDialogOpen(false);
    setEditingCard(null);
  }

  const assetData = assetsQuery.data ?? { banners: [], featuredGroups: [], productCards: [] };
  const assetMeta = metaQuery.data ?? { products: [], brands: [], categories: [] };
  const bannerProducts = assetMeta.products;

  const productNameById = useMemo(
    () => new Map(assetMeta.products.map((product) => [product.id, product.title])),
    [assetMeta.products],
  );

  const submitBanner = async (values: AssetBannerPayload) => {
    const now = new Date().toISOString();

    if (editingBanner) {
      await updateMutation.mutateAsync({
        section: 'banners',
        kind: 'banner',
        id: editingBanner.id,
        data: values,
        messages: {
          loading: t('bannerSaveLoading', { title: values.title }),
          success: t('bannerSaveSuccess', { title: values.title }),
          error: t('bannerSaveError', { title: values.title }),
        },
      });
      closeBannerDialog();
      return;
    }

    createMutation.mutate({
      section: 'banners',
      kind: 'banner',
      data: values,
      optimisticItem: {
        id: getNextOptimisticId(),
        ...values,
        sortOrder: getNextSortOrder(assetData.banners),
        createdAt: now,
        updatedAt: now,
      },
      messages: {
        loading: t('bannerCreateLoading', { title: values.title }),
        success: t('bannerCreateSuccess', { title: values.title }),
        error: t('bannerCreateError', { title: values.title }),
      },
    });
    closeBannerDialog();
  };

  const submitGroup = async (values: FeaturedProductGroupPayload) => {
    const now = new Date().toISOString();

    if (editingGroup) {
      await updateMutation.mutateAsync({
        section: 'featuredGroups',
        kind: 'featured-group',
        id: editingGroup.id,
        data: values,
        messages: {
          loading: t('groupSaveLoading', { name: values.name }),
          success: t('groupSaveSuccess', { name: values.name }),
          error: t('groupSaveError', { name: values.name }),
        },
      });
      closeGroupDialog();
      return;
    }

    createMutation.mutate({
      section: 'featuredGroups',
      kind: 'featuredGroup',
      data: values,
      optimisticItem: {
        id: getNextOptimisticId(),
        ...values,
        sortOrder: getNextSortOrder(assetData.featuredGroups),
        createdAt: now,
        updatedAt: now,
      },
      messages: {
        loading: t('groupCreateLoading', { name: values.name }),
        success: t('groupCreateSuccess', { name: values.name }),
        error: t('groupCreateError', { name: values.name }),
      },
    });
    closeGroupDialog();
  };

  const submitCard = async (values: ProductCardPayload) => {
    const now = new Date().toISOString();
    const productName = productNameById.get(values.productId) ?? t('unknownProduct');

    if (editingCard) {
      await updateMutation.mutateAsync({
        section: 'productCards',
        kind: 'product-card',
        id: editingCard.id,
        data: values,
        messages: {
          loading: t('cardSaveLoading', { product: productName }),
          success: t('cardSaveSuccess', { product: productName }),
          error: t('cardSaveError', { product: productName }),
        },
      });
      closeCardDialog();
      return;
    }

    createMutation.mutate({
      section: 'productCards',
      kind: 'productCard',
      data: values,
      optimisticItem: {
        id: getNextOptimisticId(),
        ...values,
        sortOrder: getNextSortOrder(assetData.productCards),
        createdAt: now,
        updatedAt: now,
      },
      messages: {
        loading: t('cardCreateLoading', { product: productName }),
        success: t('cardCreateSuccess', { product: productName }),
        error: t('cardCreateError', { product: productName }),
      },
    });
    closeCardDialog();
  };

  const deletePending = deleteMutation.isPending;
  const isInitialLoading =
    (!assetsQuery.data || !metaQuery.data) && (assetsQuery.isPending || metaQuery.isPending);
  const hasInitialError =
    (!assetsQuery.data || !metaQuery.data) && (assetsQuery.isError || metaQuery.isError);

  function handleReorderMove(
    section: AssetSection,
    kind: AssetReorderKind,
    itemId: number,
    direction: 'up' | 'down',
  ) {
    const currentItems: AssetBannerRecord[] | FeaturedProductGroupRecord[] | ProductCardRecord[] =
      section === 'banners'
        ? assetData.banners
        : section === 'featuredGroups'
          ? assetData.featuredGroups
          : assetData.productCards;

    const currentIndex = currentItems.findIndex((item) => item.id === itemId);
    if (currentIndex === -1) {
      return;
    }

    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= currentItems.length) {
      return;
    }

    const optimisticItems = reorderItems<
      AssetBannerRecord | FeaturedProductGroupRecord | ProductCardRecord
    >(currentItems, itemId, currentItems[targetIndex]?.id ?? itemId);
    if (optimisticItems === currentItems) {
      return;
    }

    const messageKey =
      section === 'banners' ? 'banner' : section === 'featuredGroups' ? 'group' : 'card';
    reorderMutation.mutate({
      section,
      kind,
      items: serializeSortOrder(optimisticItems),
      optimisticItems,
      messages: {
        loading: t(`${messageKey}ReorderLoading`),
        success: t(`${messageKey}ReorderSuccess`),
        error: t(`${messageKey}ReorderError`),
      },
    });
  }

  if (hasInitialError) {
    return (
      <Empty className="rounded-[1.75rem] border border-dashed border-border/70 bg-muted/20 p-8">
        <EmptyHeader>
          <EmptyTitle>{t('bannersTitle')}</EmptyTitle>
          <EmptyDescription>
            {assetsQuery.error?.message ?? metaQuery.error?.message ?? globalT('labels.loading')}
          </EmptyDescription>
        </EmptyHeader>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            void assetsQuery.refetch();
            void metaQuery.refetch();
          }}
        >
          {globalT('statsDashboard.refresh')}
        </Button>
      </Empty>
    );
  }

  if (isInitialLoading || !assetsQuery.data || !metaQuery.data) {
    return (
      <div className="flex flex-col gap-6">
        <section className="scroll-mt-24 overflow-hidden rounded-[1.75rem] border border-border/70 bg-background/95 shadow-sm">
          <div className="flex flex-col gap-4 px-4 py-4 sm:px-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h2 className="text-lg font-semibold">{t('bannersTitle')}</h2>
              </div>
              <Skeleton className="h-10 w-28" />
            </div>
          </div>
          <AssetsTableSkeleton />
        </section>
        <section className="scroll-mt-24 overflow-hidden rounded-[1.75rem] border border-border/70 bg-background/95 shadow-sm">
          <div className="flex flex-col gap-4 px-4 py-4 sm:px-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h2 className="text-lg font-semibold">{t('groupsTitle')}</h2>
              </div>
              <Skeleton className="h-10 w-28" />
            </div>
          </div>
          <AssetsTableSkeleton />
        </section>
        <section className="scroll-mt-24 overflow-hidden rounded-[1.75rem] border border-border/70 bg-background/95 shadow-sm">
          <div className="flex flex-col gap-4 px-4 py-4 sm:px-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h2 className="text-lg font-semibold">{t('cardsTitle')}</h2>
              </div>
              <Skeleton className="h-10 w-28" />
            </div>
          </div>
          <AssetsTableSkeleton />
        </section>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <section
        id="banners"
        className="scroll-mt-24 overflow-hidden rounded-[1.75rem] border border-border/70 bg-background/95 shadow-sm"
      >
        <div className="flex flex-col gap-4 px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold">{t('bannersTitle')}</h2>
            </div>
            <Button
              type="button"
              onClick={() => {
                setEditingBanner(null);
                setBannerDialogOpen(true);
              }}
            >
              {t('newBanner')}
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-14">{t('orderColumn')}</TableHead>
                <TableHead className="w-28">{globalT('labels.status')}</TableHead>
                <TableHead>{t('titleColumn')}</TableHead>
                <TableHead>{t('linkedProductColumn')}</TableHead>
                <TableHead>{globalT('labels.modified')}</TableHead>
                <TableHead className="text-right">{globalT('labels.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assetData.banners.map((banner) => (
                <TableRow key={banner.id}>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        aria-label={t('moveUpLabel', { item: banner.title })}
                        className="h-8 w-8 px-0"
                        disabled={reorderMutation.isPending || banner.sortOrder === 0}
                        onClick={() => handleReorderMove('banners', 'banner', banner.id, 'up')}
                      >
                        <ChevronUp aria-hidden="true" className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        aria-label={t('moveDownLabel', { item: banner.title })}
                        className="h-8 w-8 px-0"
                        disabled={
                          reorderMutation.isPending ||
                          banner.sortOrder === assetData.banners.length - 1
                        }
                        onClick={() => handleReorderMove('banners', 'banner', banner.id, 'down')}
                      >
                        <ChevronDown aria-hidden="true" className="size-4" />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Switch
                      aria-label={globalT('labels.status')}
                      checked={banner.active}
                      onCheckedChange={(checked) => {
                        const actionKey = checked ? 'bannerActivate' : 'bannerDeactivate';
                        toggleMutation.mutate({
                          section: 'banners',
                          kind: 'banner',
                          id: banner.id,
                          changes: { active: checked },
                          messages: {
                            loading: t(`${actionKey}Loading`, { title: banner.title }),
                            success: t(`${actionKey}Success`, { title: banner.title }),
                            error: t(`${actionKey}Error`, { title: banner.title }),
                          },
                        });
                      }}
                    />
                  </TableCell>
                  <TableCell className="font-medium">
                    <div>{banner.title}</div>
                    <div className="text-sm font-normal text-muted-foreground">
                      {banner.titleAr}
                    </div>
                  </TableCell>
                  <TableCell>
                    {banner.productId
                      ? (productNameById.get(banner.productId) ?? t('unknownProduct'))
                      : t('noLinkedProduct')}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {timestampLabel(banner.updatedAt)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditingBanner(banner);
                          setBannerDialogOpen(true);
                        }}
                      >
                        {globalT('actions.edit')}
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() =>
                          setDeleteState({ kind: 'banner', id: banner.id, label: banner.title })
                        }
                      >
                        {globalT('actions.delete')}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {assetData.banners.length === 0 ? (
          <SectionEmptyState title={t('bannersTitle')} description={t('productsEmptySearch')} />
        ) : null}
      </section>

      <section
        id="featured-groups"
        className="scroll-mt-24 overflow-hidden rounded-[1.75rem] border border-border/70 bg-background/95 shadow-sm"
      >
        <div className="flex flex-col gap-4 px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold">{t('groupsTitle')}</h2>
            </div>
            <Button
              type="button"
              onClick={() => {
                setEditingGroup(null);
                setGroupDialogOpen(true);
              }}
            >
              {t('newGroup')}
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-14">{t('orderColumn')}</TableHead>
                <TableHead className="w-28">{globalT('labels.status')}</TableHead>
                <TableHead>{t('groupNameColumn')}</TableHead>
                <TableHead>{t('groupShowAtTopColumn')}</TableHead>
                <TableHead>{t('coverageColumn')}</TableHead>
                <TableHead>{globalT('labels.modified')}</TableHead>
                <TableHead className="text-right">{globalT('labels.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assetData.featuredGroups.map((group) => (
                <TableRow key={group.id}>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        aria-label={t('moveUpLabel', { item: group.name })}
                        className="h-8 w-8 px-0"
                        disabled={reorderMutation.isPending || group.sortOrder === 0}
                        onClick={() =>
                          handleReorderMove('featuredGroups', 'featured-group', group.id, 'up')
                        }
                      >
                        <ChevronUp aria-hidden="true" className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        aria-label={t('moveDownLabel', { item: group.name })}
                        className="h-8 w-8 px-0"
                        disabled={
                          reorderMutation.isPending ||
                          group.sortOrder === assetData.featuredGroups.length - 1
                        }
                        onClick={() =>
                          handleReorderMove('featuredGroups', 'featured-group', group.id, 'down')
                        }
                      >
                        <ChevronDown aria-hidden="true" className="size-4" />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Switch
                      aria-label={globalT('labels.status')}
                      checked={group.active}
                      onCheckedChange={(checked) => {
                        const actionKey = checked ? 'groupActivate' : 'groupDeactivate';
                        toggleMutation.mutate({
                          section: 'featuredGroups',
                          kind: 'featured-group',
                          id: group.id,
                          changes: { active: checked },
                          messages: {
                            loading: t(`${actionKey}Loading`, { name: group.name }),
                            success: t(`${actionKey}Success`, { name: group.name }),
                            error: t(`${actionKey}Error`, { name: group.name }),
                          },
                        });
                      }}
                    />
                  </TableCell>
                  <TableCell className="font-medium">
                    <div>{group.name}</div>
                    <div className="text-sm font-normal text-muted-foreground">{group.nameAr}</div>
                  </TableCell>
                  <TableCell>
                    <Switch
                      aria-label={t('groupShowAtTopToggle', { name: group.name })}
                      checked={group.showAtTopOfProductsPage}
                      onCheckedChange={(checked) => {
                        const actionKey = checked
                          ? 'groupShowAtTopEnable'
                          : 'groupShowAtTopDisable';
                        toggleMutation.mutate({
                          section: 'featuredGroups',
                          kind: 'featured-group',
                          id: group.id,
                          changes: { showAtTopOfProductsPage: checked },
                          messages: {
                            loading: t(`${actionKey}Loading`, { name: group.name }),
                            success: t(`${actionKey}Success`, { name: group.name }),
                            error: t(`${actionKey}Error`, { name: group.name }),
                          },
                        });
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    {t('groupCounts', {
                      products: group.productIds.length,
                      brands: group.brandIds.length,
                      categories: group.categoryIds.length,
                    })}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {timestampLabel(group.updatedAt)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditingGroup(group);
                          setGroupDialogOpen(true);
                        }}
                      >
                        {globalT('actions.edit')}
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() =>
                          setDeleteState({
                            kind: 'featured-group',
                            id: group.id,
                            label: group.name,
                          })
                        }
                      >
                        {globalT('actions.delete')}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {assetData.featuredGroups.length === 0 ? (
          <SectionEmptyState title={t('groupsTitle')} description={t('productsEmptySearch')} />
        ) : null}
      </section>

      <section
        id="product-cards"
        className="scroll-mt-24 overflow-hidden rounded-[1.75rem] border border-border/70 bg-background/95 shadow-sm"
      >
        <div className="flex flex-col gap-4 px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold">{t('cardsTitle')}</h2>
            </div>
            <Button
              type="button"
              onClick={() => {
                setEditingCard(null);
                setCardDialogOpen(true);
              }}
            >
              {t('newCard')}
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-14">{t('orderColumn')}</TableHead>
                <TableHead className="w-28">{globalT('labels.status')}</TableHead>
                <TableHead>{t('productNameColumn')}</TableHead>
                <TableHead>{t('titleColumn')}</TableHead>
                <TableHead>{globalT('labels.modified')}</TableHead>
                <TableHead className="text-right">{globalT('labels.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assetData.productCards.map((card) => (
                <TableRow key={card.id}>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        aria-label={t('moveUpLabel', {
                          item: productNameById.get(card.productId) ?? t('unknownProduct'),
                        })}
                        className="h-8 w-8 px-0"
                        disabled={reorderMutation.isPending || card.sortOrder === 0}
                        onClick={() =>
                          handleReorderMove('productCards', 'product-card', card.id, 'up')
                        }
                      >
                        <ChevronUp aria-hidden="true" className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        aria-label={t('moveDownLabel', {
                          item: productNameById.get(card.productId) ?? t('unknownProduct'),
                        })}
                        className="h-8 w-8 px-0"
                        disabled={
                          reorderMutation.isPending ||
                          card.sortOrder === assetData.productCards.length - 1
                        }
                        onClick={() =>
                          handleReorderMove('productCards', 'product-card', card.id, 'down')
                        }
                      >
                        <ChevronDown aria-hidden="true" className="size-4" />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Switch
                      aria-label={globalT('labels.status')}
                      checked={card.active}
                      onCheckedChange={(checked) => {
                        const productName =
                          productNameById.get(card.productId) ?? t('unknownProduct');
                        const actionKey = checked ? 'cardActivate' : 'cardDeactivate';
                        toggleMutation.mutate({
                          section: 'productCards',
                          kind: 'product-card',
                          id: card.id,
                          changes: { active: checked },
                          messages: {
                            loading: t(`${actionKey}Loading`, { product: productName }),
                            success: t(`${actionKey}Success`, { product: productName }),
                            error: t(`${actionKey}Error`, { product: productName }),
                          },
                        });
                      }}
                    />
                  </TableCell>
                  <TableCell className="font-medium">
                    {productNameById.get(card.productId) ?? t('unknownProduct')}
                  </TableCell>
                  <TableCell>{card.titleFr}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {timestampLabel(card.updatedAt)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditingCard(card);
                          setCardDialogOpen(true);
                        }}
                      >
                        {globalT('actions.edit')}
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() =>
                          setDeleteState({
                            kind: 'product-card',
                            id: card.id,
                            label: productNameById.get(card.productId) ?? t('unknownProduct'),
                          })
                        }
                      >
                        {globalT('actions.delete')}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {assetData.productCards.length === 0 ? (
          <SectionEmptyState title={t('cardsTitle')} description={t('productsEmptySearch')} />
        ) : null}
      </section>

      {bannerDialogOpen ? (
        <BannerDialogForm
          open
          mode={editingBanner ? 'edit' : 'create'}
          products={bannerProducts}
          initialValues={editingBanner ?? undefined}
          pending={createMutation.isPending || updateMutation.isPending}
          onOpenChange={(open) => {
            if (!open) {
              closeBannerDialog();
            }
          }}
          onSubmit={submitBanner}
        />
      ) : null}

      {groupDialogOpen ? (
        <FeaturedGroupDialogForm
          open
          mode={editingGroup ? 'edit' : 'create'}
          products={assetMeta.products}
          brands={assetMeta.brands}
          categories={assetMeta.categories}
          initialValues={editingGroup ? toGroupFormValues(editingGroup) : undefined}
          pending={createMutation.isPending || updateMutation.isPending}
          onOpenChange={(open) => {
            if (!open) {
              closeGroupDialog();
            }
          }}
          onSubmit={submitGroup}
        />
      ) : null}

      {cardDialogOpen ? (
        <ProductCardDialogForm
          open
          mode={editingCard ? 'edit' : 'create'}
          products={assetMeta.products}
          initialValues={editingCard ?? undefined}
          pending={createMutation.isPending || updateMutation.isPending}
          onOpenChange={(open) => {
            if (!open) {
              closeCardDialog();
            }
          }}
          onSubmit={submitCard}
        />
      ) : null}

      <DeleteDialog
        open={deleteState !== null}
        title={globalT('labels.deleteDialogTitle')}
        description={globalT('labels.deleteDialogDescription', {
          target: deleteState?.label ?? '',
        })}
        pending={deletePending}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteState(null);
          }
        }}
        onConfirm={() => {
          if (!deleteState) {
            return;
          }

          const section =
            deleteState.kind === 'banner'
              ? 'banners'
              : deleteState.kind === 'featured-group'
                ? 'featuredGroups'
                : 'productCards';
          const messageKey =
            deleteState.kind === 'banner'
              ? 'banner'
              : deleteState.kind === 'featured-group'
                ? 'group'
                : 'card';

          deleteMutation.mutate({
            section,
            kind: deleteState.kind,
            id: deleteState.id,
            messages: {
              loading: t(`${messageKey}DeleteLoading`, { target: deleteState.label }),
              success: t(`${messageKey}DeleteSuccess`, { target: deleteState.label }),
              error: t(`${messageKey}DeleteError`, { target: deleteState.label }),
            },
          });
        }}
      />
    </div>
  );
}
