'use client';
import * as React from 'react';
import {
  featuredProductGroupSchema,
  type AssetMetaBrand,
  type AssetMetaCategory,
  type FeaturedProductGroupPayload,
} from '../../../lib/assets';
import { Button } from '../../ui/button';
import { Field, FieldError, FieldLabel } from '../../ui/field';
import { Input } from '../../ui/input';
import { SidePanel } from '../../ui/side-panel';
import { Switch } from '../../ui/switch';
import { validationMessage, type AssetsWorkspaceCopy, type EditorState } from './contract';
import { OptionChecklist, ProductPicker } from './inputs';

export function GroupEditor({
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
