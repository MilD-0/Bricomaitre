'use client';
import {
  type AssetBannerPayload,
  type AssetMetaBrand,
  type AssetMetaCategory,
  type FeaturedProductGroupPayload,
  type ProductCardPayload,
} from '../../../lib/assets';
import { BannerEditor } from './banner';
import { CardEditor } from './card';
import { type AssetsWorkspaceCopy, type EditorState } from './contract';
import { GroupEditor } from './group';

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
