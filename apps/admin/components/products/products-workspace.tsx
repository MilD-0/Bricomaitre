'use client';

/* eslint-disable @next/next/no-img-element -- Operational catalog images include legacy external origins. */

import { zodResolver } from '@hookform/resolvers/zod';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  MoreHorizontal,
  PackageOpen,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useDeferredValue, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';

import { requestJson as request } from '../../lib/admin-api';
import {
  buildMetaCatalogExportFileName,
  buildMetaCatalogExportRows,
} from '../../lib/meta-catalog-shared';
import { appendSortParams, getSortRuleState, toggleSortRule } from '../../lib/multi-sort';
import type { PaginationMeta } from '../../lib/pagination';
import { canExportAllProducts } from '../../lib/permissions';
import {
  productListQuerySchema,
  productPayloadSchema,
  type ProductPatch,
  type ProductPayload,
  type ProductPayloadInput,
  type ProductRecord,
  type ProductSortKey,
  type ProductSortRule,
  type ProductStateFilter,
} from '../../lib/products';
import { toast } from '../../lib/toast';
import { cn } from '../../lib/utils';
import { useAppStore } from '../../store/app-store';
import { ImageUploadField } from '../image-upload-field';
import { MultiSortHeader } from '../multi-sort-header';
import { useAdminAiSurfaceDetails } from '../admin-ai-surface-context';
import {
  MetaCatalogExportDialog,
  type MetaCatalogExportPreviewState,
  type ProductExportJobResponse,
} from './product-export-presenters';
import { buildDraftPromoHref, buildStorefrontProductHref } from './storefront-links';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Field, FieldError, FieldLabel } from '../ui/field';
import { Input } from '../ui/input';
import { NativeSelect, NativeSelectOption } from '../ui/native-select';
import { SidePanel } from '../ui/side-panel';
import { Spinner } from '../ui/spinner';
import { Switch } from '../ui/switch';
import { Textarea } from '../ui/textarea';
import {
  WorkspaceActions,
  WorkspaceFrame,
  WorkspaceHeader,
  WorkspaceHeading,
  WorkspaceToolbar,
} from '../ui/workspace';
import { AdminAiAskButton } from '../admin-ai-ask-button';

type ProductsResponse = { items: ProductRecord[]; pagination: PaginationMeta };
type CatalogOption = { id: number; name: string };
type ProductsMetaResponse = { brands: CatalogOption[]; categories: CatalogOption[] };
type ProductDetailResponse = { item: ProductRecord };
type EditorState = { mode: 'create'; product: null } | { mode: 'edit'; product: ProductRecord };
type DeleteTarget = { ids: number[]; label: string };
type PaginationItem = number | `ellipsis-${number}`;

const emptyProduct: ProductPayloadInput = {
  title: '',
  slug: null,
  titleAr: null,
  description: null,
  descriptionAr: null,
  sku: null,
  barcode: null,
  price: 0,
  oldPrice: null,
  purchasePrice: null,
  active: true,
  inStock: true,
  availabilityStatus: 'in_stock',
  inventoryQuantity: 0,
  brandId: null,
  categoryId: null,
  images: [],
  promoCodes: [],
};

function formatMoney(locale: string, value: number | null | undefined) {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'DZD',
    maximumFractionDigits: 0,
  }).format(Number(value ?? 0));
}

