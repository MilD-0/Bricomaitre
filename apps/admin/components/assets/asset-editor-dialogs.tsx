'use client';

/* eslint-disable @next/next/no-img-element -- Admin asset selectors preview configured and legacy arbitrary image origins. */

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';

import {
  assetBannerSchema,
  featuredProductGroupSchema,
  productCardSchema,
  type AssetBannerInput,
  type AssetBannerPayload,
  type AssetMetaBrand,
  type AssetMetaCategory,
  type AssetMetaProduct,
  type FeaturedProductGroupInput,
  type FeaturedProductGroupPayload,
  type ProductCardInput,
  type ProductCardPayload,
} from '../../lib/assets';
import { ImageUploadField } from '../image-upload-field';
import { ProductPickerField } from '../product-picker-field';
import { Badge } from '../ui/badge';
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
import { Switch } from '../ui/switch';
import { Textarea } from '../ui/textarea';

const bannerDefaults: AssetBannerInput = {
  title: '',
  titleAr: '',
  imageUrl: '',
  imageUrlPortrait: '',
  imageUrlLandscape: '',
  productId: null,
  active: true,
};

const groupDefaults: FeaturedProductGroupInput = {
  name: '',
  nameAr: '',
  cta: '',
  ctaAr: '',
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

function linesToArray(value: string) {
  return value
    .split('\n')
    .map((entry) => entry.replace(/\r/g, ''))
    .filter((entry) => entry.trim().length > 0);
}

function arrayToLines(value: string[]) {
  return value.join('\n');
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
  items: Array<{
    id: number;
    label: string;
    imageUrl?: string | null;
    description?: string | null;
  }>;
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
    onChange(
      selectedIds.includes(id) ? selectedIds.filter((entry) => entry !== id) : [...selectedIds, id],
    );
  };

  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <div className="flex flex-col gap-3 rounded-xl border border-border/70 bg-muted/20 p-3">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={searchPlaceholder}
        />

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

        <div
          className={
            layout === 'rich'
              ? 'flex max-h-72 flex-col gap-3 overflow-y-auto'
              : 'grid max-h-56 gap-2 overflow-y-auto sm:grid-cols-2'
          }
        >
          {filteredItems.length > 0 ? (
            filteredItems.map((item) => {
              const checked = selectedIds.includes(item.id);

              if (layout === 'rich') {
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={checked}
                    aria-label={
                      checked
                        ? t('removeSelection', { name: item.label })
                        : t('addSelection', { name: item.label })
                    }
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
                      {item.description ? (
                        <p className="mt-1 text-sm leading-5 text-muted-foreground">
                          {item.description}
                        </p>
                      ) : null}
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

export function BannerDialogForm({
  open,
  mode,
  products,
  initialValues,
  pending,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  mode: 'create' | 'edit';
  products: AssetMetaProduct[];
  initialValues?: AssetBannerInput;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: AssetBannerPayload) => void | Promise<void>;
}) {
  const t = useTranslations('assetsManager');
  const form = useForm<AssetBannerInput, unknown, AssetBannerPayload>({
    resolver: zodResolver(assetBannerSchema),
    defaultValues: initialValues ?? bannerDefaults,
  });
  const portraitImageValue = useWatch({ control: form.control, name: 'imageUrlPortrait' }) ?? '';
  const landscapeImageValue = useWatch({ control: form.control, name: 'imageUrlLandscape' }) ?? '';
  const selectedProductId = useWatch({ control: form.control, name: 'productId' }) ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {mode === 'create' ? t('createBannerTitle') : t('editBannerTitle')}
          </DialogTitle>
          <DialogDescription>{t('bannerDialogDescription')}</DialogDescription>
        </DialogHeader>

        <form className="mt-5 flex flex-col gap-4" onSubmit={form.handleSubmit(onSubmit)}>
          <Field>
            <FieldLabel htmlFor="asset-banner-title">{t('titleLabel')}</FieldLabel>
            <Input
              id="asset-banner-title"
              placeholder={t('bannerTitlePlaceholder')}
              {...form.register('title')}
            />
            {form.formState.errors.title ? (
              <FieldError>{form.formState.errors.title.message}</FieldError>
            ) : null}
          </Field>

          <Field>
            <FieldLabel htmlFor="asset-banner-title-ar">{t('titleArLabel')}</FieldLabel>
            <Input
              id="asset-banner-title-ar"
              placeholder={t('bannerTitleArPlaceholder')}
              {...form.register('titleAr')}
            />
            {form.formState.errors.titleAr ? (
              <FieldError>{form.formState.errors.titleAr.message}</FieldError>
            ) : null}
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
            onChange={(value) =>
              form.setValue('productId', value, { shouldDirty: true, shouldValidate: true })
            }
          />
          {form.formState.errors.productId ? (
            <FieldError>{form.formState.errors.productId.message}</FieldError>
          ) : null}

          <ImageUploadField
            uploadUrl="/api/uploads/assets"
            label={t('bannerLandscapeImageLabel')}
            value={landscapeImageValue ? [landscapeImageValue] : []}
            onChange={(urls) =>
              form.setValue('imageUrlLandscape', urls[0] ?? '', {
                shouldDirty: true,
                shouldValidate: true,
              })
            }
          />
          <p className="-mt-2 text-xs leading-5 text-muted-foreground">
            {t('bannerLandscapeImageHint')}
          </p>
          {form.formState.errors.imageUrlLandscape ? (
            <FieldError>{form.formState.errors.imageUrlLandscape.message}</FieldError>
          ) : null}

          <ImageUploadField
            uploadUrl="/api/uploads/assets"
            label={t('bannerPortraitImageLabel')}
            value={portraitImageValue ? [portraitImageValue] : []}
            onChange={(urls) =>
              form.setValue('imageUrlPortrait', urls[0] ?? '', {
                shouldDirty: true,
                shouldValidate: true,
              })
            }
          />
          <p className="-mt-2 text-xs leading-5 text-muted-foreground">
            {t('bannerPortraitImageHint')}
          </p>
          {form.formState.errors.imageUrlPortrait ? (
            <FieldError>{form.formState.errors.imageUrlPortrait.message}</FieldError>
          ) : null}
          {form.formState.errors.imageUrl ? (
            <FieldError>{form.formState.errors.imageUrl.message}</FieldError>
          ) : null}

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

export function FeaturedGroupDialogForm({
  open,
  mode,
  products,
  brands,
  categories,
  initialValues,
  pending,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  mode: 'create' | 'edit';
  products: AssetMetaProduct[];
  brands: AssetMetaBrand[];
  categories: AssetMetaCategory[];
  initialValues?: FeaturedProductGroupInput;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: FeaturedProductGroupPayload) => void | Promise<void>;
}) {
  const t = useTranslations('assetsManager');
  const form = useForm<FeaturedProductGroupInput, unknown, FeaturedProductGroupPayload>({
    resolver: zodResolver(featuredProductGroupSchema),
    defaultValues: initialValues ?? groupDefaults,
  });
  const selectedProductIds =
    (useWatch({ control: form.control, name: 'productIds' }) as number[] | undefined) ?? [];
  const selectedBrandIds =
    (useWatch({ control: form.control, name: 'brandIds' }) as number[] | undefined) ?? [];
  const selectedCategoryIds =
    (useWatch({ control: form.control, name: 'categoryIds' }) as number[] | undefined) ?? [];
  const showAtTopOfProductsPage =
    useWatch({ control: form.control, name: 'showAtTopOfProductsPage' }) ?? false;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {mode === 'create' ? t('createGroupTitle') : t('editGroupTitle')}
          </DialogTitle>
          <DialogDescription>{t('groupDialogDescription')}</DialogDescription>
        </DialogHeader>

        <form className="mt-5 flex flex-col gap-4" onSubmit={form.handleSubmit(onSubmit)}>
          <Field>
            <FieldLabel htmlFor="asset-group-name">{t('groupNameLabel')}</FieldLabel>
            <Input
              id="asset-group-name"
              placeholder={t('groupNamePlaceholder')}
              {...form.register('name')}
            />
            {form.formState.errors.name ? (
              <FieldError>{form.formState.errors.name.message}</FieldError>
            ) : null}
          </Field>

          <Field>
            <FieldLabel htmlFor="asset-group-name-ar">{t('groupNameArLabel')}</FieldLabel>
            <Input
              id="asset-group-name-ar"
              placeholder={t('groupNameArPlaceholder')}
              {...form.register('nameAr')}
            />
            {form.formState.errors.nameAr ? (
              <FieldError>{form.formState.errors.nameAr.message}</FieldError>
            ) : null}
          </Field>

          <div className="grid gap-4 md:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="asset-group-cta">{t('groupCtaLabel')}</FieldLabel>
              <Input
                id="asset-group-cta"
                placeholder={t('groupCtaPlaceholder')}
                {...form.register('cta')}
              />
              {form.formState.errors.cta ? (
                <FieldError>{form.formState.errors.cta.message}</FieldError>
              ) : null}
            </Field>

            <Field>
              <FieldLabel htmlFor="asset-group-cta-ar">{t('groupCtaArLabel')}</FieldLabel>
              <Input
                id="asset-group-cta-ar"
                placeholder={t('groupCtaArPlaceholder')}
                {...form.register('ctaAr')}
              />
              {form.formState.errors.ctaAr ? (
                <FieldError>{form.formState.errors.ctaAr.message}</FieldError>
              ) : null}
            </Field>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="asset-group-link">{t('groupLinkLabel')}</FieldLabel>
              <Input
                id="asset-group-link"
                placeholder={t('groupLinkPlaceholder')}
                {...form.register('link')}
              />
              {form.formState.errors.link ? (
                <FieldError>{form.formState.errors.link.message}</FieldError>
              ) : null}
            </Field>
          </div>

          <Field>
            <div className="flex items-center justify-between gap-4 rounded-xl border border-border/70 bg-muted/20 px-4 py-3">
              <div className="flex flex-col gap-1">
                <FieldLabel htmlFor="asset-group-show-at-top">
                  {t('groupShowAtTopLabel')}
                </FieldLabel>
                <p className="text-sm text-muted-foreground">{t('groupShowAtTopDescription')}</p>
              </div>
              <Switch
                id="asset-group-show-at-top"
                checked={showAtTopOfProductsPage}
                onCheckedChange={(checked) =>
                  form.setValue('showAtTopOfProductsPage', checked, {
                    shouldDirty: true,
                    shouldValidate: true,
                  })
                }
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
            onChange={(value) =>
              form.setValue('productIds', value, { shouldDirty: true, shouldValidate: true })
            }
          />

          <SelectionField
            label={t('brandsLabel')}
            items={brands.map((brand) => ({ id: brand.id, label: brand.name }))}
            selectedIds={selectedBrandIds}
            searchPlaceholder={t('brandsSearchPlaceholder')}
            emptyLabel={t('brandsEmptySearch')}
            onChange={(value) =>
              form.setValue('brandIds', value, { shouldDirty: true, shouldValidate: true })
            }
          />

          <SelectionField
            label={t('categoriesLabel')}
            items={categories.map((category) => ({ id: category.id, label: category.name }))}
            selectedIds={selectedCategoryIds}
            searchPlaceholder={t('categoriesSearchPlaceholder')}
            emptyLabel={t('categoriesEmptySearch')}
            onChange={(value) =>
              form.setValue('categoryIds', value, { shouldDirty: true, shouldValidate: true })
            }
          />
          {form.formState.errors.productIds ? (
            <FieldError>{form.formState.errors.productIds.message}</FieldError>
          ) : null}

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

export function ProductCardDialogForm({
  open,
  mode,
  products,
  initialValues,
  pending,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  mode: 'create' | 'edit';
  products: AssetMetaProduct[];
  initialValues?: ProductCardInput;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: ProductCardPayload) => void | Promise<void>;
}) {
  const t = useTranslations('assetsManager');
  const defaults = initialValues ?? cardDefaults;
  const form = useForm<ProductCardInput, unknown, ProductCardPayload>({
    resolver: zodResolver(productCardSchema),
    defaultValues: defaults,
  });
  const selectedProductId = useWatch({ control: form.control, name: 'productId' });
  const [characteristicsArDraft, setCharacteristicsArDraft] = useState(() =>
    arrayToLines(defaults.characteristicsAr ?? []),
  );
  const [characteristicsFrDraft, setCharacteristicsFrDraft] = useState(() =>
    arrayToLines(defaults.characteristicsFr ?? []),
  );

  const selectedProduct = useMemo(
    () => products.find((product) => product.id === Number(selectedProductId)) ?? null,
    [products, selectedProductId],
  );

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
            void form.handleSubmit(onSubmit)();
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
            onChange={(value) =>
              form.setValue('productId', value ?? 0, { shouldDirty: true, shouldValidate: true })
            }
          />
          {form.formState.errors.productId ? (
            <FieldError>{form.formState.errors.productId.message}</FieldError>
          ) : null}

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
              <Input
                id="asset-card-title-ar"
                placeholder={t('titleArPlaceholder')}
                {...form.register('titleAr')}
              />
              {form.formState.errors.titleAr ? (
                <FieldError>{form.formState.errors.titleAr.message}</FieldError>
              ) : null}
            </Field>

            <Field>
              <FieldLabel htmlFor="asset-card-title-fr">{t('titleFrLabel')}</FieldLabel>
              <Input
                id="asset-card-title-fr"
                placeholder={t('titleFrPlaceholder')}
                {...form.register('titleFr')}
              />
              {form.formState.errors.titleFr ? (
                <FieldError>{form.formState.errors.titleFr.message}</FieldError>
              ) : null}
            </Field>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="asset-card-description-ar">{t('descriptionArLabel')}</FieldLabel>
              <Textarea
                id="asset-card-description-ar"
                placeholder={t('descriptionArPlaceholder')}
                maxLength={140}
                {...form.register('descriptionAr')}
              />
              {form.formState.errors.descriptionAr ? (
                <FieldError>{form.formState.errors.descriptionAr.message}</FieldError>
              ) : null}
            </Field>

            <Field>
              <FieldLabel htmlFor="asset-card-description-fr">{t('descriptionFrLabel')}</FieldLabel>
              <Textarea
                id="asset-card-description-fr"
                placeholder={t('descriptionFrPlaceholder')}
                maxLength={140}
                {...form.register('descriptionFr')}
              />
              {form.formState.errors.descriptionFr ? (
                <FieldError>{form.formState.errors.descriptionFr.message}</FieldError>
              ) : null}
            </Field>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="asset-card-characteristics-ar">
                {t('characteristicsArLabel')}
              </FieldLabel>
              <Textarea
                id="asset-card-characteristics-ar"
                placeholder={t('characteristicsArPlaceholder')}
                value={characteristicsArDraft}
                onChange={(event) => {
                  setCharacteristicsArDraft(event.target.value);
                }}
                onBlur={syncCharacteristicsToForm}
              />
              {form.formState.errors.characteristicsAr ? (
                <FieldError>{form.formState.errors.characteristicsAr.message}</FieldError>
              ) : null}
            </Field>

            <Field>
              <FieldLabel htmlFor="asset-card-characteristics-fr">
                {t('characteristicsFrLabel')}
              </FieldLabel>
              <Textarea
                id="asset-card-characteristics-fr"
                placeholder={t('characteristicsFrPlaceholder')}
                value={characteristicsFrDraft}
                onChange={(event) => {
                  setCharacteristicsFrDraft(event.target.value);
                }}
                onBlur={syncCharacteristicsToForm}
              />
              {form.formState.errors.characteristicsFr ? (
                <FieldError>{form.formState.errors.characteristicsFr.message}</FieldError>
              ) : null}
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
