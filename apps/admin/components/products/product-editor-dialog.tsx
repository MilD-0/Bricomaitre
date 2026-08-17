'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';

import { requestJson as request } from '../../lib/admin-api';
import type { ProductPayload, ProductPayloadInput, ProductRecord } from '../../lib/products';
import { toast } from '../../lib/toast';
import { ImageUploadField } from '../image-upload-field';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Field, FieldError, FieldGroup, FieldLabel } from '../ui/field';
import { Input } from '../ui/input';
import { PendingInline } from '../ui/motion';
import { NativeSelect, NativeSelectOption } from '../ui/native-select';
import { Spinner } from '../ui/spinner';
import { Switch } from '../ui/switch';
import { Textarea } from '../ui/textarea';
import { buildDraftPromoHref } from './storefront-links';

export type BrandOption = { id: number; name: string };
export type CategoryOption = { id: number; name: string; parentId: number | null };

type AiContentProposal = {
  id: number;
  status: 'proposed';
  before: Partial<Pick<ProductPayload, 'title' | 'titleAr' | 'description' | 'descriptionAr'>>;
  changes: Partial<Pick<ProductPayload, 'title' | 'titleAr' | 'description' | 'descriptionAr'>>;
  reasoning: string | null;
  expiresAt: string;
  createdAt?: string;
};

