'use client';

/* eslint-disable @next/next/no-img-element -- Asset previews use admin-configured CDN origins. */

import { ImageIcon, Layers3, Plus } from 'lucide-react';
import { useLocale } from 'next-intl';
import * as React from 'react';

import { requestJson } from '../../lib/admin-api';
import { assetsAiSurfaceDetails } from '../../lib/admin-ai-live-surface-details';
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
} from '../../lib/assets';
import { toast } from '../../lib/toast';
import { Button } from '../ui/button';
import { useAdminAiSurfaceDetails } from '../admin-ai-surface-context';
import { CompactMenu, CompactMenuItem } from '../ui/compact-menu';
import { Switch } from '../ui/switch';
import {
  WorkspaceActions,
  WorkspaceFrame,
  WorkspaceHeader,
  WorkspaceHeading,
  WorkspaceNavigation,
  WorkspaceNavigationLink,
} from '../ui/workspace';
import {
  AssetsEditorPanel,
  type AssetsEditorState,
  type AssetsWorkspaceCopy,
} from './assets-editor-panel';

export type AssetsWorkspaceView = 'banners' | 'groups' | 'cards';

const copy: Record<
  'en' | 'fr' | 'ar',
  AssetsWorkspaceCopy & { refreshFailed: string; retry: string }
