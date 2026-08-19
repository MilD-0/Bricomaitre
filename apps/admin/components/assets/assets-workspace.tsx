'use client';

/* eslint-disable @next/next/no-img-element -- Asset previews use admin-configured CDN origins. */

import { ImageIcon, Layers3, Plus } from 'lucide-react';
import Link from 'next/link';
import { useLocale } from 'next-intl';
import * as React from 'react';

import { requestJson } from '../../lib/admin-api';
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
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';
import { CompactMenu, CompactMenuItem } from '../ui/compact-menu';
import { Switch } from '../ui/switch';
import {
  AssetsEditorPanel,
  type AssetsEditorState,
  type AssetsWorkspaceCopy,
} from './assets-editor-panel';

export type AssetsWorkspaceView = 'banners' | 'groups' | 'cards';

const copy: Record<'en' | 'fr' | 'ar', AssetsWorkspaceCopy> = {
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
    pinProducts: 'Show at top of products page',
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
    productSearch: 'Search products',
    productEmpty: 'No products match.',
    selected: 'Selected products',
    remove: 'Remove',
    validation: 'Review the highlighted information.',
    mutationFailed: 'The change could not be saved.',
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
    pinProducts: 'Afficher en haut de la page produits',
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
    productSearch: 'Rechercher des produits',
    productEmpty: 'Aucun produit correspondant.',
    selected: 'Produits sélectionnés',
    remove: 'Retirer',
    validation: 'Vérifiez les informations saisies.',
    mutationFailed: 'La modification n’a pas pu être enregistrée.',
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
    pinProducts: 'إظهارها أعلى صفحة المنتجات',
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
    productSearch: 'البحث في المنتجات',
    productEmpty: 'لا توجد منتجات مطابقة.',
    selected: 'المنتجات المختارة',
    remove: 'إزالة',
    validation: 'راجع المعلومات المدخلة.',
    mutationFailed: 'تعذّر حفظ التغيير.',
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

  const reload = async () => {
    const next = await requestJson<AssetsResponse>('/api/assets');
    setAssets(next);
    const ids = [
      ...new Set([
        ...next.banners.flatMap((item) => item.productId ?? []),
        ...next.productCards.map((item) => item.productId),
        ...next.featuredGroups.flatMap((item) => item.productIds),
      ]),
    ];
    if (ids.length) {
      const response = await requestJson<{ items: AssetProductOption[] }>(
        `/api/assets/product-options?ids=${ids.join(',')}`,
      );
      setProducts(response.items);
    }
  };

  const perform = async (optimistic: AssetsResponse, operation: () => Promise<unknown>) => {
    const snapshot = assets;
    setAssets(optimistic);
    setPending(true);
    try {
      await operation();
      await reload();
      toast.success(t.save);
      return true;
    } catch (error) {
      setAssets(snapshot);
      toast.error(error instanceof Error ? error.message : t.mutationFailed);
      return false;
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
    if (saved) setEditor(null);
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
    <div className="-mx-1 sm:-mx-2 lg:-mx-4" data-assets-workspace={view}>
      <header className="border-b border-border/60 px-2 pb-4 sm:px-3 lg:px-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="hidden text-2xl font-semibold tracking-[-0.025em] lg:block">
              {t.title}
            </h1>
            <p className="text-sm font-medium text-foreground lg:mt-1 lg:font-normal lg:text-muted-foreground">
              {viewTitle} · {items.length}
            </p>
          </div>
          <Button onClick={createEditor}>
            <Plus className="size-4" aria-hidden="true" />
            {t.create}
          </Button>
        </div>
        <nav className="mt-4 flex gap-1 overflow-x-auto" aria-label={t.title}>
          {routes.map((route) => (
            <Link
              key={route.value}
              href={`/${locale}${route.href}`}
              className={cn(
                'whitespace-nowrap rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground',
                route.value === view &&
                  'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground',
              )}
            >
              {route.label}
            </Link>
          ))}
        </nav>
      </header>

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
                  disabled={pending || item.id < 0}
                  onCheckedChange={(active) => void setActive(item, active)}
                />
                <CompactMenu label={`${t.actions} · ${primary}`}>
                  <CompactMenuItem onClick={() => edit(item)}>{t.edit}</CompactMenuItem>
                  <CompactMenuItem
                    disabled={index === 0 || pending}
                    onClick={() => void move(item, -1)}
                  >
                    {t.moveUp}
                  </CompactMenuItem>
                  <CompactMenuItem
                    disabled={index === items.length - 1 || pending}
                    onClick={() => void move(item, 1)}
                  >
                    {t.moveDown}
                  </CompactMenuItem>
                  <CompactMenuItem destructive onClick={() => void remove(item)}>
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
    </div>
  );
}
