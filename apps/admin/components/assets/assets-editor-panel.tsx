'use client';

import * as React from 'react';

import {
  assetBannerSchema,
  featuredProductGroupSchema,
  productCardSchema,
  type AssetBannerPayload,
  type AssetBannerRecord,
  type AssetMetaBrand,
  type AssetMetaCategory,
  type FeaturedProductGroupPayload,
  type FeaturedProductGroupRecord,
  type ProductCardPayload,
  type ProductCardRecord,
} from '../../lib/assets';
import { ImageUploadField } from '../image-upload-field';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import { Field, FieldError, FieldLabel } from '../ui/field';
import { Input } from '../ui/input';
import { SidePanel } from '../ui/side-panel';
import { Switch } from '../ui/switch';
import { Textarea } from '../ui/textarea';
import { RemoteProductPicker } from './remote-product-picker';

export type AssetsWorkspaceCopy = {
  title: string;
  banners: string;
  groups: string;
  cards: string;
  landingPages: string;
  create: string;
  edit: string;
  delete: string;
  cancel: string;
  save: string;
  close: string;
  active: string;
  inactive: string;
  actions: string;
  moveUp: string;
  moveDown: string;
  modified: string;
  noRecords: string;
  confirmDelete: string;
  product: string;
  order: string;
  bannerTitle: string;
  bannerTitleAr: string;
  landscape: string;
  portrait: string;
  groupName: string;
  groupNameAr: string;
  cta: string;
  ctaAr: string;
  link: string;
  recommendationPriority: string;
  products: string;
  brands: string;
  categories: string;
  noSelection: string;
  cardTitleFr: string;
  cardTitleAr: string;
  cardDescriptionFr: string;
  cardDescriptionAr: string;
  characteristicsFr: string;
  characteristicsAr: string;
  characteristicsRequirement: string;
  productSearch: string;
  productEmpty: string;
  selected: string;
  remove: string;
  validation: string;
  mutationFailed: string;
};

function validationMessage(copy: AssetsWorkspaceCopy, field: PropertyKey | undefined) {
  if (field === 'characteristicsFr' || field === 'characteristicsAr')
    return copy.characteristicsRequirement;
  const labels: Record<string, string> = {
    title: copy.bannerTitle,
    titleAr: copy.bannerTitleAr,
    imageUrlLandscape: copy.landscape,
    imageUrlPortrait: copy.portrait,
    name: copy.groupName,
    nameAr: copy.groupNameAr,
    cta: copy.cta,
    ctaAr: copy.ctaAr,
    link: copy.link,
    productId: copy.product,
    titleFr: copy.cardTitleFr,
    descriptionFr: copy.cardDescriptionFr,
    descriptionAr: copy.cardDescriptionAr,
  };
  const label = field === undefined ? undefined : labels[String(field)];
  return label ? `${label}: ${copy.validation}` : copy.validation;
}

type EditorState =
  | { kind: 'banner'; item?: AssetBannerRecord }
  | { kind: 'group'; item?: FeaturedProductGroupRecord }
  | { kind: 'card'; item?: ProductCardRecord };

function ProductPicker({
  copy,
  selectedIds,
  multiple,
  required,
  onChange,
}: {
  copy: AssetsWorkspaceCopy;
  selectedIds: number[];
  multiple?: boolean;
  required?: boolean;
  onChange: (ids: number[]) => void;
}) {
  return (
    <RemoteProductPicker
      label={copy.products}
      selectedIds={selectedIds}
      multiple={multiple}
      required={required}
      copy={{
        search: copy.productSearch,
        empty: copy.productEmpty,
        selected: copy.selected,
        inactive: copy.inactive,
        remove: copy.remove,
      }}
      onChange={onChange}
    />
  );
}