> = {
  en: {
    title: 'Assets',
    banners: 'Banners',
    groups: 'Featured groups',
    cards: 'Product cards',
    landingPages: 'Landing pages',
    create: 'Create',
    edit: 'Edit',
    delete: 'Delete',
    cancel: 'Cancel',
    save: 'Save',
    close: 'Close',
    active: 'Active',
    inactive: 'Inactive',
    actions: 'Actions',
    moveUp: 'Move up',
    moveDown: 'Move down',
    modified: 'Modified',
    noRecords: 'No records yet.',
    confirmDelete: 'Delete this record? This cannot be undone.',
    product: 'Product',
    order: 'Order',
    bannerTitle: 'Title',
    bannerTitleAr: 'Arabic title',
    landscape: 'Landscape image',
    portrait: 'Portrait image',
    groupName: 'Group name',
    groupNameAr: 'Arabic group name',
    cta: 'CTA text',
    ctaAr: 'Arabic CTA text',
    link: 'CTA link',
    recommendationPriority: 'Prioritize in product recommendations',
    products: 'Products',
    brands: 'Brands',
    categories: 'Categories',
    noSelection: 'No selection',
    cardTitleFr: 'French title',
    cardTitleAr: 'Arabic title',
    cardDescriptionFr: 'French description',
    cardDescriptionAr: 'Arabic description',
    characteristicsFr: 'French characteristics · one per line',
    characteristicsAr: 'Arabic characteristics · one per line',
    characteristicsRequirement: 'Enter at least three features in French and Arabic, one per line.',
    productSearch: 'Search products',
    productEmpty: 'No products match.',
    selected: 'Selected products',
    remove: 'Remove',
    validation: 'Review the entered information.',
    mutationFailed: 'The change could not be saved.',
    refreshFailed: 'Saved. The list could not be refreshed.',
    retry: 'Refresh list',
  },
  fr: {
    title: 'Ressources',
    banners: 'Bannières',
    groups: 'Groupes vedettes',
    cards: 'Cartes produit',
    landingPages: 'Pages d’atterrissage',
    create: 'Créer',
    edit: 'Modifier',
    delete: 'Supprimer',
    cancel: 'Annuler',
    save: 'Enregistrer',
    close: 'Fermer',
    active: 'Actif',
    inactive: 'Inactif',
    actions: 'Actions',
    moveUp: 'Monter',
    moveDown: 'Descendre',
    modified: 'Modifié',
    noRecords: 'Aucun élément.',
    confirmDelete: 'Supprimer cet élément ? Cette action est définitive.',
    product: 'Produit',
    order: 'Ordre',
    bannerTitle: 'Titre',
    bannerTitleAr: 'Titre arabe',
    landscape: 'Image horizontale',
    portrait: 'Image verticale',
    groupName: 'Nom du groupe',
    groupNameAr: 'Nom arabe',
    cta: 'Texte du CTA',
    ctaAr: 'CTA arabe',
    link: 'Lien du CTA',
    recommendationPriority: 'Prioriser dans les recommandations produits',
    products: 'Produits',
    brands: 'Marques',
    categories: 'Catégories',
    noSelection: 'Aucune sélection',
    cardTitleFr: 'Titre français',
    cardTitleAr: 'Titre arabe',
    cardDescriptionFr: 'Description française',
    cardDescriptionAr: 'Description arabe',
    characteristicsFr: 'Caractéristiques françaises · une par ligne',
    characteristicsAr: 'Caractéristiques arabes · une par ligne',
    characteristicsRequirement:
      'Saisissez au moins trois caractéristiques en français et en arabe, une par ligne.',
    productSearch: 'Rechercher des produits',
    productEmpty: 'Aucun produit correspondant.',
    selected: 'Produits sélectionnés',
    remove: 'Retirer',
    validation: 'Vérifiez les informations saisies.',
    mutationFailed: 'La modification n’a pas pu être enregistrée.',
    refreshFailed: 'Enregistré. La liste n’a pas pu être actualisée.',
    retry: 'Actualiser la liste',
  },
  ar: {
    title: 'المحتوى المرئي',
    banners: 'اللافتات',
    groups: 'المجموعات المميزة',
    cards: 'بطاقات المنتجات',
    landingPages: 'صفحات الهبوط',
    create: 'إنشاء',
    edit: 'تعديل',
    delete: 'حذف',
    cancel: 'إلغاء',
    save: 'حفظ',
    close: 'إغلاق',
    active: 'نشط',
    inactive: 'غير نشط',
    actions: 'الإجراءات',
    moveUp: 'تحريك للأعلى',
    moveDown: 'تحريك للأسفل',
    modified: 'آخر تعديل',
    noRecords: 'لا توجد عناصر بعد.',
    confirmDelete: 'حذف هذا العنصر؟ لا يمكن التراجع عن ذلك.',
    product: 'المنتج',
    order: 'الترتيب',
    bannerTitle: 'العنوان',
    bannerTitleAr: 'العنوان العربي',
    landscape: 'الصورة الأفقية',
    portrait: 'الصورة العمودية',
    groupName: 'اسم المجموعة',
    groupNameAr: 'الاسم العربي',
    cta: 'نص الدعوة',
    ctaAr: 'نص الدعوة العربي',
    link: 'رابط الدعوة',
    recommendationPriority: 'إعطاء الأولوية في توصيات المنتجات',
    products: 'المنتجات',
    brands: 'العلامات',
    categories: 'الفئات',
    noSelection: 'لا يوجد اختيار',
    cardTitleFr: 'العنوان الفرنسي',
    cardTitleAr: 'العنوان العربي',
    cardDescriptionFr: 'الوصف الفرنسي',
    cardDescriptionAr: 'الوصف العربي',
    characteristicsFr: 'الخصائص الفرنسية · واحدة في كل سطر',
    characteristicsAr: 'الخصائص العربية · واحدة في كل سطر',
    characteristicsRequirement: 'أدخل ثلاث ميزات على الأقل بالفرنسية والعربية، كل ميزة في سطر.',
    productSearch: 'البحث في المنتجات',
    productEmpty: 'لا توجد منتجات مطابقة.',
    selected: 'المنتجات المختارة',
    remove: 'إزالة',
    validation: 'راجع المعلومات المدخلة.',
    mutationFailed: 'تعذّر حفظ التغيير.',
    refreshFailed: 'تم الحفظ. تعذّر تحديث القائمة.',
    retry: 'تحديث القائمة',
  },
};

export function getAssetsWorkspaceCopy(locale: string) {
  return copy[locale === 'ar' || locale === 'fr' ? locale : 'en'];
}

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

function AssetPreview({ image, kind }: { image?: string | null; kind: 'image' | 'group' }) {
  if (image)
    return <img src={image} alt="" className="size-14 rounded-lg object-cover sm:size-16" />;
  return (
    <span className="grid size-14 place-items-center rounded-lg bg-muted text-muted-foreground sm:size-16">
      {kind === 'group' ? <Layers3 className="size-5" /> : <ImageIcon className="size-5" />}
    </span>
  );
}

