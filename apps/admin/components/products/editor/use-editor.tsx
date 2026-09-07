'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';

import { requestJson as request } from '../../../lib/admin-api';
import {
  productPayloadSchema,
  type ProductPayload,
  type ProductPayloadInput,
  type ProductRecord,
} from '../../../lib/products';
import { toast } from '../../../lib/toast';
import { useStorefrontBaseUrl } from '../../storefront-origin';

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

export function optionalNumericInput(value: unknown) {
  return value == null || value === '' ? null : Number(value);
}

function toDateTimeInput(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString().slice(0, 16);
}

export function productFormValues(product: ProductRecord): ProductPayloadInput {
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

export function useProductEditorPanel({
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
  const initialDetailLoading =
    productId !== null && detailQuery.isFetching && detailQuery.dataUpdatedAt === 0;
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [uploading, setUploading] = useState(false);

  const isDirty = form.formState.isDirty;
  const [sourceUpdatedAt, setSourceUpdatedAt] = useState<string | null>(null);
  const currentUpdatedAt = detailQuery.data?.item.updatedAt ?? null;
  if (!isDirty && sourceUpdatedAt !== currentUpdatedAt) setSourceUpdatedAt(currentUpdatedAt);
  const initializedProductRef = useRef<number | 'new' | null>(null);
  useEffect(() => {
    if (!state) {
      initializedProductRef.current = null;
      return;
    }
    const identity = state.mode === 'edit' ? state.product.id : 'new';
    const source = state.mode === 'edit' ? (detailQuery.data?.item ?? state.product) : null;
    if (initializedProductRef.current !== identity) {
      form.reset(source ? productFormValues(source) : emptyProduct);
      initializedProductRef.current = identity;
    } else if (!isDirty) {
      form.reset(source ? productFormValues(source) : emptyProduct);
    }
  }, [detailQuery.data?.item, form, state, isDirty]);

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
        t('adminWorkspace.products.archiveSuccess', {
          target: state?.mode === 'edit' ? state.product.title : '',
        }),
      );
      await onChanged();
      onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const submit = form.handleSubmit((rawValues) => {
    if (!uploading && !saveMutation.isPending && !deleteMutation.isPending)
      saveMutation.mutate(productPayloadSchema.parse(rawValues));
  });
  const pending = saveMutation.isPending || deleteMutation.isPending;
  const isEdit = state?.mode === 'edit';
  const title = isEdit ? t('labels.editProductTitle') : t('labels.createProductTitle');

  return {
    view: {
      state,
      pending,
      onClose,
      t,
      title,
      isEdit,
      confirmDelete,
      deleteMutation,
      setConfirmDelete,
      uploading,
      saveMutation,
      initialDetailLoading,
      submit,
      detailQuery,
      isDirty,
      currentUpdatedAt,
      sourceUpdatedAt,
      setSourceUpdatedAt,
      form,
      meta,
      active,
      inStock,
      promoFields,
      draftValues,
      storefrontBaseUrl,
      setUploading,
      images,
    } as const,
    fallback: null,
  };
}