export function ProductDialogForm({
  open,
  mode,
  form,
  pending,
  editingId,
  brandOptions,
  categoryOptions,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  mode: 'create' | 'edit';
  form: ReturnType<typeof useForm<ProductPayloadInput>>;
  pending: boolean;
  editingId: number | null;
  brandOptions: BrandOption[];
  categoryOptions: CategoryOption[];
  onOpenChange: (open: boolean) => void;
  onSubmit: () => void;
}) {
  const t = useTranslations();
  const images = useWatch({ control: form.control, name: 'images' }) ?? [];
  const draftValues = useWatch({ control: form.control });
  const promoFields = useFieldArray({ control: form.control, name: 'promoCodes' });

  async function copyPromoUrl(code: string) {
    try {
      await navigator.clipboard.writeText(buildDraftPromoHref(draftValues, code));
      toast.success(t('products.promos.copySuccess'));
    } catch {
      toast.error(t('products.promos.copyError'));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {mode === 'create' ? t('labels.createProductTitle') : t('labels.editProductTitle')}
          </DialogTitle>
          <DialogDescription>{t('labels.productDialogDescription')}</DialogDescription>
        </DialogHeader>

        <form
          className="mt-4"
          onSubmit={(event) => {
            event.preventDefault();
            void onSubmit();
          }}
        >
          <FieldGroup className="grid gap-4 md:grid-cols-2">
            {mode === 'edit' && editingId !== null ? (
              <AiProductContentPanel productId={editingId} form={form} />
            ) : null}
            <Field>
              <FieldLabel htmlFor="product-title">{t('labels.productName')}</FieldLabel>
              <Input
                id="product-title"
                placeholder={t('labels.productNamePlaceholder')}
                {...form.register('title')}
              />
              {form.formState.errors.title ? (
                <FieldError>{form.formState.errors.title.message}</FieldError>
              ) : null}
            </Field>

            <Field>
              <FieldLabel htmlFor="product-title-ar">{t('labels.nameAr')}</FieldLabel>
              <Input
                id="product-title-ar"
                placeholder={t('labels.productNameArPlaceholder')}
                {...form.register('titleAr')}
              />
              {form.formState.errors.titleAr ? (
                <FieldError>{form.formState.errors.titleAr.message}</FieldError>
              ) : null}
            </Field>

            <Field>
              <FieldLabel htmlFor="product-sku">{t('labels.sku')}</FieldLabel>
              <Input
                id="product-sku"
                placeholder={t('labels.productSkuPlaceholder')}
                {...form.register('sku')}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="product-barcode">{t('labels.barcode')}</FieldLabel>
              <Input
                id="product-barcode"
                placeholder={t('labels.productBarcodePlaceholder')}
                {...form.register('barcode')}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="product-price">{t('labels.price')}</FieldLabel>
              <Input
                id="product-price"
                type="number"
                step="0.01"
                placeholder="0.00"
                {...form.register('price', { valueAsNumber: true })}
              />
              {form.formState.errors.price ? (
                <FieldError>{form.formState.errors.price.message}</FieldError>
              ) : null}
            </Field>

            <Field>
              <FieldLabel htmlFor="product-purchase-price">{t('labels.purchasePrice')}</FieldLabel>
              <Input
                id="product-purchase-price"
                type="number"
                step="0.01"
                placeholder="0.00"
                {...form.register('purchasePrice', {
                  setValueAs: (value) => (value === '' ? null : Number(value)),
                })}
              />
              {form.formState.errors.purchasePrice ? (
                <FieldError>{form.formState.errors.purchasePrice.message}</FieldError>
              ) : null}
            </Field>

            <Field>
              <FieldLabel htmlFor="product-old-price">{t('labels.compareAtPrice')}</FieldLabel>
              <Input
                id="product-old-price"
                type="number"
                step="0.01"
                placeholder="0.00"
                {...form.register('oldPrice', {
                  setValueAs: (value) => (value === '' ? null : Number(value)),
                })}
              />
              {form.formState.errors.oldPrice ? (
                <FieldError>{form.formState.errors.oldPrice.message}</FieldError>
              ) : null}
            </Field>

            <div className="md:col-span-2 rounded-2xl border border-border/70 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium">{t('products.promos.title')}</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
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
                  {t('products.promos.add')}
                </Button>
              </div>
              <div className="mt-4 flex flex-col gap-4">
                {promoFields.fields.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t('products.promos.empty')}</p>
                ) : null}
                {promoFields.fields.map((field, index) => {
                  const code = draftValues.promoCodes?.[index]?.code?.trim() ?? '';
                  return (
                    <div
                      key={field.id}
                      className="grid gap-3 rounded-xl border border-border/70 p-3 md:grid-cols-2"
                    >
                      <Field>
                        <FieldLabel htmlFor={`product-promo-code-${field.id}`}>
                          {t('products.promos.code')}
                        </FieldLabel>
                        <Input
                          id={`product-promo-code-${field.id}`}
                          {...form.register(`promoCodes.${index}.code`)}
                        />
                        {form.formState.errors.promoCodes?.[index]?.code ? (
                          <FieldError>
                            {form.formState.errors.promoCodes[index]?.code?.message}
                          </FieldError>
                        ) : null}
                      </Field>
                      <Field>
                        <FieldLabel htmlFor={`product-promo-price-${field.id}`}>
                          {t('products.promos.price')}
                        </FieldLabel>
                        <Input
                          id={`product-promo-price-${field.id}`}
                          type="number"
                          min="0"
                          step="0.01"
                          {...form.register(`promoCodes.${index}.promoPrice`, {
                            valueAsNumber: true,
                          })}
                        />
                        {form.formState.errors.promoCodes?.[index]?.promoPrice ? (
                          <FieldError>
                            {form.formState.errors.promoCodes[index]?.promoPrice?.message}
                          </FieldError>
                        ) : null}
                      </Field>
                      <Field>
                        <FieldLabel htmlFor={`product-promo-start-${field.id}`}>
                          {t('products.promos.startsAt')}
                        </FieldLabel>
                        <Input
                          id={`product-promo-start-${field.id}`}
                          type="datetime-local"
                          {...form.register(`promoCodes.${index}.startsAt`)}
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor={`product-promo-end-${field.id}`}>
                          {t('products.promos.endsAt')}
                        </FieldLabel>
                        <Input
                          id={`product-promo-end-${field.id}`}
                          type="datetime-local"
                          {...form.register(`promoCodes.${index}.endsAt`)}
                        />
                      </Field>
                      <Field orientation="horizontal" className="md:col-span-2">
                        <Switch
                          checked={Boolean(draftValues.promoCodes?.[index]?.active ?? true)}
                          onCheckedChange={(checked) =>
                            form.setValue(`promoCodes.${index}.active`, checked, {
                              shouldDirty: true,
                            })
                          }
                        />
                        <FieldLabel>{t('products.promos.active')}</FieldLabel>
                      </Field>
                      {code ? (
                        <div className="md:col-span-2 rounded-lg bg-muted/60 px-3 py-2 text-xs">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <span className="break-all font-mono">
                              {buildDraftPromoHref(draftValues, code)}
                            </span>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => copyPromoUrl(code)}
                            >
                              {t('products.promos.copy')}
                            </Button>
                          </div>
                        </div>
                      ) : null}
                      <div className="md:col-span-2 flex justify-end">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => promoFields.remove(index)}
                        >
                          {t('products.promos.remove')}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <Field>
              <FieldLabel htmlFor="product-quantity">{t('labels.inventoryQuantity')}</FieldLabel>
              <Input
                id="product-quantity"
                type="number"
                min="0"
                step="1"
                placeholder="0"
                {...form.register('inventoryQuantity', { valueAsNumber: true })}
              />
              {form.formState.errors.inventoryQuantity ? (
                <FieldError>{form.formState.errors.inventoryQuantity.message}</FieldError>
              ) : null}
            </Field>

            <Field>
              <FieldLabel htmlFor="product-brand">{t('nav.brands')}</FieldLabel>
              <NativeSelect
                id="product-brand"
                aria-label={t('nav.brands')}
                {...form.register('brandId', {
                  setValueAs: (value) => (value === '' ? null : Number(value)),
                })}
              >
                <NativeSelectOption value="">{t('labels.noBrand')}</NativeSelectOption>
                {brandOptions.map((brand) => (
                  <NativeSelectOption key={brand.id} value={brand.id}>
                    {brand.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>

            <Field>
              <FieldLabel htmlFor="product-category">{t('nav.categories')}</FieldLabel>
              <NativeSelect
                id="product-category"
                aria-label={t('nav.categories')}
                {...form.register('categoryId', {
                  setValueAs: (value) => (value === '' ? null : Number(value)),
                })}
              >
                <NativeSelectOption value="">{t('labels.noCategory')}</NativeSelectOption>
                {categoryOptions.map((category) => (
                  <NativeSelectOption key={category.id} value={category.id}>
                    {category.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>

            <Field
              orientation="horizontal"
              className="rounded-2xl border border-border/70 px-3 py-3"
            >
              <div className="flex-1">
                <FieldLabel htmlFor="product-active">{t('labels.active')}</FieldLabel>
              </div>
              <Switch
                checked={Boolean(useWatch({ control: form.control, name: 'active' }))}
                aria-label={t('labels.active')}
                onCheckedChange={(checked) =>
                  form.setValue('active', checked, { shouldDirty: true })
                }
              />
            </Field>

            <Field
              orientation="horizontal"
              className="rounded-2xl border border-border/70 px-3 py-3"
            >
              <div className="flex-1">
                <FieldLabel htmlFor="product-stock">{t('labels.inStock')}</FieldLabel>
              </div>
              <Switch
                checked={Boolean(useWatch({ control: form.control, name: 'inStock' }))}
                aria-label={t('labels.inStock')}
                onCheckedChange={(checked) => {
                  form.setValue('inStock', checked, { shouldDirty: true });
                  form.setValue('availabilityStatus', checked ? 'in_stock' : 'out_of_stock', {
                    shouldDirty: true,
                  });
                }}
              />
            </Field>

            <Field className="md:col-span-2">
              <FieldLabel htmlFor="product-description">{t('labels.description')}</FieldLabel>
              <Textarea
                id="product-description"
                className="min-h-28"
                placeholder={t('labels.productDescriptionPlaceholder')}
                {...form.register('description')}
              />
            </Field>

            <Field className="md:col-span-2">
              <FieldLabel htmlFor="product-description-ar">{t('labels.descriptionAr')}</FieldLabel>
              <Textarea
                id="product-description-ar"
                className="min-h-28"
                placeholder={t('labels.productDescriptionArPlaceholder')}
                {...form.register('descriptionAr')}
              />
            </Field>

            <div className="md:col-span-2">
              <ImageUploadField
                uploadUrl="/api/uploads/products"
                label={t('labels.images')}
                multiple
                value={images}
                onChange={(urls) =>
                  form.setValue('images', urls, { shouldDirty: true, shouldValidate: true })
                }
              />
            </div>
          </FieldGroup>

          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('actions.cancel')}
            </Button>
            <Button type="submit" disabled={pending}>
              {mode === 'create' ? t('actions.createProduct') : t('actions.saveProduct')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AiProductContentPanel({
  productId,
  form,
}: {
  productId: number;
  form: ReturnType<typeof useForm<ProductPayloadInput>>;
}) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const proposalsQuery = useQuery({
    queryKey: ['ai-product-content-proposals', productId],
    queryFn: () =>
      request<{ proposals: AiContentProposal[] }>(`/api/ai/products/${productId}/proposals`),
    staleTime: 0,
  });
  const generateMutation = useMutation({
    mutationFn: () =>
      request<{ proposal: AiContentProposal }>(`/api/ai/products/${productId}/content/propose`, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    onSuccess: async () => {
      toast.success(t('products.ai.generated'));
      await queryClient.invalidateQueries({
        queryKey: ['ai-product-content-proposals', productId],
      });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const reviewMutation = useMutation({
    mutationFn: async ({
      proposalId,
      action,
    }: {
      proposalId: number;
      action: 'approve' | 'reject';
    }) => {
      const data = await request<{
        proposal: { status: 'applied' | 'rejected'; verified?: boolean; product?: ProductRecord };
      }>(`/api/ai/proposals/${proposalId}`, {
        method: 'PATCH',
        body: JSON.stringify({ action }),
      });
      if (data.proposal.status === 'applied' && data.proposal.verified !== true) {
        throw new Error(t('products.ai.verificationError'));
      }
      return data;
    },
    onSuccess: async (data) => {
      if (data.proposal.product) {
        const product = data.proposal.product;
        (['title', 'titleAr', 'description', 'descriptionAr'] as const).forEach((field) => {
          form.setValue(field, product[field], { shouldDirty: false });
        });
      }
      toast.success(
        t(data.proposal.status === 'applied' ? 'products.ai.applied' : 'products.ai.rejected'),
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['ai-product-content-proposals', productId] }),
        queryClient.invalidateQueries({ queryKey: ['products-table'] }),
      ]);
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const labels = {
    title: t('labels.productName'),
    titleAr: t('labels.nameAr'),
    description: t('labels.description'),
    descriptionAr: t('labels.descriptionAr'),
  };

  return (
    <div
      className="md:col-span-2 rounded-2xl border border-violet-500/30 bg-violet-500/5 p-4"
      data-testid="ai-product-content-panel"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-medium">{t('products.ai.title')}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t('products.ai.description')}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={generateMutation.isPending}
          onClick={() => generateMutation.mutate()}
        >
          {generateMutation.isPending ? (
            <Spinner data-icon="inline-start" className="size-3.5" />
          ) : null}
          {t('products.ai.generateMissing')}
        </Button>
      </div>
      {proposalsQuery.isLoading ? (
        <PendingInline active label={t('labels.loading')} className="mt-3" />
      ) : null}
      <div className="mt-4 space-y-3">
        {proposalsQuery.data?.proposals.map((proposal) => (
          <Card key={proposal.id} className="space-y-3 p-4">
            <div className="space-y-3">
              {Object.entries(proposal.changes).map(([field, value]) => {
                const key = field as keyof typeof labels;
                return (
                  <div key={field} className="grid gap-2 text-sm sm:grid-cols-2">
                    <div className="rounded-lg bg-muted/60 p-3">
                      <p className="text-xs font-medium text-muted-foreground">
                        {labels[key]} · {t('products.ai.before')}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap">
                        {String(proposal.before?.[key] ?? '—')}
                      </p>
                    </div>
                    <div className="rounded-lg bg-emerald-500/10 p-3">
                      <p className="text-xs font-medium text-emerald-700">
                        {labels[key]} · {t('products.ai.proposed')}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap">{String(value)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
            {proposal.reasoning ? (
              <p className="text-xs text-muted-foreground">{proposal.reasoning}</p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={reviewMutation.isPending}
                onClick={() => reviewMutation.mutate({ proposalId: proposal.id, action: 'reject' })}
              >
                {t('products.ai.reject')}
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={reviewMutation.isPending}
                onClick={() =>
                  reviewMutation.mutate({ proposalId: proposal.id, action: 'approve' })
                }
              >
                {t('products.ai.approve')}
              </Button>
            </div>
          </Card>
        ))}
        {proposalsQuery.isSuccess && proposalsQuery.data.proposals.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('products.ai.empty')}</p>
        ) : null}
      </div>
    </div>
  );
}
