'use client';
import { ImageIcon, Layers3 } from 'lucide-react';
import { useLocale } from 'next-intl';
import * as React from 'react';
import { assetsAiSurfaceDetails } from '../../../lib/admin-ai-live-surface-details';
import { requestJson } from '../../../lib/admin-api';
import type {
  AssetBannerPayload,
  AssetBannerRecord,
  AssetMetaBrand,
  AssetMetaCategory,
  AssetProductOption,
  AssetsResponse,
  FeaturedProductGroupPayload,
  FeaturedProductGroupRecord,
  ProductCardPayload,
  ProductCardRecord,
} from '../../../lib/assets';
import { toast } from '../../../lib/toast';
import { useAdminAiSurfaceDetails } from '../../admin-ai-surface-context';
import { type AssetsEditorState } from '../assets-editor-panel';
import { type AssetsWorkspaceView, getAssetsWorkspaceCopy } from './copy';

type Row = AssetBannerRecord | FeaturedProductGroupRecord | ProductCardRecord;

function reorder<T extends Row>(items: T[], id: number, direction: -1 | 1) {
  const from = items.findIndex((item) => item.id === id);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= items.length) return items;
  const result = [...items];
  const [item] = result.splice(from, 1);
  result.splice(to, 0, item);
  return result.map((entry, index) => ({ ...entry, sortOrder: index }));
}

export function AssetPreview({ image, kind }: { image?: string | null; kind: 'image' | 'group' }) {
  if (image)
    // eslint-disable-next-line @next/next/no-img-element -- Admin previews display uploaded or remote images directly.
    return <img src={image} alt="" className="size-14 rounded-lg object-cover sm:size-16" />;
  return (
    <span className="grid size-14 place-items-center rounded-lg bg-muted text-muted-foreground sm:size-16">
      {kind === 'group' ? <Layers3 className="size-5" /> : <ImageIcon className="size-5" />}
    </span>
  );
}

