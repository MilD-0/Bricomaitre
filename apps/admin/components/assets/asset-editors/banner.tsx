'use client';
import * as React from 'react';
import { assetBannerSchema, type AssetBannerPayload } from '../../../lib/assets';
import { ImageUploadField } from '../../image-upload-field';
import { Button } from '../../ui/button';
import { Field, FieldError, FieldLabel } from '../../ui/field';
import { Input } from '../../ui/input';
import { SidePanel } from '../../ui/side-panel';
import { Switch } from '../../ui/switch';
import { validationMessage, type AssetsWorkspaceCopy, type EditorState } from './contract';
import { ProductPicker } from './inputs';

export function BannerEditor({
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
