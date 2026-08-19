'use client';

import * as React from 'react';

import type { BrandRow, CategoryRow } from '../../lib/brands-categories';
import { brandFormSchema, categoryFormSchema } from '../../lib/brands-categories';
import { Button } from '../ui/button';
import { Field, FieldError, FieldLabel } from '../ui/field';
import { Input } from '../ui/input';
import { NativeSelect, NativeSelectOption } from '../ui/native-select';
import { SidePanel } from '../ui/side-panel';
import { ImageUploadField } from '../image-upload-field';

import type { TaxonomyCopy, TaxonomyView } from './taxonomy-workspace-copy';

export type TaxonomyEditorState =
  { mode: 'create'; item?: undefined } | { mode: 'edit'; item: BrandRow | CategoryRow };

export type TaxonomyEditorValue = {
  name: string;
  nameAr?: string | null;
  imageUrl: string | null;
  parentId?: number | null;
};

export function TaxonomyEditorPanel({
  view,
  state,
  copy,
  parentOptions,
  pending,
  onClose,
  onSubmit,
}: {
  view: TaxonomyView;
  state: TaxonomyEditorState;
  copy: TaxonomyCopy;
  parentOptions: Array<{ id: string; name: string }>;
  pending: boolean;
  onClose: () => void;
  onSubmit: (value: TaxonomyEditorValue) => Promise<void>;
}) {
  const item = state.item;
  const category = view === 'categories' ? (item as CategoryRow | undefined) : undefined;
  const [name, setName] = React.useState(item?.name ?? '');
  const [nameAr, setNameAr] = React.useState(category?.nameAr ?? '');
  const [parentId, setParentId] = React.useState(category?.parentId ?? '');
  const [imageUrl, setImageUrl] = React.useState(item?.image ?? '');
  const [error, setError] = React.useState('');

  const submit = async () => {
    const parsed =
      view === 'brands'
        ? brandFormSchema.safeParse({ name, imageUrl })
        : categoryFormSchema.safeParse({ name, nameAr, imageUrl, parentId });

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? copy.reviewFields);
      return;
    }

    setError('');
    await onSubmit(parsed.data);
  };

  const singular = view === 'brands' ? copy.brand : copy.category;

  return (
    <SidePanel
      open
      onOpenChange={(open) => !open && onClose()}
      title={`${state.mode === 'create' ? copy.create : copy.edit} · ${singular}`}
      description={copy.editorDescription}
      closeLabel={copy.close}
      className="sm:max-w-[38rem]"
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            {copy.cancel}
          </Button>
          <Button type="button" disabled={pending} onClick={() => void submit()}>
            {pending ? copy.saving : copy.save}
          </Button>
        </div>
      }
    >
      <form
        className="space-y-6 p-4 sm:p-6"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        {error ? <FieldError role="alert">{error}</FieldError> : null}

        <Field>
          <FieldLabel htmlFor="taxonomy2-name">{copy.name}</FieldLabel>
          <Input
            id="taxonomy2-name"
            autoComplete="off"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>

        {view === 'categories' ? (
          <>
            <Field>
              <FieldLabel htmlFor="taxonomy2-name-ar">{copy.arabicName}</FieldLabel>
              <Input
                id="taxonomy2-name-ar"
                dir="rtl"
                autoComplete="off"
                value={nameAr}
                onChange={(event) => setNameAr(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="taxonomy2-parent">{copy.parent}</FieldLabel>
              <NativeSelect
                id="taxonomy2-parent"
                value={parentId}
                onChange={(event) => setParentId(event.target.value)}
              >
                <NativeSelectOption value="">{copy.noParent}</NativeSelectOption>
                {parentOptions
                  .filter((option) => option.id !== item?.id)
                  .map((option) => (
                    <NativeSelectOption key={option.id} value={option.id}>
                      {option.name}
                    </NativeSelectOption>
                  ))}
              </NativeSelect>
            </Field>
          </>
        ) : null}

        <ImageUploadField
          uploadUrl={view === 'brands' ? '/api/uploads/brands' : '/api/uploads/categories'}
          label={copy.image}
          value={imageUrl ? [imageUrl] : []}
          onChange={(urls) => setImageUrl(urls[0] ?? '')}
        />
      </form>
    </SidePanel>
  );
}
