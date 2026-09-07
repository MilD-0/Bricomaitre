'use client';
import { Copy, Plus } from 'lucide-react';
import { toast } from '../../../lib/toast';
import { cn } from '../../../lib/utils';
import { ImageUploadField } from '../../image-upload-field';
import { Button } from '../../ui/button';
import { Field, FieldError, FieldLabel } from '../../ui/field';
import { FormSection } from '../../ui/form-section';
import { Input } from '../../ui/input';
import { NativeSelect } from '../../ui/native-select';
import { Switch } from '../../ui/switch';
import { Textarea } from '../../ui/textarea';
import { buildDraftPromoHref } from '../storefront-links';
import type { ProductEditorPanelView } from './editor-view';
import { optionalNumericInput } from './use-editor';
export function ProductForm({
  submit,
  pending,
  t,
  form,
  meta,
  active,
  inStock,
  promoFields,
  draftValues,
  storefrontBaseUrl,
  setUploading,
  images,
}: Pick<
  Parameters<typeof ProductEditorPanelView>[0],
  | 'submit'
  | 'pending'
  | 't'
  | 'form'
  | 'meta'
  | 'active'
  | 'inStock'
  | 'promoFields'
  | 'draftValues'
  | 'storefrontBaseUrl'
  | 'setUploading'
  | 'images'
>) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <fieldset disabled={pending} aria-busy={pending} className="contents">
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
                <FieldError role="alert">{form.formState.errors.purchasePrice.message}</FieldError>
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
                <option value="">{t('labels.noBrand')}</option>
                {meta.brands.map((brand) => (
                  <option key={brand.id} value={brand.id}>
                    {brand.name}
                  </option>
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
                <option value="">{t('labels.noCategory')}</option>
                {meta.categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
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
                        aria-invalid={Boolean(form.formState.errors.promoCodes?.[index]?.startsAt)}
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
          <div inert={pending}>
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
          </div>
        </FormSection>
        <button type="submit" className="sr-only">
          {t('actions.save')}
        </button>
      </fieldset>
    </form>
  );
}
