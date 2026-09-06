'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Copy, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';

import { requestJson as request } from '../../lib/admin-api';
import {
  productPayloadSchema,
  type ProductPayload,
  type ProductPayloadInput,
  type ProductRecord,
} from '../../lib/products';
import { toast } from '../../lib/toast';
import { cn } from '../../lib/utils';
import { ImageUploadField } from '../image-upload-field';
import { Button } from '../ui/button';
import { Field, FieldError, FieldLabel } from '../ui/field';
import { FormSection } from '../ui/form-section';
import { Input } from '../ui/input';
import { NativeSelect, NativeSelectOption } from '../ui/native-select';
import { SidePanel } from '../ui/side-panel';
import { Spinner } from '../ui/spinner';
import { Switch } from '../ui/switch';
import { Textarea } from '../ui/textarea';
import { useStorefrontBaseUrl } from '../storefront-origin';
import { buildDraftPromoHref } from './storefront-links';

export type ProductEditorState =
  { mode: 'create'; product: null } | { mode: 'edit'; product: ProductRecord };

type CatalogOption = { id: number; name: string };
export type ProductsCatalogOptions = { brands: CatalogOption[]; categories: CatalogOption[] };
type ProductDetailResponse = { item: ProductRecord };

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

function optionalNumericInput(value: unknown) {
  return value == null || value === '' ? null : Number(value);
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

export function ProductEditorPanel({
  state,
  meta,
  onClose,
  onChanged,
}: {
  state: ProductEditorState | null;
  meta: ProductsCatalogOptions;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const t = useTranslations();
  const storefrontBaseUrl = useStorefrontBaseUrl();
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
  const [uploading, setUploading] = useState(false);

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
    if (!uploading) saveMutation.mutate(productPayloadSchema.parse(rawValues));
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
            disabled={uploading || saveMutation.isPending || (isEdit && detailQuery.isFetching)}
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
          <FormSection title={t('adminWorkspace.products.identity')}>
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
          </FormSection>

          <FormSection title={t('adminWorkspace.products.commercial')}>
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
                    setValueAs: optionalNumericInput,
                  })}
                />
                {form.formState.errors.purchasePrice ? (
                  <FieldError role="alert">
                    {form.formState.errors.purchasePrice.message}
                  </FieldError>
                ) : null}
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
                    setValueAs: optionalNumericInput,
                  })}
                />
                {form.formState.errors.oldPrice ? (
                  <FieldError role="alert">{form.formState.errors.oldPrice.message}</FieldError>
                ) : null}
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
                {form.formState.errors.inventoryQuantity ? (
                  <FieldError role="alert">
                    {form.formState.errors.inventoryQuantity.message}
                  </FieldError>
                ) : null}
              </Field>
              <Field>
                <FieldLabel htmlFor="selected-product-brand">{t('nav.brands')}</FieldLabel>
                <NativeSelect
                  id="selected-product-brand"
                  {...form.register('brandId', {
                    setValueAs: optionalNumericInput,
                  })}
                >
                  <NativeSelectOption value="">{t('labels.noBrand')}</NativeSelectOption>
                  {meta.brands.map((brand) => (
                    <NativeSelectOption key={brand.id} value={brand.id}>
                      {brand.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
                {form.formState.errors.brandId ? (
                  <FieldError role="alert">{form.formState.errors.brandId.message}</FieldError>
                ) : null}
              </Field>
              <Field>
                <FieldLabel htmlFor="selected-product-category">{t('nav.categories')}</FieldLabel>
                <NativeSelect
                  id="selected-product-category"
                  {...form.register('categoryId', {
                    setValueAs: optionalNumericInput,
                  })}
                >
                  <NativeSelectOption value="">{t('labels.noCategory')}</NativeSelectOption>
                  {meta.categories.map((category) => (
                    <NativeSelectOption key={category.id} value={category.id}>
                      {category.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
                {form.formState.errors.categoryId ? (
                  <FieldError role="alert">{form.formState.errors.categoryId.message}</FieldError>
                ) : null}
              </Field>
            </div>
            <div className="mt-5 grid gap-px overflow-hidden rounded-[var(--shape-radius-card)] border border-border/60 bg-border/60 sm:grid-cols-2">
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
          </FormSection>

          <FormSection title={t('adminWorkspace.products.content')}>
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
          </FormSection>

          <FormSection title={t('products.promos.title')}>
            <div className="space-y-3">
              {promoFields.fields.map((field, index) => {
                const code = draftValues.promoCodes?.[index]?.code?.trim() ?? '';
                return (
                  <div
                    key={field.id}
                    className="rounded-[var(--shape-radius-card)] border border-border/60 bg-muted/15 p-3"
                  >
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field>
                        <FieldLabel htmlFor={`selected-promo-code-${field.id}`}>
                          {t('products.promos.code')}
                        </FieldLabel>
                        <Input
                          id={`selected-promo-code-${field.id}`}
                          aria-invalid={Boolean(form.formState.errors.promoCodes?.[index]?.code)}
                          aria-describedby={`promo-code-error-${field.id}`}
                          {...form.register(`promoCodes.${index}.code`)}
                        />
                        {form.formState.errors.promoCodes?.[index]?.code ? (
                          <FieldError id={`promo-code-error-${field.id}`} role="alert">
                            {form.formState.errors.promoCodes[index].code?.message}
                          </FieldError>
                        ) : null}
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
                          aria-invalid={Boolean(
                            form.formState.errors.promoCodes?.[index]?.promoPrice,
                          )}
                          aria-describedby={`promo-promoPrice-error-${field.id}`}
                          {...form.register(`promoCodes.${index}.promoPrice`, {
                            valueAsNumber: true,
                          })}
                        />
                        {form.formState.errors.promoCodes?.[index]?.promoPrice ? (
                          <FieldError id={`promo-promoPrice-error-${field.id}`} role="alert">
                            {form.formState.errors.promoCodes[index].promoPrice?.message}
                          </FieldError>
                        ) : null}
                      </Field>
                      <Field>
                        <FieldLabel htmlFor={`selected-promo-start-${field.id}`}>
                          {t('products.promos.startsAt')}
                        </FieldLabel>
                        <Input
                          id={`selected-promo-start-${field.id}`}
                          type="datetime-local"
                          aria-invalid={Boolean(
                            form.formState.errors.promoCodes?.[index]?.startsAt,
                          )}
                          aria-describedby={`promo-startsAt-error-${field.id}`}
                          {...form.register(`promoCodes.${index}.startsAt`)}
                        />
                        {form.formState.errors.promoCodes?.[index]?.startsAt ? (
                          <FieldError id={`promo-startsAt-error-${field.id}`} role="alert">
                            {form.formState.errors.promoCodes[index].startsAt?.message}
                          </FieldError>
                        ) : null}
                      </Field>
                      <Field>
                        <FieldLabel htmlFor={`selected-promo-end-${field.id}`}>
                          {t('products.promos.endsAt')}
                        </FieldLabel>
                        <Input
                          id={`selected-promo-end-${field.id}`}
                          type="datetime-local"
                          aria-invalid={Boolean(form.formState.errors.promoCodes?.[index]?.endsAt)}
                          aria-describedby={`promo-endsAt-error-${field.id}`}
                          {...form.register(`promoCodes.${index}.endsAt`)}
                        />
                        {form.formState.errors.promoCodes?.[index]?.endsAt ? (
                          <FieldError id={`promo-endsAt-error-${field.id}`} role="alert">
                            {form.formState.errors.promoCodes[index].endsAt?.message}
                          </FieldError>
                        ) : null}
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
                                buildDraftPromoHref(draftValues, code, storefrontBaseUrl),
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
          </FormSection>

          <FormSection title={t('labels.images')}>
            <ImageUploadField
              onUploadingChange={setUploading}
              uploadUrl="/api/uploads/products"
              label={t('labels.images')}
              multiple
              value={images}
              onChange={(urls) =>
                form.setValue('images', urls, { shouldDirty: true, shouldValidate: true })
              }
            />
          </FormSection>
          <button type="submit" className="sr-only">
            {t('actions.save')}
          </button>
        </form>
      )}
    </SidePanel>
  );
}
