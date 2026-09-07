'use client';
import * as React from 'react';
import { productCardSchema, type ProductCardPayload } from '../../../lib/assets';
import { Button } from '../../ui/button';
import { Field, FieldError, FieldLabel } from '../../ui/field';
import { Input } from '../../ui/input';
import { SidePanel } from '../../ui/side-panel';
import { Switch } from '../../ui/switch';
import { Textarea } from '../../ui/textarea';
import { validationMessage, type AssetsWorkspaceCopy, type EditorState } from './contract';
import { ProductPicker } from './inputs';

export function CardEditor({
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