export function AssetsWorkspace({
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

  return (
    <WorkspaceFrame data-assets-workspace={view}>
      <WorkspaceHeader>
        <WorkspaceHeading title={t.title} meta={`${viewTitle} · ${items.length}`} />
        <WorkspaceActions>
          <Button disabled={Boolean(refreshError)} onClick={createEditor}>
            <Plus className="size-4" aria-hidden="true" />
            {t.create}
          </Button>
        </WorkspaceActions>
      </WorkspaceHeader>
      <WorkspaceNavigation aria-label={t.title}>
        {routes.map((route) => (
          <WorkspaceNavigationLink
            key={route.value}
            href={`/${locale}${route.href}`}
            active={route.value === view}
          >
            {route.label}
          </WorkspaceNavigationLink>
        ))}
      </WorkspaceNavigation>

      {refreshError ? (
        <div role="alert" className="border-b border-border/60 px-4 py-3 text-sm">
          <p>{t.refreshFailed}</p>
          <p className="mt-1 text-muted-foreground">{refreshError}</p>
          <Button
            className="mt-3"
            variant="outline"
            disabled={pending}
            onClick={async () => {
              setPending(true);
              try {
                await reload();
              } finally {
                setPending(false);
              }
            }}
          >
            {t.retry}
          </Button>
        </div>
      ) : null}
      <div className="divide-y divide-border/60 border-b border-border/60">
        {items.map((item, index) => {
          const banner = view === 'banners' ? (item as AssetBannerRecord) : null;
          const group = view === 'groups' ? (item as FeaturedProductGroupRecord) : null;
          const card = view === 'cards' ? (item as ProductCardRecord) : null;
          const product = productById.get(banner?.productId ?? card?.productId ?? 0);
          const primary =
            banner?.title ?? group?.name ?? card?.titleFr ?? product?.title ?? t.product;
          const secondary = banner
            ? (product?.title ?? t.noSelection)
            : group
              ? `${group.productIds.length} ${t.products} · ${group.brandIds.length} ${t.brands} · ${group.categoryIds.length} ${t.categories}`
              : (product?.title ?? t.noSelection);
          return (
            <div
              key={item.id}
              className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-2 py-3 sm:grid-cols-[auto_minmax(0,1fr)_7rem_8rem_auto] sm:px-3 lg:px-4"
            >
              <AssetPreview
                image={banner?.imageUrlLandscape ?? product?.imageUrl}
                kind={group ? 'group' : 'image'}
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium sm:text-base">{primary}</p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground sm:text-sm">
                  {secondary}
                </p>
                <p className="mt-1 text-xs text-muted-foreground sm:hidden">
                  #{index + 1} · {new Date(item.updatedAt).toLocaleDateString(locale)}
                </p>
              </div>
              <div className="hidden text-xs text-muted-foreground sm:block">#{index + 1}</div>
              <div className="hidden text-xs text-muted-foreground sm:block">
                {new Date(item.updatedAt).toLocaleDateString(locale)}
              </div>
              <div className="flex items-center gap-1.5">
                <Switch
                  aria-label={`${t.active} · ${primary}`}
                  checked={item.active}
                  disabled={pending || Boolean(refreshError) || item.id < 0}
                  onCheckedChange={(active) => void setActive(item, active)}
                />
                <CompactMenu label={`${t.actions} · ${primary}`}>
                  <CompactMenuItem
                    disabled={pending || Boolean(refreshError) || item.id < 0}
                    onClick={() => edit(item)}
                  >
                    {t.edit}
                  </CompactMenuItem>
                  <CompactMenuItem
                    disabled={index === 0 || pending || Boolean(refreshError)}
                    onClick={() => void move(item, -1)}
                  >
                    {t.moveUp}
                  </CompactMenuItem>
                  <CompactMenuItem
                    disabled={index === items.length - 1 || pending || Boolean(refreshError)}
                    onClick={() => void move(item, 1)}
                  >
                    {t.moveDown}
                  </CompactMenuItem>
                  <CompactMenuItem
                    destructive
                    disabled={pending || Boolean(refreshError) || item.id < 0}
                    onClick={() => void remove(item)}
                  >
                    {t.delete}
                  </CompactMenuItem>
                </CompactMenu>
              </div>
            </div>
          );
        })}
        {items.length === 0 ? (
          <p className="px-4 py-14 text-center text-sm text-muted-foreground">{t.noRecords}</p>
        ) : null}
      </div>

      {editor ? (
        <AssetsEditorPanel
          state={editor}
          copy={t}
          brands={taxonomy.brands}
          categories={taxonomy.categories}
          pending={pending}
          onClose={() => setEditor(null)}
          onSubmit={submit}
        />
      ) : null}
    </WorkspaceFrame>
  );
}
