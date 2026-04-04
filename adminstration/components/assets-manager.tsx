'use client';

import { ChevronDown, ChevronUp } from 'lucide-react';
import { zodResolver } from '@hookform/resolvers/zod';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';

import {
  assetBannerSchema,
  featuredProductGroupSchema,
  productCardSchema,
  type AssetBannerInput,
  type AssetBannerRecord,
  type AssetMetaBrand,
  type AssetMetaCategory,
  type AssetMetaProduct,
  type AssetsResponse,
  type FeaturedProductGroupInput,
  type FeaturedProductGroupRecord,
  type ProductCardInput,
  type ProductCardRecord,
} from '../lib/assets';
import { toast } from '../lib/toast';
import { cn } from '../lib/utils';
import { ImageUploadField } from './image-upload-field';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from './ui/empty';
import { Field, FieldError, FieldLabel } from './ui/field';
import { Input } from './ui/input';
import { Skeleton } from './ui/skeleton';
import { Switch } from './ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Textarea } from './ui/textarea';

const bannerDefaults: AssetBannerInput = {
  title: '',
  imageUrl: '',
  productId: null,
  active: true,
};

const groupDefaults: FeaturedProductGroupInput = {
  name: '',
  cta: '',
  link: '',
  productIds: [],
  brandIds: [],
  categoryIds: [],
  showAtTopOfProductsPage: false,
  active: true,
};

const cardDefaults: ProductCardInput = {
  productId: 0,
  titleAr: '',
  titleFr: '',
  descriptionAr: '',
  descriptionFr: '',
  characteristicsAr: [],
  characteristicsFr: [],
  active: true,
};

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

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });

  if (!res.ok) {
    throw new Error(await res.text());
  }

  return res.json() as Promise<T>;
}

function linesToArray(value: string) {
  return value
    .split('\n')
    .map((entry) => entry.replace(/\r/g, ''))
    .filter((entry) => entry.trim().length > 0);
}

function arrayToLines(value: string[]) {
  return value.join('\n');
}

function timestampLabel(value: string) {
  return new Date(value).toLocaleString();
}

function toGroupFormValues(group: FeaturedProductGroupRecord): FeaturedProductGroupInput {
  return {
    ...group,
    cta: group.cta ?? '',
    link: group.link ?? '',
  };
}

function updateBanners(current: AssetsResponse | undefined, updater: (items: AssetBannerRecord[]) => AssetBannerRecord[]) {
  if (!current) {
    return current;
  }

  return { ...current, banners: updater(current.banners) };
}

function updateFeaturedGroups(current: AssetsResponse | undefined, updater: (items: FeaturedProductGroupRecord[]) => FeaturedProductGroupRecord[]) {
  if (!current) {
    return current;
  }

  return { ...current, featuredGroups: updater(current.featuredGroups) };
}