export function useAssetsWorkspace({
  view,
  initialAssets,
  taxonomy,
  initialProducts,
}: {
  view: AssetsWorkspaceView;
  initialAssets: AssetsResponse;
  taxonomy: { brands: AssetMetaBrand[]; categories: AssetMetaCategory[] };
  initialProducts: AssetProductOption[];
}) {
  const localeValue = useLocale();
  const locale = localeValue === 'ar' || localeValue === 'fr' ? localeValue : 'en';
  const t = getAssetsWorkspaceCopy(locale);
  const [assets, setAssets] = React.useState(initialAssets);
  const [products, setProducts] = React.useState(initialProducts);
  const [editor, setEditor] = React.useState<AssetsEditorState | null>(null);
  const [pending, setPending] = React.useState(false);
  const optimisticId = React.useRef(-1);
  const [refreshError, setRefreshError] = React.useState('');

  const items =
    view === 'banners'
      ? assets.banners
      : view === 'groups'
        ? assets.featuredGroups
        : assets.productCards;
  const productById = React.useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );
  const viewTitle = view === 'banners' ? t.banners : view === 'groups' ? t.groups : t.cards;
  const routes = [
    { value: 'banners', label: t.banners, href: '/assets' },
    { value: 'groups', label: t.groups, href: '/assets/featured-groups' },
    { value: 'cards', label: t.cards, href: '/assets/product-cards' },
    { value: 'landing', label: t.landingPages, href: '/assets/landing-pages' },
  ];
  useAdminAiSurfaceDetails(
    assetsAiSurfaceDetails({
      view,
      itemCount: items.length,
      pending,
      editor: editor
        ? { kind: editor.kind, itemId: editor.item ? Number(editor.item.id) : null }
        : null,
    }),
  );

  const reload = async () => {
    try {
      const next = await requestJson<AssetsResponse>('/api/assets');
      const ids = [
        ...new Set([
          ...next.banners.flatMap((item) => item.productId ?? []),
          ...next.productCards.map((item) => item.productId),
          ...next.featuredGroups.flatMap((item) => item.productIds),
        ]),
      ];
      const nextProducts: AssetProductOption[] = [];
      for (let offset = 0; offset < ids.length; offset += 100) {
        const response = await requestJson<{ items: AssetProductOption[] }>(
          `/api/assets/product-options?ids=${ids.slice(offset, offset + 100).join(',')}`,
        );
        nextProducts.push(...response.items);
      }
      setAssets(next);
      setProducts(nextProducts);
      setRefreshError('');
    } catch (error) {
      setRefreshError(error instanceof Error ? error.message : t.refreshFailed);
    }
  };

  const perform = async (optimistic: AssetsResponse, operation: () => Promise<unknown>) => {
    const snapshot = assets;
    setAssets(optimistic);
    setPending(true);
    try {
      try {
        await operation();
      } catch (error) {
        setAssets(snapshot);
        toast.error(error instanceof Error ? error.message : t.mutationFailed);
        return false;
      }
      toast.success(t.save);
      await reload();
      return true;
    } finally {
      setPending(false);
    }
  };

  const createEditor = () =>
    setEditor(
      view === 'banners'
        ? { kind: 'banner' }
        : view === 'groups'
          ? { kind: 'group' }
          : { kind: 'card' },
    );

  const submit = async (
    value: AssetBannerPayload | FeaturedProductGroupPayload | ProductCardPayload,
  ) => {
    if (!editor) return;
    const now = new Date().toISOString();
    const nextOptimisticId = () => optimisticId.current--;
    let saved = false;
    if (editor.kind === 'banner') {
      const payload = value as AssetBannerPayload;
      const section = assets.banners;
      const optimisticItem = {
        ...(editor.item ?? { id: nextOptimisticId(), sortOrder: section.length, createdAt: now }),
        ...payload,
        updatedAt: now,
      } as AssetBannerRecord;
      saved = await perform(
        {
          ...assets,
          banners: editor.item
            ? section.map((item) => (item.id === editor.item?.id ? optimisticItem : item))
            : [...section, optimisticItem],
        },
        () =>
          requestJson(editor.item ? `/api/assets/banner/${editor.item.id}` : '/api/assets', {
            method: editor.item ? 'PUT' : 'POST',
            body: JSON.stringify(
              editor.item ? { data: payload } : { kind: 'banner', data: payload },
            ),
          }),
      );
    } else if (editor.kind === 'group') {
      const payload = value as FeaturedProductGroupPayload;
      const section = assets.featuredGroups;
      const optimisticItem = {
        ...(editor.item ?? { id: nextOptimisticId(), sortOrder: section.length, createdAt: now }),
        ...payload,
        updatedAt: now,
      } as FeaturedProductGroupRecord;
      saved = await perform(
        {
          ...assets,
          featuredGroups: editor.item
            ? section.map((item) => (item.id === editor.item?.id ? optimisticItem : item))
            : [...section, optimisticItem],
        },
        () =>
          requestJson(
            editor.item ? `/api/assets/featured-group/${editor.item.id}` : '/api/assets',
            {
              method: editor.item ? 'PUT' : 'POST',
              body: JSON.stringify(
                editor.item ? { data: payload } : { kind: 'featuredGroup', data: payload },
              ),
            },
          ),
      );
    } else {
      const payload = value as ProductCardPayload;
      const section = assets.productCards;
      const optimisticItem = {
        ...(editor.item ?? { id: nextOptimisticId(), sortOrder: section.length, createdAt: now }),
        ...payload,
        updatedAt: now,
      } as ProductCardRecord;
      saved = await perform(
        {
          ...assets,
          productCards: editor.item
            ? section.map((item) => (item.id === editor.item?.id ? optimisticItem : item))
            : [...section, optimisticItem],
        },
        () =>
          requestJson(editor.item ? `/api/assets/product-card/${editor.item.id}` : '/api/assets', {
            method: editor.item ? 'PUT' : 'POST',
            body: JSON.stringify(
              editor.item ? { data: payload } : { kind: 'productCard', data: payload },
            ),
          }),
      );
    }
    if (saved) setEditor((current) => (current === editor ? null : current));
  };

  const setActive = async (item: Row, active: boolean) => {
    const kind =
      view === 'banners' ? 'banner' : view === 'groups' ? 'featured-group' : 'product-card';
    const optimistic =
      view === 'banners'
        ? {
            ...assets,
            banners: assets.banners.map((row) => (row.id === item.id ? { ...row, active } : row)),
          }
        : view === 'groups'
          ? {
              ...assets,
              featuredGroups: assets.featuredGroups.map((row) =>
                row.id === item.id ? { ...row, active } : row,
              ),
            }
          : {
              ...assets,
              productCards: assets.productCards.map((row) =>
                row.id === item.id ? { ...row, active } : row,
              ),
            };
    await perform(optimistic, () =>
      requestJson(`/api/assets/${kind}/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active }),
      }),
    );
  };

  const move = async (item: Row, direction: -1 | 1) => {
    const kind =
      view === 'banners' ? 'banner' : view === 'groups' ? 'featured-group' : 'product-card';
    let moved: Row[];
    let optimistic: AssetsResponse;
    if (view === 'banners') {
      moved = reorder(assets.banners, item.id, direction);
      optimistic = { ...assets, banners: moved as AssetBannerRecord[] };
    } else if (view === 'groups') {
      moved = reorder(assets.featuredGroups, item.id, direction);
      optimistic = { ...assets, featuredGroups: moved as FeaturedProductGroupRecord[] };
    } else {
      moved = reorder(assets.productCards, item.id, direction);
      optimistic = { ...assets, productCards: moved as ProductCardRecord[] };
    }
    if (moved === items) return;
    await perform(optimistic, () =>
      requestJson('/api/assets/reorder', {
        method: 'POST',
        body: JSON.stringify({
          kind,
          items: moved.map(({ id, sortOrder }) => ({ id, sortOrder })),
        }),
      }),
    );
  };

  const remove = async (item: Row) => {
    if (!window.confirm(t.confirmDelete)) return;
    const kind =
      view === 'banners' ? 'banner' : view === 'groups' ? 'featured-group' : 'product-card';
    const optimistic =
      view === 'banners'
        ? { ...assets, banners: assets.banners.filter((row) => row.id !== item.id) }
        : view === 'groups'
          ? { ...assets, featuredGroups: assets.featuredGroups.filter((row) => row.id !== item.id) }
          : { ...assets, productCards: assets.productCards.filter((row) => row.id !== item.id) };
    await perform(optimistic, () =>
      requestJson(`/api/assets/${kind}/${item.id}`, { method: 'DELETE' }),
    );
  };

  const edit = (item: Row) =>
    setEditor(
      view === 'banners'
        ? { kind: 'banner', item: item as AssetBannerRecord }
        : view === 'groups'
          ? { kind: 'group', item: item as FeaturedProductGroupRecord }
          : { kind: 'card', item: item as ProductCardRecord },
    );

  return {
    view: {
      view,
      t,
      viewTitle,
      items,
      refreshError,
      createEditor,
      routes,
      locale,
      pending,
      setPending,
      reload,
      productById,
      setActive,
      edit,
      move,
      remove,
      editor,
      taxonomy,
      setEditor,
      submit,
    } as const,
    fallback: null,
  };
}