function OptionChecklist({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ id: number; name: string }>;
  value: number[];
  onChange: (value: number[]) => void;
}) {
  const [query, setQuery] = React.useState('');
  const normalized = query.trim().toLocaleLowerCase();
  const filtered = normalized
    ? options.filter((option) => option.name.toLocaleLowerCase().includes(normalized))
    : options;
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{label}</legend>
      <Input
        aria-label={label}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={label}
      />
      <div className="grid max-h-44 gap-1 overflow-y-auto border-y border-border/60 py-1 sm:grid-cols-2">
        {filtered.map((option) => (
          <label
            key={option.id}
            className="flex cursor-pointer items-center gap-2 px-2 py-2 text-sm"
          >
            <Checkbox
              checked={value.includes(option.id)}
              onChange={() =>
                onChange(
                  value.includes(option.id)
                    ? value.filter((id) => id !== option.id)
                    : [...value, option.id],
                )
              }
            />
            <span className="truncate">{option.name}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function BannerEditor({
  state,
  copy,
  pending,
  onClose,
  onSubmit,
}: {
  state: Extract<EditorState, { kind: 'banner' }>;
  copy: AssetsWorkspaceCopy;
  pending: boolean;
  onClose: () => void;
  onSubmit: (value: AssetBannerPayload) => Promise<void>;
}) {
  const item = state.item;
  const [title, setTitle] = React.useState(item?.title ?? '');
  const [titleAr, setTitleAr] = React.useState(item?.titleAr ?? '');
  const [productIds, setProductIds] = React.useState(item?.productId ? [item.productId] : []);
  const [landscape, setLandscape] = React.useState(item?.imageUrlLandscape ?? '');
  const [portrait, setPortrait] = React.useState(item?.imageUrlPortrait ?? '');
  const [active, setActive] = React.useState(item?.active ?? true);
  const [error, setError] = React.useState('');
  const [uploadingLandscape, setUploadingLandscape] = React.useState(false);
  const [uploadingPortrait, setUploadingPortrait] = React.useState(false);
  const uploading = uploadingLandscape || uploadingPortrait;

  const submit = async () => {
    if (pending || uploading) return;
    const parsed = assetBannerSchema.safeParse({
      title,
      titleAr,
      productId: productIds[0] ?? null,
      imageUrl: landscape,
      imageUrlLandscape: landscape,
      imageUrlPortrait: portrait,
      active,
    });
    if (!parsed.success) {
      setError(validationMessage(copy, parsed.error.issues[0]?.path[0]));
      return;
    }
    await onSubmit(parsed.data);
  };

  return (
    <SidePanel
      open
      onOpenChange={(open) => !open && onClose()}
      title={`${item ? copy.edit : copy.create} · ${copy.banners}`}
      closeLabel={copy.close}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            {copy.cancel}
          </Button>
          <Button disabled={pending || uploading} onClick={() => void submit()}>
            {copy.save}
          </Button>
        </div>
      }
    >
      <div className="space-y-5 p-4 sm:p-6">
        {error ? <FieldError>{error}</FieldError> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="asset2-banner-title">{copy.bannerTitle}</FieldLabel>
            <Input
              id="asset2-banner-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="asset2-banner-title-ar">{copy.bannerTitleAr}</FieldLabel>
            <Input
              id="asset2-banner-title-ar"
              dir="rtl"
              value={titleAr}
              onChange={(event) => setTitleAr(event.target.value)}
            />
          </Field>
        </div>
        <ProductPicker copy={copy} selectedIds={productIds} onChange={setProductIds} />
        <ImageUploadField
          uploadUrl="/api/uploads/assets"
          onUploadingChange={setUploadingLandscape}
          label={copy.landscape}
          value={landscape ? [landscape] : []}
          onChange={(urls) => setLandscape(urls[0] ?? '')}
        />
        <ImageUploadField
          uploadUrl="/api/uploads/assets"
          onUploadingChange={setUploadingPortrait}
          label={copy.portrait}
          value={portrait ? [portrait] : []}
          onChange={(urls) => setPortrait(urls[0] ?? '')}
        />
        <label className="flex items-center justify-between border-y border-border/60 py-3 text-sm font-medium">
          {copy.active}
          <Switch checked={active} onCheckedChange={setActive} />
        </label>
      </div>
    </SidePanel>
  );
}

function GroupEditor({
  state,
  copy,
  brands,
  categories,
  pending,
  onClose,
  onSubmit,
}: {
  state: Extract<EditorState, { kind: 'group' }>;
  copy: AssetsWorkspaceCopy;
  brands: AssetMetaBrand[];
  categories: AssetMetaCategory[];
  pending: boolean;
  onClose: () => void;
  onSubmit: (value: FeaturedProductGroupPayload) => Promise<void>;
}) {
  const item = state.item;
  const [name, setName] = React.useState(item?.name ?? '');
  const [nameAr, setNameAr] = React.useState(item?.nameAr ?? '');
  const [cta, setCta] = React.useState(item?.cta ?? '');
  const [ctaAr, setCtaAr] = React.useState(item?.ctaAr ?? '');
  const [link, setLink] = React.useState(item?.link ?? '');
  const [productIds, setProductIds] = React.useState(item?.productIds ?? []);
  const [brandIds, setBrandIds] = React.useState(item?.brandIds ?? []);
  const [categoryIds, setCategoryIds] = React.useState(item?.categoryIds ?? []);
  const [prioritizeRecommendations, setPrioritizeRecommendations] = React.useState(
    item?.prioritizeRecommendations ?? false,
  );
  const [active, setActive] = React.useState(item?.active ?? true);
  const [error, setError] = React.useState('');

  const submit = async () => {
    const parsed = featuredProductGroupSchema.safeParse({
      name,
      nameAr,
      cta,
      ctaAr,
      link,
      productIds,
      brandIds,
      categoryIds,
      prioritizeRecommendations,
      active,
    });
    if (!parsed.success) {
      setError(validationMessage(copy, parsed.error.issues[0]?.path[0]));
      return;
    }
    await onSubmit(parsed.data);
  };

  return (
    <SidePanel
      open
      onOpenChange={(open) => !open && onClose()}
      title={`${item ? copy.edit : copy.create} · ${copy.groups}`}
      closeLabel={copy.close}
      className="sm:max-w-[54rem]"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            {copy.cancel}
          </Button>
          <Button disabled={pending} onClick={() => void submit()}>
            {copy.save}
          </Button>
        </div>
      }
    >
      <div className="space-y-5 p-4 sm:p-6">
        {error ? <FieldError>{error}</FieldError> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="asset2-group-name">{copy.groupName}</FieldLabel>
            <Input
              id="asset2-group-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="asset2-group-name-ar">{copy.groupNameAr}</FieldLabel>
            <Input
              id="asset2-group-name-ar"
              dir="rtl"
              value={nameAr}
              onChange={(event) => setNameAr(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="asset2-group-cta">{copy.cta}</FieldLabel>
            <Input
              id="asset2-group-cta"
              value={cta}
              onChange={(event) => setCta(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="asset2-group-cta-ar">{copy.ctaAr}</FieldLabel>
            <Input
              id="asset2-group-cta-ar"
              dir="rtl"
              value={ctaAr}
              onChange={(event) => setCtaAr(event.target.value)}
            />
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor="asset2-group-link">{copy.link}</FieldLabel>
          <Input
            id="asset2-group-link"
            value={link}
            onChange={(event) => setLink(event.target.value)}
          />
        </Field>
        <ProductPicker copy={copy} selectedIds={productIds} multiple onChange={setProductIds} />
        <div className="grid gap-5 md:grid-cols-2">
          <OptionChecklist
            label={copy.brands}
            options={brands}
            value={brandIds}
            onChange={setBrandIds}
          />
          <OptionChecklist
            label={copy.categories}
            options={categories}
            value={categoryIds}
            onChange={setCategoryIds}
          />
        </div>
        <label className="flex items-center justify-between border-b border-border/60 pb-3 text-sm font-medium">
          {copy.recommendationPriority}
          <Switch
            checked={prioritizeRecommendations}
            onCheckedChange={setPrioritizeRecommendations}
          />
        </label>
        <label className="flex items-center justify-between border-b border-border/60 pb-3 text-sm font-medium">
          {copy.active}
          <Switch checked={active} onCheckedChange={setActive} />
        </label>
      </div>
    </SidePanel>
  );
}

function CardEditor({
  state,
  copy,
  pending,
  onClose,
  onSubmit,
}: {
  state: Extract<EditorState, { kind: 'card' }>;
  copy: AssetsWorkspaceCopy;
  pending: boolean;
  onClose: () => void;
  onSubmit: (value: ProductCardPayload) => Promise<void>;
}) {
  const item = state.item;
  const [productIds, setProductIds] = React.useState(item ? [item.productId] : []);
  const [titleFr, setTitleFr] = React.useState(item?.titleFr ?? '');
  const [titleAr, setTitleAr] = React.useState(item?.titleAr ?? '');
  const [descriptionFr, setDescriptionFr] = React.useState(item?.descriptionFr ?? '');
  const [descriptionAr, setDescriptionAr] = React.useState(item?.descriptionAr ?? '');
  const [characteristicsFr, setCharacteristicsFr] = React.useState(
    (item?.characteristicsFr ?? []).join('\n'),
  );
  const [characteristicsAr, setCharacteristicsAr] = React.useState(
    (item?.characteristicsAr ?? []).join('\n'),
  );
  const [active, setActive] = React.useState(item?.active ?? true);
  const [error, setError] = React.useState('');
  const lines = (value: string) =>
    value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

  const submit = async () => {
    if (lines(characteristicsFr).length < 3 || lines(characteristicsAr).length < 3) {
      setError(copy.characteristicsRequirement);
      return;
    }
    const parsed = productCardSchema.safeParse({
      productId: productIds[0] ?? 0,
      titleFr,
      titleAr,
      descriptionFr,
      descriptionAr,
      characteristicsFr: lines(characteristicsFr),
      characteristicsAr: lines(characteristicsAr),
      active,
    });
    if (!parsed.success) {
      setError(validationMessage(copy, parsed.error.issues[0]?.path[0]));
      return;
    }
    await onSubmit(parsed.data);
  };
  return (
    <SidePanel
      open
      onOpenChange={(open) => !open && onClose()}
      title={`${item ? copy.edit : copy.create} · ${copy.cards}`}
      closeLabel={copy.close}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            {copy.cancel}
          </Button>
          <Button disabled={pending} onClick={() => void submit()}>
            {copy.save}
          </Button>
        </div>
      }
    >
      <div className="space-y-5 p-4 sm:p-6">
        {error ? <FieldError>{error}</FieldError> : null}
        <ProductPicker copy={copy} selectedIds={productIds} required onChange={setProductIds} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="asset2-card-title-fr">{copy.cardTitleFr}</FieldLabel>
            <Input
              id="asset2-card-title-fr"
              value={titleFr}
              onChange={(event) => setTitleFr(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="asset2-card-title-ar">{copy.cardTitleAr}</FieldLabel>
            <Input
              id="asset2-card-title-ar"
              dir="rtl"
              value={titleAr}
              onChange={(event) => setTitleAr(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="asset2-card-description-fr">{copy.cardDescriptionFr}</FieldLabel>
            <Textarea
              id="asset2-card-description-fr"
              value={descriptionFr}
              onChange={(event) => setDescriptionFr(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="asset2-card-description-ar">{copy.cardDescriptionAr}</FieldLabel>
            <Textarea
              id="asset2-card-description-ar"
              dir="rtl"
              value={descriptionAr}
              onChange={(event) => setDescriptionAr(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="asset2-card-characteristics-fr">
              {copy.characteristicsFr}
            </FieldLabel>
            <Textarea
              id="asset2-card-characteristics-fr"
              value={characteristicsFr}
              onChange={(event) => setCharacteristicsFr(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="asset2-card-characteristics-ar">
              {copy.characteristicsAr}
            </FieldLabel>
            <Textarea
              id="asset2-card-characteristics-ar"
              dir="rtl"
              value={characteristicsAr}
              onChange={(event) => setCharacteristicsAr(event.target.value)}
            />
          </Field>
        </div>
        <label className="flex items-center justify-between border-y border-border/60 py-3 text-sm font-medium">
          {copy.active}
          <Switch checked={active} onCheckedChange={setActive} />
        </label>
      </div>
    </SidePanel>
  );
}

export function AssetsEditorPanel({
  state,
  copy,
  brands,
  categories,
  pending,
  onClose,
  onSubmit,
}: {
  state: EditorState;
  copy: AssetsWorkspaceCopy;
  brands: AssetMetaBrand[];
  categories: AssetMetaCategory[];
  pending: boolean;
  onClose: () => void;
  onSubmit: (
    value: AssetBannerPayload | FeaturedProductGroupPayload | ProductCardPayload,
  ) => Promise<void>;
}) {
  if (state.kind === 'banner')
    return (
      <BannerEditor
        state={state}
        copy={copy}
        pending={pending}
        onClose={onClose}
        onSubmit={onSubmit}
      />
    );
  if (state.kind === 'group')
    return (
      <GroupEditor
        state={state}
        copy={copy}
        brands={brands}
        categories={categories}
        pending={pending}
        onClose={onClose}
        onSubmit={onSubmit}
      />
    );
  return (
    <CardEditor state={state} copy={copy} pending={pending} onClose={onClose} onSubmit={onSubmit} />
  );
}

export type { EditorState as AssetsEditorState };