function updateProductCards(current: AssetsResponse | undefined, updater: (items: ProductCardRecord[]) => ProductCardRecord[]) {
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

function reorderItems<T extends { id: number; sortOrder: number; updatedAt: string }>(items: T[], activeId: number, overId: number) {
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
            <div key={rowIndex} className="grid grid-cols-[5rem_7rem_minmax(12rem,1fr)_minmax(12rem,1fr)_10rem_10rem] gap-4 border-b border-border/60 px-4 py-4 sm:px-5">
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

function SectionEmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
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

function SelectionField({
  label,
  items,
  selectedIds,
  searchPlaceholder,
  emptyLabel,
  layout = 'compact',
  onChange,
}: {
  label: string;
  items: Array<{ id: number; label: string; imageUrl?: string | null; description?: string | null }>;
  selectedIds: number[];
  searchPlaceholder: string;
  emptyLabel: string;
  layout?: 'compact' | 'rich';
  onChange: (value: number[]) => void;
}) {
  const t = useTranslations('assetsManager');
  const [search, setSearch] = useState('');

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (query.length === 0) {
      return items;
    }

    return items.filter((item) => item.label.toLowerCase().includes(query));
  }, [items, search]);

  const selectedItems = items.filter((item) => selectedIds.includes(item.id));

  const toggle = (id: number) => {
    onChange(selectedIds.includes(id) ? selectedIds.filter((entry) => entry !== id) : [...selectedIds, id]);
  };

  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <div className="flex flex-col gap-3 rounded-xl border border-border/70 bg-muted/20 p-3">
        <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={searchPlaceholder} />

        <div className="flex flex-wrap gap-2">
          {selectedItems.length > 0 ? (
            selectedItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className="inline-flex items-center rounded-full border border-border bg-background px-3 py-1 text-xs font-medium"
                aria-label={t('removeSelection', { name: item.label })}
                onClick={() => toggle(item.id)}
              >
                {item.label}
              </button>
            ))
          ) : (
            <Badge variant="outline">{t('nothingSelected')}</Badge>
          )}
        </div>

        <div className={layout === 'rich' ? 'flex max-h-72 flex-col gap-3 overflow-y-auto' : 'grid max-h-56 gap-2 overflow-y-auto sm:grid-cols-2'}>
          {filteredItems.length > 0 ? (
            filteredItems.map((item) => {
              const checked = selectedIds.includes(item.id);

              if (layout === 'rich') {
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={checked}
                    aria-label={checked ? t('removeSelection', { name: item.label }) : t('addSelection', { name: item.label })}
                    className="flex w-full items-center gap-4 rounded-2xl border border-border/70 bg-background px-4 py-3 text-left"
                    onClick={() => toggle(item.id)}
                  >
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt={item.label}
                        className="size-16 rounded-xl object-cover"
                      />
                    ) : (
                      <div className="flex size-16 items-center justify-center rounded-xl border border-dashed border-border bg-muted text-xs text-muted-foreground">
                        {t('noImage')}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium leading-5 text-foreground">{item.label}</p>
                      {item.description ? <p className="mt-1 text-sm leading-5 text-muted-foreground">{item.description}</p> : null}
                    </div>
                    <Badge variant={checked ? 'default' : 'outline'}>
                      {checked ? t('selected') : t('add')}
                    </Badge>
                  </button>
                );
              }

              return (
                <label
                  key={item.id}
                  className="flex cursor-pointer items-center gap-3 rounded-xl border border-border/70 bg-background px-3 py-2 text-sm"
                >
                  <Checkbox
                    aria-label={item.label}
                    checked={checked}
                    onChange={() => toggle(item.id)}
                  />
                  {item.imageUrl ? (
                    <img
                      src={item.imageUrl}
                      alt={item.label}
                      className="size-10 rounded-lg object-cover"
                    />
                  ) : null}
                  <span className="min-w-0 truncate">{item.label}</span>
                </label>
              );
            })
          ) : (
            <p className="text-sm text-muted-foreground">{emptyLabel}</p>
          )}
        </div>
      </div>
    </Field>
  );
}

function ProductPickerField({
  label,
  items,
  selectedId,
  searchPlaceholder,
  emptyLabel,
  clearable = false,
  onChange,
}: {
  label: string;
  items: Array<{ id: number; label: string; imageUrl?: string | null; description?: string | null }>;
  selectedId: number | null;
  searchPlaceholder: string;
  emptyLabel: string;
  clearable?: boolean;
  onChange: (value: number | null) => void;
}) {
  const t = useTranslations('assetsManager');
  const [search, setSearch] = useState('');

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (query.length === 0) {
      return items;
    }

    return items.filter((item) => item.label.toLowerCase().includes(query) || (item.description?.toLowerCase().includes(query) ?? false));
  }, [items, search]);

  const selectedItem = items.find((item) => item.id === selectedId) ?? null;

  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <div className="flex flex-col gap-3 rounded-xl border border-border/70 bg-muted/20 p-3">
        <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={searchPlaceholder} />

        <div className="flex flex-wrap gap-2">
          {selectedItem ? (
            <button
              type="button"
              className="inline-flex items-center rounded-full border border-border bg-background px-3 py-1 text-xs font-medium"
              aria-label={t('removeSelection', { name: selectedItem.label })}
              onClick={() => onChange(null)}
            >
              {selectedItem.label}
            </button>
          ) : (
            <Badge variant="outline">{t('nothingSelected')}</Badge>
          )}
          {clearable && selectedItem ? (
            <Button type="button" variant="outline" size="sm" onClick={() => onChange(null)}>
              {t('clear')}
            </Button>
          ) : null}
        </div>

        <div className="flex max-h-72 flex-col gap-3 overflow-y-auto">
          {filteredItems.length > 0 ? (
            filteredItems.map((item) => {
              const selected = item.id === selectedId;

              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={selected}
                  aria-label={selected ? t('removeSelection', { name: item.label }) : t('chooseSelection', { name: item.label })}
                  className="flex w-full items-center gap-4 rounded-2xl border border-border/70 bg-background px-4 py-3 text-left"
                  onClick={() => onChange(selected ? null : item.id)}
                >
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt={item.label} className="size-16 rounded-xl object-cover" />
                  ) : (
                    <div className="flex size-16 items-center justify-center rounded-xl border border-dashed border-border bg-muted text-xs text-muted-foreground">
                      {t('noImage')}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium leading-5 text-foreground">{item.label}</p>
                    {item.description ? <p className="mt-1 text-sm leading-5 text-muted-foreground">{item.description}</p> : null}
                  </div>
                  <Badge variant={selected ? 'default' : 'outline'}>
                    {selected ? t('selected') : t('choose')}
                  </Badge>
                </button>
              );
            })
          ) : (
            <p className="text-sm text-muted-foreground">{emptyLabel}</p>
          )}
        </div>
      </div>
    </Field>
  );
}

