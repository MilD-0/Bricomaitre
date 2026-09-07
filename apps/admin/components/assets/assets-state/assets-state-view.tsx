'use client';
import { Plus } from 'lucide-react';
import type {
  AssetBannerRecord,
  FeaturedProductGroupRecord,
  ProductCardRecord,
} from '../../../lib/assets';
import { Button } from '../../ui/button';
import { CompactMenu, CompactMenuItem } from '../../ui/compact-menu';
import { Switch } from '../../ui/switch';
import {
  WorkspaceActions,
  WorkspaceFrame,
  WorkspaceHeader,
  WorkspaceHeading,
  WorkspaceNavigation,
  WorkspaceNavigationLink,
} from '../../ui/workspace';
import { AssetsEditorPanel } from '../assets-editor-panel';
import { AssetPreview, type useAssetsWorkspace } from './use-assets-state';

export function AssetsWorkspaceView({
  view,
  t,
  viewTitle,
  items,
  refreshError,
  createEditor,
  routes,
  locale,
  pending,
  setPending,
  reload,
  productById,
  setActive,
  edit,
  move,
  remove,
  editor,
  taxonomy,
  setEditor,
  submit,
}: NonNullable<ReturnType<typeof useAssetsWorkspace>['view']>) {
  return (
    <WorkspaceFrame data-assets-workspace={view}>
      <WorkspaceHeader>
        <WorkspaceHeading title={t.title} meta={`${viewTitle} · ${items.length}`} />
        <WorkspaceActions>
          <Button disabled={Boolean(refreshError)} onClick={createEditor}>
            <Plus className="size-4" aria-hidden="true" />
            {t.create}
          </Button>
        </WorkspaceActions>
      </WorkspaceHeader>
      <WorkspaceNavigation aria-label={t.title}>
        {routes.map((route) => (
          <WorkspaceNavigationLink
            key={route.value}
            href={`/${locale}${route.href}`}
            active={route.value === view}
          >
            {route.label}
          </WorkspaceNavigationLink>
        ))}
      </WorkspaceNavigation>

      {refreshError ? (
        <div role="alert" className="border-b border-border/60 px-4 py-3 text-sm">
          <p>{t.refreshFailed}</p>
          <p className="mt-1 text-muted-foreground">{refreshError}</p>
          <Button
            className="mt-3"
            variant="outline"
            disabled={pending}
            onClick={async () => {
              setPending(true);
              try {
                await reload();
              } finally {
                setPending(false);
              }
            }}
          >
            {t.retry}
          </Button>
        </div>
      ) : null}
      <div className="divide-y divide-border/60 border-b border-border/60">
        {items.map((item, index) => {
          const banner = view === 'banners' ? (item as AssetBannerRecord) : null;
          const group = view === 'groups' ? (item as FeaturedProductGroupRecord) : null;
          const card = view === 'cards' ? (item as ProductCardRecord) : null;
          const product = productById.get(banner?.productId ?? card?.productId ?? 0);
          const primary =
            banner?.title ?? group?.name ?? card?.titleFr ?? product?.title ?? t.product;
          const secondary = banner
            ? (product?.title ?? t.noSelection)
            : group
              ? `${group.productIds.length} ${t.products} · ${group.brandIds.length} ${t.brands} · ${group.categoryIds.length} ${t.categories}`
              : (product?.title ?? t.noSelection);
          return (
            <div
              key={item.id}
              className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-2 py-3 sm:grid-cols-[auto_minmax(0,1fr)_7rem_8rem_auto] sm:px-3 lg:px-4"
            >
              <AssetPreview
                image={banner?.imageUrlLandscape ?? product?.imageUrl}
                kind={group ? 'group' : 'image'}
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium sm:text-base">{primary}</p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground sm:text-sm">
                  {secondary}
                </p>
                <p className="mt-1 text-xs text-muted-foreground sm:hidden">
                  #{index + 1} · {new Date(item.updatedAt).toLocaleDateString(locale)}
                </p>
              </div>
              <div className="hidden text-xs text-muted-foreground sm:block">#{index + 1}</div>
              <div className="hidden text-xs text-muted-foreground sm:block">
                {new Date(item.updatedAt).toLocaleDateString(locale)}
              </div>
              <div className="flex items-center gap-1.5">
                <Switch
                  aria-label={`${t.active} · ${primary}`}
                  checked={item.active}
                  disabled={pending || Boolean(refreshError) || item.id < 0}
                  onCheckedChange={(active) => void setActive(item, active)}
                />
                <CompactMenu label={`${t.actions} · ${primary}`}>
                  <CompactMenuItem
                    disabled={pending || Boolean(refreshError) || item.id < 0}
                    onClick={() => edit(item)}
                  >
                    {t.edit}
                  </CompactMenuItem>
                  <CompactMenuItem
                    disabled={index === 0 || pending || Boolean(refreshError)}
                    onClick={() => void move(item, -1)}
                  >
                    {t.moveUp}
                  </CompactMenuItem>
                  <CompactMenuItem
                    disabled={index === items.length - 1 || pending || Boolean(refreshError)}
                    onClick={() => void move(item, 1)}
                  >
                    {t.moveDown}
                  </CompactMenuItem>
                  <CompactMenuItem
                    destructive
                    disabled={pending || Boolean(refreshError) || item.id < 0}
                    onClick={() => void remove(item)}
                  >
                    {t.delete}
                  </CompactMenuItem>
                </CompactMenu>
              </div>
            </div>
          );
        })}
        {items.length === 0 ? (
          <p className="px-4 py-14 text-center text-sm text-muted-foreground">{t.noRecords}</p>
        ) : null}
      </div>

      {editor ? (
        <AssetsEditorPanel
          state={editor}
          copy={t}
          brands={taxonomy.brands}
          categories={taxonomy.categories}
          pending={pending}
          onClose={() => setEditor(null)}
          onSubmit={submit}
        />
      ) : null}
    </WorkspaceFrame>
  );
}