function formatPercent(locale: string, value: number | null | undefined) {
  if (value == null) return '—';
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value)}%`;
}

function formatDate(locale: string, value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(date);
}

function getPaginationItems(currentPage: number, totalPages: number): PaginationItem[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);

  const visiblePages =
    currentPage <= 4
      ? [1, 2, 3, 4, 5, totalPages]
      : currentPage >= totalPages - 3
        ? [1, totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages]
        : [1, currentPage - 1, currentPage, currentPage + 1, totalPages];
  const items: PaginationItem[] = [];

  visiblePages.forEach((page, index) => {
    const previousPage = visiblePages[index - 1];
    if (previousPage && page - previousPage > 1) items.push(`ellipsis-${previousPage}`);
    items.push(page);
  });

  return items;
}

function toDateTimeInput(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString().slice(0, 16);
}

function productFormValues(product: ProductRecord): ProductPayloadInput {
  return {
    title: product.title,
    slug: product.slug ?? null,
    titleAr: product.titleAr ?? null,
    description: product.description ?? null,
    descriptionAr: product.descriptionAr ?? null,
    sku: product.sku ?? null,
    barcode: product.barcode ?? null,
    price: Number(product.price),
    oldPrice: product.oldPrice == null ? null : Number(product.oldPrice),
    purchasePrice: product.purchasePrice == null ? null : Number(product.purchasePrice),
    active: product.active,
    inStock: product.inStock,
    availabilityStatus: product.inStock ? 'in_stock' : 'out_of_stock',
    inventoryQuantity: product.inventoryQuantity,
    brandId: product.brandId ?? null,
    categoryId: product.categoryId ?? null,
    images: product.images,
    promoCodes: (product.promoCodes ?? []).map((promo) => ({
      code: promo.code,
      promoPrice: Number(promo.promoPrice),
      active: promo.active,
      startsAt: toDateTimeInput(promo.startsAt),
      endsAt: toDateTimeInput(promo.endsAt),
    })),
  };
}

function ProductThumbnail({ product }: { product: ProductRecord }) {
  const image = product.images[0];
  return image ? (
    <img src={image} alt="" className="size-10 shrink-0 rounded-[0.7rem] object-cover" />
  ) : (
    <span className="grid size-10 shrink-0 place-items-center rounded-[0.7rem] bg-muted text-muted-foreground">
      <PackageOpen className="size-4" aria-hidden="true" />
    </span>
  );
}

function EditorSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-border/60 px-4 py-5 sm:px-6">
      <h3 className="mb-4 text-sm font-semibold">{title}</h3>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

function ProductEditorPanel({
  state,
  meta,
  onClose,
  onChanged,
}: {
  state: EditorState | null;
  meta: ProductsMetaResponse;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const t = useTranslations();
  const form = useForm<ProductPayloadInput>({
    resolver: zodResolver(productPayloadSchema),
    defaultValues: emptyProduct,
  });
  const promoFields = useFieldArray({ control: form.control, name: 'promoCodes' });
  const images = useWatch({ control: form.control, name: 'images' }) ?? [];
  const active = Boolean(useWatch({ control: form.control, name: 'active' }));
  const inStock = Boolean(useWatch({ control: form.control, name: 'inStock' }));
  const draftValues = useWatch({ control: form.control });
  const productId = state?.mode === 'edit' ? state.product.id : null;
  const detailQuery = useQuery({
    queryKey: ['products-workspace-editor', productId],
    enabled: productId !== null,
    queryFn: () => request<ProductDetailResponse>(`/api/products/${productId}`),
    initialData:
      state?.mode === 'edit'
        ? ({ item: state.product } satisfies ProductDetailResponse)
        : undefined,
    initialDataUpdatedAt: 0,
    staleTime: 0,
  });
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!state) return;
    const source = state.mode === 'edit' ? (detailQuery.data?.item ?? state.product) : null;
    form.reset(source ? productFormValues(source) : emptyProduct);
  }, [detailQuery.data?.item, form, state]);

  const saveMutation = useMutation({
    mutationFn: async (values: ProductPayload) => {
      if (state?.mode === 'edit') {
        return request<{ ok: true }>(`/api/products/${state.product.id}`, {
          method: 'PUT',
          body: JSON.stringify(values),
        });
      }
      return request<{ ok: true }>('/api/products', {
        method: 'POST',
        body: JSON.stringify(values),
      });
    },
    onSuccess: async () => {
      toast.success(
        state?.mode === 'edit'
          ? t('notifications.products.save.success', { name: form.getValues('title') })
          : t('notifications.products.create.success', { name: form.getValues('title') }),
      );
      await onChanged();
      onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const deleteMutation = useMutation({
    mutationFn: () => request<{ ok: true }>(`/api/products/${productId}`, { method: 'DELETE' }),
    onSuccess: async () => {
      toast.success(
        t('notifications.products.archive.success', {
          target: state?.mode === 'edit' ? state.product.title : '',
        }),
      );
      await onChanged();
      onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const submit = form.handleSubmit((rawValues) => {
    saveMutation.mutate(productPayloadSchema.parse(rawValues));
  });
  const isEdit = state?.mode === 'edit';
  const title = isEdit ? t('labels.editProductTitle') : t('labels.createProductTitle');

  return (
    <SidePanel
      open={state !== null}
      onOpenChange={(open) => !open && onClose()}
      closeLabel={t('actions.cancel')}
      title={title}
      footer={
        <div className="flex flex-wrap items-center gap-2">
          {isEdit ? (
            confirmDelete ? (
              <div className="me-auto flex items-center gap-2 text-sm text-destructive">
                <span>{t('adminWorkspace.products.archiveConfirm')}</span>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  disabled={deleteMutation.isPending}
                  onClick={() => deleteMutation.mutate()}
                >
                  {deleteMutation.isPending ? <Spinner className="size-3.5" /> : null}
                  {t('adminWorkspace.products.archive')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setConfirmDelete(false)}
                >
                  {t('actions.cancel')}
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="me-auto text-destructive"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="size-4" aria-hidden="true" />
                {t('adminWorkspace.products.archive')}
              </Button>
            )
          ) : (
            <span className="me-auto" />
          )}
          <Button type="button" variant="outline" onClick={onClose}>
            {t('actions.cancel')}
          </Button>
          <Button
            type="button"
            disabled={saveMutation.isPending || (isEdit && detailQuery.isFetching)}
            onClick={() => void submit()}
          >
            {saveMutation.isPending ? <Spinner className="size-4" /> : null}
            {isEdit ? t('actions.saveProduct') : t('actions.createProduct')}
          </Button>
        </div>
      }
    >
      {detailQuery.isFetching && isEdit ? (
        <div className="h-0.5 overflow-hidden bg-muted">
          <div className="h-full w-1/2 animate-pulse bg-primary" />
        </div>
      ) : null}
      {detailQuery.isError ? (
        <p className="border-b border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive sm:px-6">
          {detailQuery.error.message}
        </p>
      ) : null}
      {isEdit && detailQuery.isFetching ? (
        <div className="grid min-h-[28rem] place-items-center px-6 text-sm text-muted-foreground">
          <span className="flex items-center gap-2">
            <Spinner className="size-4" />
            {t('labels.loading')}
          </span>
        </div>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <EditorSection title={t('adminWorkspace.products.identity')}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="selected-product-title">{t('labels.productName')}</FieldLabel>
                <Input id="selected-product-title" {...form.register('title')} />
                {form.formState.errors.title ? (
                  <FieldError>{form.formState.errors.title.message}</FieldError>
                ) : null}
              </Field>
              <Field dir="rtl">
                <FieldLabel htmlFor="selected-product-title-ar">{t('labels.nameAr')}</FieldLabel>
                <Input id="selected-product-title-ar" {...form.register('titleAr')} />
              </Field>
              <Field>
                <FieldLabel htmlFor="selected-product-sku">{t('labels.sku')}</FieldLabel>
                <Input id="selected-product-sku" {...form.register('sku')} />
              </Field>
              <Field>
                <FieldLabel htmlFor="selected-product-barcode">{t('labels.barcode')}</FieldLabel>
                <Input id="selected-product-barcode" {...form.register('barcode')} />
              </Field>
            </div>
          </EditorSection>

          <EditorSection title={t('adminWorkspace.products.commercial')}>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field>
                <FieldLabel htmlFor="selected-product-price">{t('labels.price')}</FieldLabel>
                <Input
                  id="selected-product-price"
                  type="number"
                  min="0"
                  step="0.01"
                  {...form.register('price', { valueAsNumber: true })}
                />
                {form.formState.errors.price ? (
                  <FieldError>{form.formState.errors.price.message}</FieldError>
                ) : null}
              </Field>
              <Field>
                <FieldLabel htmlFor="selected-product-purchase-price">
                  {t('labels.purchasePrice')}
                </FieldLabel>
                <Input
                  id="selected-product-purchase-price"
                  type="number"
                  min="0"
                  step="0.01"
                  {...form.register('purchasePrice', {
                    setValueAs: (value) => (value === '' ? null : Number(value)),
                  })}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="selected-product-old-price">
                  {t('labels.compareAtPrice')}
                </FieldLabel>
                <Input
                  id="selected-product-old-price"
                  type="number"
                  min="0"
                  step="0.01"
                  {...form.register('oldPrice', {
                    setValueAs: (value) => (value === '' ? null : Number(value)),
                  })}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="selected-product-quantity">
                  {t('labels.inventoryQuantity')}
                </FieldLabel>
                <Input
                  id="selected-product-quantity"
                  type="number"
                  min="0"
                  step="1"
                  {...form.register('inventoryQuantity', { valueAsNumber: true })}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="selected-product-brand">{t('nav.brands')}</FieldLabel>
                <NativeSelect
                  id="selected-product-brand"
                  {...form.register('brandId', {
                    setValueAs: (value) => (value === '' ? null : Number(value)),
                  })}
                >
                  <NativeSelectOption value="">{t('labels.noBrand')}</NativeSelectOption>
                  {meta.brands.map((brand) => (
                    <NativeSelectOption key={brand.id} value={brand.id}>
                      {brand.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel htmlFor="selected-product-category">{t('nav.categories')}</FieldLabel>
                <NativeSelect
                  id="selected-product-category"
                  {...form.register('categoryId', {
                    setValueAs: (value) => (value === '' ? null : Number(value)),
                  })}
                >
                  <NativeSelectOption value="">{t('labels.noCategory')}</NativeSelectOption>
                  {meta.categories.map((category) => (
                    <NativeSelectOption key={category.id} value={category.id}>
                      {category.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
            </div>
            <div className="mt-5 grid gap-px overflow-hidden rounded-[1rem] border border-border/60 bg-border/60 sm:grid-cols-2">
              <label className="flex items-center justify-between gap-4 bg-background px-4 py-3">
                <span>
                  <span className="block text-sm font-medium">{t('labels.active')}</span>
                  <span className="block text-xs text-muted-foreground">
                    {active ? t('labels.active') : t('labels.inactive')}
                  </span>
                </span>
                <Switch
                  checked={active}
                  aria-label={t('labels.active')}
                  onCheckedChange={(checked) =>
                    form.setValue('active', checked, { shouldDirty: true })
                  }
                />
              </label>
              <label className="flex items-center justify-between gap-4 bg-background px-4 py-3">
                <span>
                  <span className="block text-sm font-medium">{t('labels.inStock')}</span>
                  <span className="block text-xs text-muted-foreground">
                    {inStock ? t('labels.inStock') : t('actions.markOutOfStock')}
                  </span>
                </span>
                <Switch
                  checked={inStock}
                  aria-label={t('labels.inStock')}
                  onCheckedChange={(checked) => {
                    form.setValue('inStock', checked, { shouldDirty: true });
                    form.setValue('availabilityStatus', checked ? 'in_stock' : 'out_of_stock', {
                      shouldDirty: true,
                    });
                  }}
                />
              </label>
            </div>
          </EditorSection>

          <EditorSection title={t('adminWorkspace.products.content')}>
            <div className="grid gap-4">
              <Field>
                <FieldLabel htmlFor="selected-product-description">
                  {t('labels.description')}
                </FieldLabel>
                <Textarea
                  id="selected-product-description"
                  className="min-h-32"
                  {...form.register('description')}
                />
              </Field>
              <Field dir="rtl">
                <FieldLabel htmlFor="selected-product-description-ar">
                  {t('labels.descriptionAr')}
                </FieldLabel>
                <Textarea
                  id="selected-product-description-ar"
                  className="min-h-32"
                  {...form.register('descriptionAr')}
                />
              </Field>
            </div>
          </EditorSection>

          <EditorSection title={t('products.promos.title')}>
            <div className="space-y-3">
              {promoFields.fields.map((field, index) => {
                const code = draftValues.promoCodes?.[index]?.code?.trim() ?? '';
                return (
                  <div
                    key={field.id}
                    className="rounded-[1rem] border border-border/60 bg-muted/15 p-3"
                  >
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field>
                        <FieldLabel htmlFor={`selected-promo-code-${field.id}`}>
                          {t('products.promos.code')}
                        </FieldLabel>
                        <Input
                          id={`selected-promo-code-${field.id}`}
                          {...form.register(`promoCodes.${index}.code`)}
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor={`selected-promo-price-${field.id}`}>
                          {t('products.promos.price')}
                        </FieldLabel>
                        <Input
                          id={`selected-promo-price-${field.id}`}
                          type="number"
                          min="0"
                          step="0.01"
                          {...form.register(`promoCodes.${index}.promoPrice`, {
                            valueAsNumber: true,
                          })}
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor={`selected-promo-start-${field.id}`}>
                          {t('products.promos.startsAt')}
                        </FieldLabel>
                        <Input
                          id={`selected-promo-start-${field.id}`}
                          type="datetime-local"
                          {...form.register(`promoCodes.${index}.startsAt`)}
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor={`selected-promo-end-${field.id}`}>
                          {t('products.promos.endsAt')}
                        </FieldLabel>
                        <Input
                          id={`selected-promo-end-${field.id}`}
                          type="datetime-local"
                          {...form.register(`promoCodes.${index}.endsAt`)}
                        />
                      </Field>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/50 pt-3">
                      <Switch
                        checked={Boolean(draftValues.promoCodes?.[index]?.active ?? true)}
                        aria-label={t('products.promos.active')}
                        onCheckedChange={(checked) =>
                          form.setValue(`promoCodes.${index}.active`, checked, {
                            shouldDirty: true,
                          })
                        }
                      />
                      <span className="text-sm">{t('products.promos.active')}</span>
                      {code ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="ms-auto"
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(
                                buildDraftPromoHref(draftValues, code),
                              );
                              toast.success(t('products.promos.copySuccess'));
                            } catch {
                              toast.error(t('products.promos.copyError'));
                            }
                          }}
                        >
                          <Copy className="size-3.5" aria-hidden="true" />
                          {t('products.promos.copy')}
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className={cn(!code && 'ms-auto')}
                        onClick={() => promoFields.remove(index)}
                      >
                        {t('products.promos.remove')}
                      </Button>
                    </div>
                  </div>
                );
              })}
              {promoFields.fields.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('products.promos.empty')}</p>
              ) : null}
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  promoFields.append({
                    code: '',
                    promoPrice: 0,
                    active: true,
                    startsAt: null,
                    endsAt: null,
                  })
                }
              >
                <Plus className="size-4" aria-hidden="true" />
                {t('products.promos.add')}
              </Button>
            </div>
          </EditorSection>

          <EditorSection title={t('labels.images')}>
            <ImageUploadField
              uploadUrl="/api/uploads/products"
              label={t('labels.images')}
              multiple
              value={images}
              onChange={(urls) =>
                form.setValue('images', urls, { shouldDirty: true, shouldValidate: true })
              }
            />
          </EditorSection>
          <button type="submit" className="sr-only">
            {t('actions.save')}
          </button>
        </form>
      )}
    </SidePanel>
  );
}

function CompactActionsMenu({
  label,
  children,
  side = 'bottom',
}: {
  label: string;
  children: React.ReactNode;
  side?: 'top' | 'bottom';
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;

    const closeFromOutside = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeFromKeyboard = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      triggerRef.current?.focus();
    };

    document.addEventListener('pointerdown', closeFromOutside);
    document.addEventListener('keydown', closeFromKeyboard);
    return () => {
      document.removeEventListener('pointerdown', closeFromOutside);
      document.removeEventListener('keydown', closeFromKeyboard);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        className="grid size-9 place-items-center rounded-md border border-border/70 bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
        onClick={() => setOpen((current) => !current)}
      >
        <MoreHorizontal className="size-4" aria-hidden="true" />
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          className={cn(
            'absolute end-0 z-30 min-w-52 overflow-hidden rounded-md border border-border/70 bg-popover py-1 text-popover-foreground shadow-lg',
            side === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5',
          )}
          onClick={(event) => {
            if ((event.target as HTMLElement).closest('[role="menuitem"]')) setOpen(false);
          }}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

function ActionMenuButton({
  children,
  destructive = false,
  disabled = false,
  onClick,
}: {
  children: React.ReactNode;
  destructive?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      className={cn(
        'block w-full px-3 py-2 text-start text-sm transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none disabled:pointer-events-none disabled:opacity-45',
        destructive && 'text-destructive',
      )}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function DeleteProductsDialog({
  target,
  open,
  pending,
  onConfirm,
  onOpenChange,
}: {
  target: string;
  open: boolean;
  pending: boolean;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('adminWorkspace.products.archiveDialogTitle')}</DialogTitle>
          <DialogDescription>
            {t('adminWorkspace.products.archiveDialogDescription', { target })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('actions.cancel')}
          </Button>
          <Button type="button" variant="destructive" disabled={pending} onClick={onConfirm}>
            {pending ? <Spinner className="size-4" /> : null}
            {t('actions.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CompactExportStatus({
  job,
  pendingCancel,
  onCancel,
  onDownload,
}: {
  job: NonNullable<ProductExportJobResponse['job']>;
  pendingCancel: boolean;
  onCancel: () => void;
  onDownload: () => void;
}) {
  const t = useTranslations();

  return (
    <div className="flex flex-col gap-2 border-b border-border/60 bg-muted/15 px-3 py-2.5 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="truncate font-medium">
            {t(`products.exportAll.status.${job.status}`)} ·{' '}
            {t(`products.exportAll.progress.${job.progress.phase}`)}
          </span>
          <span className="shrink-0 tabular-nums">{job.progress.percentage}%</span>
        </div>
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width]"
            style={{ width: `${job.progress.percentage}%` }}
          />
        </div>
        {job.errorMessage ? (
          <p className="mt-1.5 text-xs text-destructive">{job.errorMessage}</p>
        ) : null}
      </div>
      {job.status === 'running' ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pendingCancel}
          onClick={onCancel}
        >
          {t(pendingCancel ? 'products.exportAll.cancelPending' : 'products.exportAll.cancel')}
        </Button>
      ) : null}
      {job.status === 'completed' && job.downloadPath ? (
        <Button type="button" size="sm" variant="outline" onClick={onDownload}>
          {t('products.exportAll.download')}
        </Button>
      ) : null}
    </div>
  );
}

export function ProductsWorkspace({
  initialData,
  initialMeta,
}: {
  initialData?: ProductsResponse;
  initialMeta?: ProductsMetaResponse;
}) {
  const t = useTranslations();
  const locale = useLocale();
  const queryClient = useQueryClient();
  const role = useAppStore((state) => state.role);
  const canExportEntireCatalog = canExportAllProducts(role);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search.trim());
  const [filter, setFilter] = useState<ProductStateFilter>('all');
  const [selectedBrandId, setSelectedBrandId] = useState<number | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [sortRules, setSortRules] = useState<ProductSortRule[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [editorState, setEditorState] = useState<EditorState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [metaCatalogExportState, setMetaCatalogExportState] =
    useState<MetaCatalogExportPreviewState>(null);
  useAdminAiSurfaceDetails({
    filters: {
      page,
      search: deferredSearch,
      state: filter,
      brandId: selectedBrandId,
      categoryId: selectedCategoryId,
      sort: sortRules.map((rule) => `${rule.key}:${rule.direction}`).join(','),
    },
    selection: {
      entityType: 'product',
      ids: selectedIds,
      focusedId: editorState?.mode === 'edit' ? editorState.product.id : null,
    },
  });
  const productsQuery = useQuery({
    queryKey: [
      'products-workspace',
      page,
      deferredSearch,
      filter,
      selectedBrandId,
      selectedCategoryId,
      sortRules,
    ],
    queryFn: () => {
      const params = productListQuerySchema.parse({
        page,
        limit: 50,
        search: deferredSearch,
        state: filter,
        brandId: selectedBrandId,
        categoryId: selectedCategoryId,
        sort: sortRules.map((rule) => `${rule.key}:${rule.direction}`),
      });
      const searchParams = new URLSearchParams({
        page: String(params.page),
        limit: String(params.limit),
        search: params.search,
        state: params.state,
      });
      if (params.brandId !== null) searchParams.set('brandId', String(params.brandId));
      if (params.categoryId !== null) {
        searchParams.set('categoryId', String(params.categoryId));
      }
      appendSortParams(searchParams, params.sortRules);
      return request<ProductsResponse>(`/api/products?${searchParams.toString()}`);
    },
    initialData:
      page === 1 &&
      deferredSearch === '' &&
      filter === 'all' &&
      selectedBrandId === null &&
      selectedCategoryId === null &&
      sortRules.length === 0
        ? initialData
        : undefined,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
  const metaQuery = useQuery({
    queryKey: ['products-meta-workspace'],
    queryFn: () => request<ProductsMetaResponse>('/api/products/meta'),
    initialData: initialMeta,
    staleTime: 300_000,
  });
  const products = useMemo(() => productsQuery.data?.items ?? [], [productsQuery.data?.items]);
  const visibleProducts = products;
  const pagination = productsQuery.data?.pagination;
  const activeFilterCount =
    Number(filter !== 'all') +
    Number(selectedBrandId !== null) +
    Number(selectedCategoryId !== null);

  const toggleSort = (key: ProductSortKey) => {
    setPage(1);
    setSortRules((current) => toggleSortRule(current, key, 'asc'));
  };

  const patchMutation = useMutation({
    mutationFn: ({ id, values }: { id: number; values: ProductPatch }) =>
      request<{ ok: true }>(`/api/products/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(values),
      }),
    onSuccess: async () => {
      toast.success(t('adminWorkspace.products.quickChangeSaved'));
      await queryClient.invalidateQueries({ queryKey: ['products-workspace'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const patchSelectedMutation = useMutation({
    mutationFn: async (values: ProductPatch) => {
      await Promise.all(
        selectedIds.map((id) =>
          request(`/api/products/${id}`, { method: 'PATCH', body: JSON.stringify(values) }),
        ),
      );
    },
    onSuccess: async () => {
      toast.success(t('adminWorkspace.products.bulkChangeSaved', { count: selectedIds.length }));
      setSelectedIds([]);
      await queryClient.invalidateQueries({ queryKey: ['products-workspace'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const deleteProductsMutation = useMutation({
    mutationFn: async ({ ids }: DeleteTarget) => {
      await Promise.all(ids.map((id) => request(`/api/products/${id}`, { method: 'DELETE' })));
    },
    onSuccess: async (_data, target) => {
      toast.success(
        t('notifications.products.archive.success', {
          target: target.label,
        }),
      );
      setDeleteTarget(null);
      setSelectedIds((current) => current.filter((id) => !target.ids.includes(id)));
      await queryClient.invalidateQueries({ queryKey: ['products-workspace'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const exportJobQuery = useQuery({
    queryKey: ['products-export-all-job'],
    queryFn: () => request<ProductExportJobResponse>('/api/products/export-all'),
    enabled: canExportEntireCatalog,
    initialData: { job: null },
    staleTime: 0,
    refetchInterval: (query) => (query.state.data?.job?.status === 'running' ? 1_000 : false),
  });
  const startExportAllMutation = useMutation({
    mutationFn: () =>
      request<ProductExportJobResponse>('/api/products/export-all', { method: 'POST' }),
    onSuccess: async () => {
      toast.success(t('products.exportAll.notifications.start.success'));
      await queryClient.invalidateQueries({ queryKey: ['products-export-all-job'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const cancelExportAllMutation = useMutation({
    mutationFn: () =>
      request<ProductExportJobResponse>('/api/products/export-all', { method: 'DELETE' }),
    onSuccess: async () => {
      toast.success(t('products.exportAll.notifications.cancel.success'));
      await queryClient.invalidateQueries({ queryKey: ['products-export-all-job'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const selectedProducts = useMemo(() => {
    const selectedIdSet = new Set(selectedIds);
    const byId = new Map<number, ProductRecord>();

    queryClient
      .getQueriesData<ProductsResponse>({ queryKey: ['products-workspace'] })
      .forEach(([, data]) => {
        data?.items.forEach((product) => {
          if (selectedIdSet.has(product.id)) byId.set(product.id, product);
        });
      });

    return selectedIds
      .map((id) => byId.get(id))
      .filter((product): product is ProductRecord => product !== undefined);
  }, [queryClient, selectedIds]);
  const brandNameById = useMemo(
    () => new Map((metaQuery.data?.brands ?? []).map((brand) => [brand.id, brand.name])),
    [metaQuery.data?.brands],
  );

  async function copySelectedProductIds() {
    try {
      await navigator.clipboard.writeText(selectedIds.join(','));
      toast.success(t('products.copy.success', { count: selectedIds.length }));
    } catch {
      toast.error(t('products.copy.error', { count: selectedIds.length }));
    }
  }

  function openMetaCatalogExportPreview() {
    if (selectedProducts.length === 0) return;
    setMetaCatalogExportState({
      title: t('products.export.title', { count: selectedProducts.length }),
      fileName: buildMetaCatalogExportFileName(),
      rows: buildMetaCatalogExportRows(
        selectedProducts,
        brandNameById,
        new Map(selectedProducts.map((product) => [product.id, product.images[0] ?? ''])),
      ),
    });
  }

  function confirmMetaCatalogExport() {
    if (!metaCatalogExportState || selectedIds.length === 0) return;
    const searchParams = new URLSearchParams();
    selectedIds.forEach((id) => searchParams.append('ids', String(id)));
    window.open(`/api/products/meta-export?${searchParams.toString()}`, '_self');
    setMetaCatalogExportState(null);
  }

  return (
    <>
      <WorkspaceFrame data-admin-workspace="products">
        <WorkspaceHeader>
          <WorkspaceHeading
            title={t('nav.products')}
            meta={
              pagination ? (
                t('adminWorkspace.products.resultCount', { count: pagination.totalItems })
              ) : (
                <span
                  className="inline-block h-4 w-20 animate-pulse rounded bg-muted"
                  aria-label={t('labels.loading')}
                />
              )
            }
          />
          <WorkspaceActions>
            <AdminAiAskButton />
            {canExportEntireCatalog ? (
              <CompactActionsMenu label={t('labels.actions')}>
                <ActionMenuButton
                  disabled={
                    startExportAllMutation.isPending ||
                    exportJobQuery.data.job?.status === 'running'
                  }
                  onClick={() => startExportAllMutation.mutate()}
                >
                  {t(
                    exportJobQuery.data.job?.status === 'running'
                      ? 'products.exportAll.runningAction'
                      : 'products.exportAll.action',
                  )}
                </ActionMenuButton>
              </CompactActionsMenu>
            ) : null}
            <Button type="button" onClick={() => setEditorState({ mode: 'create', product: null })}>
              <Plus className="size-4" aria-hidden="true" />
              {t('actions.createProduct')}
            </Button>
          </WorkspaceActions>
        </WorkspaceHeader>
        <WorkspaceToolbar>
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative w-full min-w-0 flex-1 sm:w-auto sm:min-w-[16rem]">
              <span className="sr-only">{t('adminWorkspace.common.search')}</span>
              <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                className="ps-9"
                placeholder={t('adminWorkspace.products.searchPlaceholder')}
              />
            </label>
            <Button
              type="button"
              size="sm"
              variant={mobileFiltersOpen || activeFilterCount > 0 ? 'default' : 'outline'}
              className="sm:hidden"
              aria-expanded={mobileFiltersOpen}
              onClick={() => setMobileFiltersOpen((open) => !open)}
            >
              <SlidersHorizontal className="size-4" aria-hidden="true" />
              {t('adminWorkspace.common.filters')}
              {activeFilterCount > 0 ? ` · ${activeFilterCount}` : ''}
            </Button>
          </div>
          <div
            className={cn(
              'mt-2 gap-2 sm:grid sm:grid-cols-3 lg:max-w-3xl',
              mobileFiltersOpen ? 'grid' : 'hidden',
            )}
          >
            <NativeSelect
              value={filter}
              onChange={(event) => {
                setFilter(event.target.value as ProductStateFilter);
                setPage(1);
              }}
              aria-label={t('adminWorkspace.common.filters')}
            >
              <NativeSelectOption value="all">
                {t('adminWorkspace.products.allStates')}
              </NativeSelectOption>
              <NativeSelectOption value="active">
                {t('adminWorkspace.products.active')}
              </NativeSelectOption>
              <NativeSelectOption value="inactive">
                {t('adminWorkspace.products.inactive')}
              </NativeSelectOption>
              <NativeSelectOption value="out">
                {t('adminWorkspace.products.outOfStock')}
              </NativeSelectOption>
            </NativeSelect>
            <NativeSelect
              value={selectedBrandId ?? ''}
              aria-label={t('labels.filterByBrand')}
              onChange={(event) => {
                setSelectedBrandId(event.target.value === '' ? null : Number(event.target.value));
                setPage(1);
              }}
            >
              <NativeSelectOption value="">{t('labels.allBrands')}</NativeSelectOption>
              {(metaQuery.data?.brands ?? []).map((brand) => (
                <NativeSelectOption key={brand.id} value={brand.id}>
                  {brand.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <NativeSelect
              value={selectedCategoryId ?? ''}
              aria-label={t('labels.filterByCategory')}
              onChange={(event) => {
                setSelectedCategoryId(
                  event.target.value === '' ? null : Number(event.target.value),
                );
                setPage(1);
              }}
            >
              <NativeSelectOption value="">{t('labels.allCategories')}</NativeSelectOption>
              {(metaQuery.data?.categories ?? []).map((category) => (
                <NativeSelectOption key={category.id} value={category.id}>
                  {category.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
        </WorkspaceToolbar>

        {selectedIds.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 border-b border-primary/20 bg-primary/[0.045] px-3 py-2">
            <span className="me-auto text-sm font-semibold">
              {t('adminWorkspace.common.selected', { count: selectedIds.length })}
            </span>
            <CompactActionsMenu label={t('labels.actions')}>
              <ActionMenuButton
                disabled={patchSelectedMutation.isPending}
                onClick={() => patchSelectedMutation.mutate({ active: true })}
              >
                {t('actions.activateSelected')}
              </ActionMenuButton>
              <ActionMenuButton
                disabled={patchSelectedMutation.isPending}
                onClick={() => patchSelectedMutation.mutate({ active: false })}
              >
                {t('actions.deactivateSelected')}
              </ActionMenuButton>
              <ActionMenuButton
                disabled={patchSelectedMutation.isPending}
                onClick={() => patchSelectedMutation.mutate({ inStock: true })}
              >
                {t('actions.markInStock')}
              </ActionMenuButton>
              <ActionMenuButton
                disabled={patchSelectedMutation.isPending}
                onClick={() => patchSelectedMutation.mutate({ inStock: false })}
              >
                {t('actions.markOutOfStock')}
              </ActionMenuButton>
              <div className="my-1 border-t border-border/60" />
              <ActionMenuButton onClick={() => void copySelectedProductIds()}>
                {t('products.copy.action')}
              </ActionMenuButton>
              <ActionMenuButton
                disabled={selectedProducts.length === 0}
                onClick={openMetaCatalogExportPreview}
              >
                {t('products.export.action')}
              </ActionMenuButton>
              <div className="my-1 border-t border-border/60" />
              <ActionMenuButton
                destructive
                onClick={() =>
                  setDeleteTarget({
                    ids: [...selectedIds],
                    label: t('labels.bulkSelectionCount', { count: selectedIds.length }),
                  })
                }
              >
                {t('adminWorkspace.products.archiveSelected')}
              </ActionMenuButton>
            </CompactActionsMenu>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="size-9 px-0"
              aria-label={t('actions.cancel')}
              onClick={() => setSelectedIds([])}
            >
              <X className="size-4" aria-hidden="true" />
            </Button>
          </div>
        ) : null}

        {canExportEntireCatalog && exportJobQuery.data.job ? (
          <CompactExportStatus
            job={exportJobQuery.data.job}
            pendingCancel={cancelExportAllMutation.isPending}
            onCancel={() => cancelExportAllMutation.mutate()}
            onDownload={() => {
              const path = exportJobQuery.data.job?.downloadPath;
              if (path) window.open(path, '_self');
            }}
          />
        ) : null}

        {productsQuery.isError ? (
          <p className="border-b border-destructive/30 bg-destructive/5 px-3 py-3 text-sm text-destructive">
            {productsQuery.error.message}
          </p>
        ) : null}

        <div className="divide-y divide-border/55 md:hidden">
          {visibleProducts.map((product) => (
            <div
              key={product.id}
              className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-3 py-3.5"
            >
              <Checkbox
                aria-label={t('labels.selectRow', { name: product.title })}
                checked={selectedIds.includes(product.id)}
                onChange={(event) =>
                  setSelectedIds((current) =>
                    event.target.checked
                      ? [...new Set([...current, product.id])]
                      : current.filter((id) => id !== product.id),
                  )
                }
              />
              <div className="flex min-w-0 items-center gap-3 text-start">
                <ProductThumbnail product={product} />
                <span className="min-w-0">
                  <a
                    href={buildStorefrontProductHref(product)}
                    target="_blank"
                    rel="noreferrer"
                    className="block truncate text-sm font-semibold underline-offset-4 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                  >
                    {product.title}
                  </a>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    {product.sku || t('adminWorkspace.products.noSku')} ·{' '}
                    {formatMoney(locale, product.price)}
                  </span>
                  <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    <span className={product.active ? 'text-emerald-700' : 'text-muted-foreground'}>
                      {product.active ? t('labels.active') : t('labels.inactive')}
                    </span>
                    <span className={product.inStock ? 'text-foreground' : 'text-amber-700'}>
                      {product.inStock
                        ? t('labels.inStock')
                        : t('adminWorkspace.products.outOfStock')}
                    </span>
                  </span>
                </span>
              </div>
              <CompactActionsMenu label={`${t('labels.actions')} · ${product.title}`}>
                <ActionMenuButton onClick={() => setEditorState({ mode: 'edit', product })}>
                  {t('actions.edit')}
                </ActionMenuButton>
                <ActionMenuButton
                  destructive
                  onClick={() => setDeleteTarget({ ids: [product.id], label: product.title })}
                >
                  {t('adminWorkspace.products.archive')}
                </ActionMenuButton>
              </CompactActionsMenu>
            </div>
          ))}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[1160px] border-collapse text-sm">
            <thead className="bg-muted/30 text-xs uppercase tracking-[0.08em] text-muted-foreground">
              <tr className="border-b border-border/60">
                <th className="w-12 px-3 py-3 text-start">
                  <Checkbox
                    aria-label={t('labels.selectAll')}
                    checked={
                      visibleProducts.length > 0 &&
                      visibleProducts.every((product) => selectedIds.includes(product.id))
                    }
                    onChange={(event) =>
                      setSelectedIds(
                        event.target.checked ? visibleProducts.map((item) => item.id) : [],
                      )
                    }
                  />
                </th>
                <th className="px-3 py-3 text-start font-medium">
                  <MultiSortHeader
                    label={t('adminWorkspace.products.product')}
                    sortState={getSortRuleState(sortRules, 'title')}
                    onClick={() => toggleSort('title')}
                  />
                </th>
                <th className="px-3 py-3 text-start font-medium">
                  <MultiSortHeader
                    label={t('labels.price')}
                    sortState={getSortRuleState(sortRules, 'price')}
                    onClick={() => toggleSort('price')}
                  />
                </th>
                <th className="px-3 py-3 text-start font-medium">
                  <MultiSortHeader
                    label={t('labels.purchasePrice')}
                    sortState={getSortRuleState(sortRules, 'purchasePrice')}
                    onClick={() => toggleSort('purchasePrice')}
                  />
                </th>
                <th className="px-3 py-3 text-start font-medium">{t('labels.purchases')}</th>
                <th className="px-3 py-3 text-start font-medium">{t('labels.confirmationRate')}</th>
                <th className="px-3 py-3 text-start font-medium">
                  <MultiSortHeader
                    label={t('labels.active')}
                    sortState={getSortRuleState(sortRules, 'active')}
                    onClick={() => toggleSort('active')}
                  />
                </th>
                <th className="px-3 py-3 text-start font-medium">
                  <MultiSortHeader
                    label={t('labels.inStock')}
                    sortState={getSortRuleState(sortRules, 'inStock')}
                    onClick={() => toggleSort('inStock')}
                  />
                </th>
                <th className="px-3 py-3 text-start font-medium">
                  <MultiSortHeader
                    label={t('labels.modified')}
                    sortState={getSortRuleState(sortRules, 'updatedAt')}
                    onClick={() => toggleSort('updatedAt')}
                  />
                </th>
                <th className="w-12 px-3 py-3" />
              </tr>
            </thead>
            <tbody>
              {visibleProducts.map((product, index) => (
                <tr
                  key={product.id}
                  className={cn(
                    'border-b border-border/50 transition-colors hover:bg-primary/[0.035]',
                    index % 2 === 1 && 'bg-muted/[0.14]',
                  )}
                >
                  <td className="px-3 py-3">
                    <Checkbox
                      aria-label={t('labels.selectRow', { name: product.title })}
                      checked={selectedIds.includes(product.id)}
                      onChange={(event) =>
                        setSelectedIds((current) =>
                          event.target.checked
                            ? [...new Set([...current, product.id])]
                            : current.filter((id) => id !== product.id),
                        )
                      }
                    />
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex max-w-[26rem] items-center gap-3 text-start">
                      <ProductThumbnail product={product} />
                      <span className="min-w-0">
                        <a
                          href={buildStorefrontProductHref(product)}
                          target="_blank"
                          rel="noreferrer"
                          className="block truncate font-medium underline-offset-4 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                        >
                          {product.title}
                        </a>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {product.sku || t('adminWorkspace.products.noSku')}
                        </span>
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-3 font-medium tabular-nums">
                    {formatMoney(locale, product.price)}
                  </td>
                  <td className="px-3 py-3 text-muted-foreground tabular-nums">
                    {formatMoney(locale, product.purchasePrice)}
                  </td>
                  <td className="px-3 py-3 tabular-nums">{product.orderPurchaseCount}</td>
                  <td className="px-3 py-3 tabular-nums">
                    {formatPercent(locale, product.confirmationRate)}
                  </td>
                  <td className="px-3 py-3">
                    <Switch
                      checked={product.active}
                      aria-label={`${t('labels.active')} · ${product.title}`}
                      disabled={patchMutation.isPending}
                      onCheckedChange={(active) =>
                        patchMutation.mutate({ id: product.id, values: { active } })
                      }
                    />
                  </td>
                  <td className="px-3 py-3">
                    <Switch
                      checked={product.inStock}
                      aria-label={`${t('labels.inStock')} · ${product.title}`}
                      disabled={patchMutation.isPending}
                      onCheckedChange={(inStock) =>
                        patchMutation.mutate({ id: product.id, values: { inStock } })
                      }
                    />
                  </td>
                  <td className="px-3 py-3 text-xs text-muted-foreground">
                    {formatDate(locale, product.updatedAt)}
                  </td>
                  <td className="px-3 py-3">
                    <CompactActionsMenu
                      label={`${t('labels.actions')} · ${product.title}`}
                      side={index >= visibleProducts.length - 2 ? 'top' : 'bottom'}
                    >
                      <ActionMenuButton onClick={() => setEditorState({ mode: 'edit', product })}>
                        {t('actions.edit')}
                      </ActionMenuButton>
                      <ActionMenuButton
                        destructive
                        onClick={() => setDeleteTarget({ ids: [product.id], label: product.title })}
                      >
                        {t('adminWorkspace.products.archive')}
                      </ActionMenuButton>
                    </CompactActionsMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {productsQuery.isFetching ? (
          <div className="flex items-center justify-center gap-2 border-t border-border/50 px-4 py-4 text-sm text-muted-foreground">
            <Spinner className="size-4" />
            {t('labels.loading')}
          </div>
        ) : visibleProducts.length === 0 ? (
          <div className="grid min-h-56 place-items-center border-t border-border/50 text-sm text-muted-foreground">
            {t('adminWorkspace.common.noResults')}
          </div>
        ) : null}

        {pagination && pagination.totalPages > 1 ? (
          <div className="flex flex-col gap-3 border-t border-border/60 bg-card/35 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              {t('labels.pageOfTotal', { page: pagination.page, total: pagination.totalPages })}
            </p>
            <nav
              aria-label={t('labels.goToPageInput')}
              className="flex items-center justify-center gap-1"
            >
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="size-9 px-0"
                aria-label={t('actions.previous')}
                disabled={!pagination.hasPreviousPage}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                <ChevronLeft className="size-4 rtl:hidden" aria-hidden="true" />
                <ChevronRight className="hidden size-4 rtl:block" aria-hidden="true" />
              </Button>
              {getPaginationItems(pagination.page, pagination.totalPages).map((item) =>
                typeof item === 'number' ? (
                  <Button
                    key={item}
                    type="button"
                    size="sm"
                    variant={item === pagination.page ? 'default' : 'ghost'}
                    className={cn(
                      'size-9 px-0 tabular-nums',
                      item !== 1 &&
                        item !== pagination.totalPages &&
                        Math.abs(item - pagination.page) > 1 &&
                        'hidden sm:inline-flex',
                    )}
                    aria-label={t('labels.goToPage', { page: item })}
                    aria-current={item === pagination.page ? 'page' : undefined}
                    onClick={() => setPage(item)}
                  >
                    {item}
                  </Button>
                ) : (
                  <span
                    key={item}
                    aria-hidden="true"
                    className="hidden size-7 place-items-center text-sm text-muted-foreground sm:grid"
                  >
                    …
                  </span>
                ),
              )}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="size-9 px-0"
                aria-label={t('actions.next')}
                disabled={!pagination.hasNextPage}
                onClick={() => setPage((current) => Math.min(pagination.totalPages, current + 1))}
              >
                <ChevronRight className="size-4 rtl:hidden" aria-hidden="true" />
                <ChevronLeft className="hidden size-4 rtl:block" aria-hidden="true" />
              </Button>
            </nav>
          </div>
        ) : null}
      </WorkspaceFrame>

      <ProductEditorPanel
        state={editorState}
        meta={metaQuery.data ?? { brands: [], categories: [] }}
        onClose={() => setEditorState(null)}
        onChanged={async () => {
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: ['products-workspace'] }),
            queryClient.invalidateQueries({ queryKey: ['products-workspace-editor'] }),
          ]);
        }}
      />
      <DeleteProductsDialog
        target={deleteTarget?.label ?? ''}
        open={deleteTarget !== null}
        pending={deleteProductsMutation.isPending}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteProductsMutation.mutate(deleteTarget)}
      />
      <MetaCatalogExportDialog
        state={metaCatalogExportState}
        onOpenChange={(open) => {
          if (!open) setMetaCatalogExportState(null);
        }}
        onConfirm={confirmMetaCatalogExport}
      />
    </>
  );
}