function BannerDialogForm({
  open,
  mode,
  products,
  form,
  pending,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  mode: 'create' | 'edit';
  products: AssetMetaProduct[];
  form: ReturnType<typeof useForm<AssetBannerInput>>;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: () => void;
}) {
  const t = useTranslations('assetsManager');
  const imageValue = useWatch({ control: form.control, name: 'imageUrl' }) ?? '';
  const selectedProductId = useWatch({ control: form.control, name: 'productId' }) ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? t('createBannerTitle') : t('editBannerTitle')}</DialogTitle>
          <DialogDescription>{t('bannerDialogDescription')}</DialogDescription>
        </DialogHeader>

        <form
          className="mt-5 flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void onSubmit();
          }}
        >
          <Field>
            <FieldLabel htmlFor="asset-banner-title">{t('titleLabel')}</FieldLabel>
            <Input id="asset-banner-title" placeholder={t('bannerTitlePlaceholder')} {...form.register('title')} />
            {form.formState.errors.title ? <FieldError>{form.formState.errors.title.message}</FieldError> : null}
          </Field>

          <ProductPickerField
            label={t('linkedProductLabel')}
            items={products.map((product) => ({
              id: product.id,
              label: product.title,
              imageUrl: product.images[0] ?? null,
              description: product.slug,
            }))}
            selectedId={selectedProductId === null ? null : Number(selectedProductId)}
            searchPlaceholder={t('productsSearchPlaceholder')}
            emptyLabel={t('productsEmptySearch')}
            clearable
            onChange={(value) => form.setValue('productId', value, { shouldDirty: true, shouldValidate: true })}
          />
          {form.formState.errors.productId ? <FieldError>{form.formState.errors.productId.message}</FieldError> : null}

          <ImageUploadField
            uploadUrl="/api/uploads/assets"
            label={t('bannerImageLabel')}
            value={imageValue ? [imageValue] : []}
            onChange={(urls) => form.setValue('imageUrl', urls[0] ?? '', { shouldDirty: true, shouldValidate: true })}
          />
          {form.formState.errors.imageUrl ? <FieldError>{form.formState.errors.imageUrl.message}</FieldError> : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={pending}>
              {mode === 'create' ? t('createBanner') : t('updateBanner')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function FeaturedGroupDialogForm({
  open,
  mode,
  products,
  brands,
  categories,
  form,
  pending,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  mode: 'create' | 'edit';
  products: AssetMetaProduct[];
  brands: AssetMetaBrand[];
  categories: AssetMetaCategory[];
  form: ReturnType<typeof useForm<FeaturedProductGroupInput>>;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: () => void;
}) {
  const t = useTranslations('assetsManager');
  const selectedProductIds = (useWatch({ control: form.control, name: 'productIds' }) as number[] | undefined) ?? [];
  const selectedBrandIds = (useWatch({ control: form.control, name: 'brandIds' }) as number[] | undefined) ?? [];
  const selectedCategoryIds = (useWatch({ control: form.control, name: 'categoryIds' }) as number[] | undefined) ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? t('createGroupTitle') : t('editGroupTitle')}</DialogTitle>
          <DialogDescription>{t('groupDialogDescription')}</DialogDescription>
        </DialogHeader>

        <form
          className="mt-5 flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void onSubmit();
          }}
        >
          <Field>
            <FieldLabel htmlFor="asset-group-name">{t('groupNameLabel')}</FieldLabel>
            <Input id="asset-group-name" placeholder={t('groupNamePlaceholder')} {...form.register('name')} />
            {form.formState.errors.name ? <FieldError>{form.formState.errors.name.message}</FieldError> : null}
          </Field>

          <div className="grid gap-4 md:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="asset-group-cta">{t('groupCtaLabel')}</FieldLabel>
              <Input id="asset-group-cta" placeholder={t('groupCtaPlaceholder')} {...form.register('cta')} />
              {form.formState.errors.cta ? <FieldError>{form.formState.errors.cta.message}</FieldError> : null}
            </Field>

            <Field>
              <FieldLabel htmlFor="asset-group-link">{t('groupLinkLabel')}</FieldLabel>
              <Input id="asset-group-link" placeholder={t('groupLinkPlaceholder')} {...form.register('link')} />
              {form.formState.errors.link ? <FieldError>{form.formState.errors.link.message}</FieldError> : null}
            </Field>
          </div>

          <Field>
            <div className="flex items-center justify-between gap-4 rounded-xl border border-border/70 bg-muted/20 px-4 py-3">
              <div className="flex flex-col gap-1">
                <FieldLabel htmlFor="asset-group-show-at-top">{t('groupShowAtTopLabel')}</FieldLabel>
                <p className="text-sm text-muted-foreground">{t('groupShowAtTopDescription')}</p>
              </div>
              <Switch
                id="asset-group-show-at-top"
                checked={form.watch('showAtTopOfProductsPage') ?? false}
                onCheckedChange={(checked) => form.setValue('showAtTopOfProductsPage', checked, { shouldDirty: true, shouldValidate: true })}
              />
            </div>
          </Field>

          <SelectionField
            label={t('productsLabel')}
            items={products.map((product) => ({
              id: product.id,
              label: product.title,
              imageUrl: product.images[0] ?? null,
              description: product.slug,
            }))}
            selectedIds={selectedProductIds}
            searchPlaceholder={t('productsSearchPlaceholder')}
            emptyLabel={t('productsEmptySearch')}
            layout="rich"
            onChange={(value) => form.setValue('productIds', value, { shouldDirty: true, shouldValidate: true })}
          />

          <SelectionField
            label={t('brandsLabel')}
            items={brands.map((brand) => ({ id: brand.id, label: brand.name }))}
            selectedIds={selectedBrandIds}
            searchPlaceholder={t('brandsSearchPlaceholder')}
            emptyLabel={t('brandsEmptySearch')}
            onChange={(value) => form.setValue('brandIds', value, { shouldDirty: true, shouldValidate: true })}
          />

          <SelectionField
            label={t('categoriesLabel')}
            items={categories.map((category) => ({ id: category.id, label: category.name }))}
            selectedIds={selectedCategoryIds}
            searchPlaceholder={t('categoriesSearchPlaceholder')}
            emptyLabel={t('categoriesEmptySearch')}
            onChange={(value) => form.setValue('categoryIds', value, { shouldDirty: true, shouldValidate: true })}
          />
          {form.formState.errors.productIds ? <FieldError>{form.formState.errors.productIds.message}</FieldError> : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={pending}>
              {mode === 'create' ? t('createGroup') : t('updateGroup')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ProductCardDialogForm({
  open,
  mode,
  products,
  form,
  pending,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  mode: 'create' | 'edit';
  products: AssetMetaProduct[];
  form: ReturnType<typeof useForm<ProductCardInput>>;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: () => void;
}) {
  const t = useTranslations('assetsManager');
  const selectedProductId = useWatch({ control: form.control, name: 'productId' });
  const [characteristicsArDraft, setCharacteristicsArDraft] = useState('');
  const [characteristicsFrDraft, setCharacteristicsFrDraft] = useState('');

  const selectedProduct = useMemo(
    () => products.find((product) => product.id === Number(selectedProductId)) ?? null,
    [products, selectedProductId],
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    setCharacteristicsArDraft(arrayToLines(form.getValues('characteristicsAr') ?? []));
    setCharacteristicsFrDraft(arrayToLines(form.getValues('characteristicsFr') ?? []));
  }, [form, open, mode]);

  const syncCharacteristicsToForm = () => {
    form.setValue('characteristicsAr', linesToArray(characteristicsArDraft), {
      shouldDirty: true,
      shouldValidate: false,
    });
    form.setValue('characteristicsFr', linesToArray(characteristicsFrDraft), {
      shouldDirty: true,
      shouldValidate: false,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? t('createCardTitle') : t('editCardTitle')}</DialogTitle>
          <DialogDescription>{t('cardDialogDescription')}</DialogDescription>
        </DialogHeader>

        <form
          className="mt-5 flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            syncCharacteristicsToForm();
            void onSubmit();
          }}
        >
          <ProductPickerField
            label={t('productNameLabel')}
            items={products.map((product) => ({
              id: product.id,
              label: product.title,
              imageUrl: product.images[0] ?? null,
              description: product.slug,
            }))}
            selectedId={Number(selectedProductId) || null}
            searchPlaceholder={t('productsSearchPlaceholder')}
            emptyLabel={t('productsEmptySearch')}
            onChange={(value) => form.setValue('productId', value ?? 0, { shouldDirty: true, shouldValidate: true })}
          />
          {form.formState.errors.productId ? <FieldError>{form.formState.errors.productId.message}</FieldError> : null}

          <div className="rounded-xl border border-border/70 bg-muted/30 px-3 py-3">
            {selectedProduct?.images[0] ? (
              <div className="flex items-center gap-3">
                <img
                  src={selectedProduct.images[0]}
                  alt={selectedProduct.title}
                  className="size-16 rounded-lg object-cover"
                />
                <div className="flex flex-col gap-1">
                  <p className="text-sm font-medium">{t('cardImageLabel')}</p>
                  <p className="text-sm text-muted-foreground">{selectedProduct.title}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t('cardImageMissing')}</p>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="asset-card-title-ar">{t('titleArLabel')}</FieldLabel>
              <Input id="asset-card-title-ar" placeholder={t('titleArPlaceholder')} {...form.register('titleAr')} />
              {form.formState.errors.titleAr ? <FieldError>{form.formState.errors.titleAr.message}</FieldError> : null}
            </Field>

            <Field>
              <FieldLabel htmlFor="asset-card-title-fr">{t('titleFrLabel')}</FieldLabel>
              <Input id="asset-card-title-fr" placeholder={t('titleFrPlaceholder')} {...form.register('titleFr')} />
              {form.formState.errors.titleFr ? <FieldError>{form.formState.errors.titleFr.message}</FieldError> : null}
            </Field>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="asset-card-description-ar">{t('descriptionArLabel')}</FieldLabel>
              <Textarea id="asset-card-description-ar" placeholder={t('descriptionArPlaceholder')} maxLength={140} {...form.register('descriptionAr')} />
              {form.formState.errors.descriptionAr ? <FieldError>{form.formState.errors.descriptionAr.message}</FieldError> : null}
            </Field>

            <Field>
              <FieldLabel htmlFor="asset-card-description-fr">{t('descriptionFrLabel')}</FieldLabel>
              <Textarea id="asset-card-description-fr" placeholder={t('descriptionFrPlaceholder')} maxLength={140} {...form.register('descriptionFr')} />
              {form.formState.errors.descriptionFr ? <FieldError>{form.formState.errors.descriptionFr.message}</FieldError> : null}
            </Field>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="asset-card-characteristics-ar">{t('characteristicsArLabel')}</FieldLabel>
              <Textarea
                id="asset-card-characteristics-ar"
                placeholder={t('characteristicsArPlaceholder')}
                value={characteristicsArDraft}
                onChange={(event) => {
                  setCharacteristicsArDraft(event.target.value);
                }}
                onBlur={syncCharacteristicsToForm}
              />
              {form.formState.errors.characteristicsAr ? <FieldError>{form.formState.errors.characteristicsAr.message}</FieldError> : null}
            </Field>

            <Field>
              <FieldLabel htmlFor="asset-card-characteristics-fr">{t('characteristicsFrLabel')}</FieldLabel>
              <Textarea
                id="asset-card-characteristics-fr"
                placeholder={t('characteristicsFrPlaceholder')}
                value={characteristicsFrDraft}
                onChange={(event) => {
                  setCharacteristicsFrDraft(event.target.value);
                }}
                onBlur={syncCharacteristicsToForm}
              />
              {form.formState.errors.characteristicsFr ? <FieldError>{form.formState.errors.characteristicsFr.message}</FieldError> : null}
            </Field>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={pending}>
              {mode === 'create' ? t('createCard') : t('updateCard')}
            </Button>
          </DialogFooter>
        </form>
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

  const assetsQuery = useQuery({
    queryKey: ['assets-manager'],
    queryFn: () => request<AssetsResponse>('/api/assets'),
    initialData: initialAssets,
    initialDataUpdatedAt: initialAssets ? Date.now() : 0,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

  const metaQuery = useQuery({
    queryKey: ['assets-meta'],
    queryFn: () => request<AssetsMetaResponse>('/api/assets/meta'),
    initialData: initialMeta,
    initialDataUpdatedAt: initialMeta ? Date.now() : 0,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

  const bannerForm = useForm<AssetBannerInput>({
    resolver: zodResolver(assetBannerSchema),
    defaultValues: bannerDefaults,
  });
  const groupForm = useForm<FeaturedProductGroupInput>({
    resolver: zodResolver(featuredProductGroupSchema),
    defaultValues: groupDefaults,
  });
  const cardForm = useForm<ProductCardInput>({
    resolver: zodResolver(productCardSchema),
    defaultValues: cardDefaults,
  });

  const createMutation = useMutation<unknown, Error, { section: AssetSection; kind: string; data: unknown; optimisticItem: AssetBannerRecord | FeaturedProductGroupRecord | ProductCardRecord; messages: MutationMessages }, MutationContext>({
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
          banners: section === 'banners' ? (items) => [...items, optimisticItem as AssetBannerRecord] : undefined,
          featuredGroups: section === 'featuredGroups' ? (items) => [...items, optimisticItem as FeaturedProductGroupRecord] : undefined,
          productCards: section === 'productCards' ? (items) => [...items, optimisticItem as ProductCardRecord] : undefined,
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

  const updateMutation = useMutation<unknown, Error, { section: AssetSection; kind: string; id: number; data: unknown; messages: MutationMessages }, MutationContext>({
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
              ? (items) => items.map((item) => (item.id === id ? { ...item, ...(data as object), updatedAt: new Date().toISOString() } : item))
              : undefined,
          featuredGroups:
            section === 'featuredGroups'
              ? (items) => items.map((item) => (item.id === id ? { ...item, ...(data as object), updatedAt: new Date().toISOString() } : item))
              : undefined,
          productCards:
            section === 'productCards'
              ? (items) => items.map((item) => (item.id === id ? { ...item, ...(data as object), updatedAt: new Date().toISOString() } : item))
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

  const toggleMutation = useMutation<unknown, Error, { section: AssetSection; kind: string; id: number; changes: Partial<Pick<AssetBannerRecord, 'active'> & Pick<FeaturedProductGroupRecord, 'showAtTopOfProductsPage' | 'active'> & Pick<ProductCardRecord, 'active'>>; messages: MutationMessages }, MutationContext>({
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
              ? (items) => items.map((item) => (item.id === id ? { ...item, ...changes, updatedAt: new Date().toISOString() } : item))
              : undefined,
          featuredGroups:
            section === 'featuredGroups'
              ? (items) => items.map((item) => (item.id === id ? { ...item, ...changes, updatedAt: new Date().toISOString() } : item))
              : undefined,
          productCards:
            section === 'productCards'
              ? (items) => items.map((item) => (item.id === id ? { ...item, ...changes, updatedAt: new Date().toISOString() } : item))
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

  const deleteMutation = useMutation<unknown, Error, { section: AssetSection; kind: string; id: number; messages: MutationMessages }, MutationContext>({
    mutationFn: ({ kind, id }) => request(`/api/assets/${kind}/${id}`, { method: 'DELETE' }),
    onMutate: async ({ section, id, messages }) => {
      await queryClient.cancelQueries({ queryKey: ['assets-manager'] });
      const snapshot = queryClient.getQueryData<AssetsResponse>(['assets-manager']);
      const toastId = toast.loading(messages.loading);

      queryClient.setQueryData<AssetsResponse>(['assets-manager'], (current) =>
        updateAssetsSection(current, section, {
          banners: section === 'banners' ? (items) => items.filter((item) => item.id !== id) : undefined,
          featuredGroups: section === 'featuredGroups' ? (items) => items.filter((item) => item.id !== id) : undefined,
          productCards: section === 'productCards' ? (items) => items.filter((item) => item.id !== id) : undefined,
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
          featuredGroups: section === 'featuredGroups' ? () => optimisticItems as FeaturedProductGroupRecord[] : undefined,
          productCards: section === 'productCards' ? () => optimisticItems as ProductCardRecord[] : undefined,
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
    bannerForm.reset(bannerDefaults);
  }

  function closeGroupDialog() {
    setGroupDialogOpen(false);
    setEditingGroup(null);
    groupForm.reset(groupDefaults);
  }

  function closeCardDialog() {
    setCardDialogOpen(false);
    setEditingCard(null);
    cardForm.reset(cardDefaults);
  }

  const assetData = assetsQuery.data ?? { banners: [], featuredGroups: [], productCards: [] };
  const assetMeta = metaQuery.data ?? { products: [], brands: [], categories: [] };
  const bannerProducts = assetMeta.products;

  const productNameById = useMemo(
    () => new Map(assetMeta.products.map((product) => [product.id, product.title])),
    [assetMeta.products],
  );

  const submitBanner = bannerForm.handleSubmit(async (rawValues) => {
    const values = assetBannerSchema.parse(rawValues);
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
        id: -Date.now(),
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
  });

  const submitGroup = groupForm.handleSubmit(async (rawValues) => {
    const values = featuredProductGroupSchema.parse(rawValues);
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
        id: -Date.now(),
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
  });

  const submitCard = cardForm.handleSubmit(async (rawValues) => {
    const values = productCardSchema.parse(rawValues);
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
        id: -Date.now(),
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
  });

  const deletePending = deleteMutation.isPending;
  const isInitialLoading = (!assetsQuery.data || !metaQuery.data) && (assetsQuery.isPending || metaQuery.isPending);
  const hasInitialError = (!assetsQuery.data || !metaQuery.data) && (assetsQuery.isError || metaQuery.isError);

  function handleReorderMove(section: AssetSection, kind: AssetReorderKind, itemId: number, direction: 'up' | 'down') {
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

    const optimisticItems = reorderItems<AssetBannerRecord | FeaturedProductGroupRecord | ProductCardRecord>(
      currentItems,
      itemId,
      currentItems[targetIndex]?.id ?? itemId,
    );
    if (optimisticItems === currentItems) {
      return;
    }

    const messageKey = section === 'banners' ? 'banner' : section === 'featuredGroups' ? 'group' : 'card';
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
          <EmptyDescription>{assetsQuery.error?.message ?? metaQuery.error?.message ?? globalT('labels.loading')}</EmptyDescription>
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
      <section id="banners" className="scroll-mt-24 overflow-hidden rounded-[1.75rem] border border-border/70 bg-background/95 shadow-sm">
        <div className="flex flex-col gap-4 px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold">{t('bannersTitle')}</h2>
            </div>
            <Button
              type="button"
              onClick={() => {
                setEditingBanner(null);
                bannerForm.reset(bannerDefaults);
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
                        disabled={reorderMutation.isPending || banner.sortOrder === assetData.banners.length - 1}
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
                  <TableCell className="font-medium">{banner.title}</TableCell>
                  <TableCell>{banner.productId ? productNameById.get(banner.productId) ?? t('unknownProduct') : t('noLinkedProduct')}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{timestampLabel(banner.updatedAt)}</TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditingBanner(banner);
                          bannerForm.reset(banner);
                          setBannerDialogOpen(true);
                        }}
                      >
                        {globalT('actions.edit')}
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() => setDeleteState({ kind: 'banner', id: banner.id, label: banner.title })}
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

      <section id="featured-groups" className="scroll-mt-24 overflow-hidden rounded-[1.75rem] border border-border/70 bg-background/95 shadow-sm">
        <div className="flex flex-col gap-4 px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold">{t('groupsTitle')}</h2>
            </div>
            <Button
              type="button"
              onClick={() => {
                setEditingGroup(null);
                groupForm.reset(groupDefaults);
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
                        onClick={() => handleReorderMove('featuredGroups', 'featured-group', group.id, 'up')}
                      >
                        <ChevronUp aria-hidden="true" className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        aria-label={t('moveDownLabel', { item: group.name })}
                        className="h-8 w-8 px-0"
                        disabled={reorderMutation.isPending || group.sortOrder === assetData.featuredGroups.length - 1}
                        onClick={() => handleReorderMove('featuredGroups', 'featured-group', group.id, 'down')}
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
                  <TableCell className="font-medium">{group.name}</TableCell>
                  <TableCell>
                    <Switch
                      aria-label={t('groupShowAtTopToggle', { name: group.name })}
                      checked={group.showAtTopOfProductsPage}
                      onCheckedChange={(checked) => {
                        const actionKey = checked ? 'groupShowAtTopEnable' : 'groupShowAtTopDisable';
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
                  <TableCell>{t('groupCounts', { products: group.productIds.length, brands: group.brandIds.length, categories: group.categoryIds.length })}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{timestampLabel(group.updatedAt)}</TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditingGroup(group);
                          groupForm.reset(toGroupFormValues(group));
                          setGroupDialogOpen(true);
                        }}
                      >
                        {globalT('actions.edit')}
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() => setDeleteState({ kind: 'featured-group', id: group.id, label: group.name })}
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

      <section id="product-cards" className="scroll-mt-24 overflow-hidden rounded-[1.75rem] border border-border/70 bg-background/95 shadow-sm">
        <div className="flex flex-col gap-4 px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold">{t('cardsTitle')}</h2>
            </div>
            <Button
              type="button"
              onClick={() => {
                setEditingCard(null);
                cardForm.reset(cardDefaults);
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
                        aria-label={t('moveUpLabel', { item: productNameById.get(card.productId) ?? t('unknownProduct') })}
                        className="h-8 w-8 px-0"
                        disabled={reorderMutation.isPending || card.sortOrder === 0}
                        onClick={() => handleReorderMove('productCards', 'product-card', card.id, 'up')}
                      >
                        <ChevronUp aria-hidden="true" className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        aria-label={t('moveDownLabel', { item: productNameById.get(card.productId) ?? t('unknownProduct') })}
                        className="h-8 w-8 px-0"
                        disabled={reorderMutation.isPending || card.sortOrder === assetData.productCards.length - 1}
                        onClick={() => handleReorderMove('productCards', 'product-card', card.id, 'down')}
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
                        const productName = productNameById.get(card.productId) ?? t('unknownProduct');
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
                  <TableCell className="font-medium">{productNameById.get(card.productId) ?? t('unknownProduct')}</TableCell>
                  <TableCell>{card.titleFr}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{timestampLabel(card.updatedAt)}</TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditingCard(card);
                          cardForm.reset(card);
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

      <BannerDialogForm
        open={bannerDialogOpen}
        mode={editingBanner ? 'edit' : 'create'}
        products={bannerProducts}
        form={bannerForm}
        pending={createMutation.isPending || updateMutation.isPending}
        onOpenChange={(open) => {
          if (!open) {
            closeBannerDialog();
            return;
          }

          setBannerDialogOpen(true);
        }}
        onSubmit={submitBanner}
      />

      <FeaturedGroupDialogForm
        open={groupDialogOpen}
        mode={editingGroup ? 'edit' : 'create'}
        products={assetMeta.products}
        brands={assetMeta.brands}
        categories={assetMeta.categories}
        form={groupForm}
        pending={createMutation.isPending || updateMutation.isPending}
        onOpenChange={(open) => {
          if (!open) {
            closeGroupDialog();
            return;
          }

          setGroupDialogOpen(true);
        }}
        onSubmit={submitGroup}
      />

      <ProductCardDialogForm
        open={cardDialogOpen}
        mode={editingCard ? 'edit' : 'create'}
        products={assetMeta.products}
        form={cardForm}
        pending={createMutation.isPending || updateMutation.isPending}
        onOpenChange={(open) => {
          if (!open) {
            closeCardDialog();
            return;
          }

          setCardDialogOpen(true);
        }}
        onSubmit={submitCard}
      />

      <DeleteDialog
        open={deleteState !== null}
        title={globalT('labels.deleteDialogTitle')}
        description={globalT('labels.deleteDialogDescription', { target: deleteState?.label ?? '' })}
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

          const section = deleteState.kind === 'banner' ? 'banners' : deleteState.kind === 'featured-group' ? 'featuredGroups' : 'productCards';
          const messageKey = deleteState.kind === 'banner' ? 'banner' : deleteState.kind === 'featured-group' ? 'group' : 'card';

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
