'use client';
import { Plus, SlidersHorizontal, X } from 'lucide-react';
import Link from 'next/link';
import { type ProductStateFilter } from '../../../lib/products';
import { cn } from '../../../lib/utils';
import { SearchField } from '../../search-field';
import { Button } from '../../ui/button';
import { Checkbox } from '../../ui/checkbox';
import { CompactMenu, CompactMenuItem } from '../../ui/compact-menu';
import { NativeSelect } from '../../ui/native-select';
import { Spinner } from '../../ui/spinner';
import {
  WorkspaceActions,
  WorkspaceFrame,
  WorkspaceHeader,
  WorkspaceHeading,
  WorkspaceToolbar,
} from '../../ui/workspace';
import { WorkspacePagination } from '../../ui/workspace-pagination';
import { ProductEditorPanel } from '../product-editor-panel';
import { MetaCatalogExportDialog } from '../product-export-presenters';
import { buildStorefrontProductHref } from '../storefront-links';
import { ProductLedger } from './product-ledger';
import {
  CompactExportStatus,
  DeleteProductsDialog,
  ProductThumbnail,
  formatMoney,
  type useProductsWorkspace,
} from './use-workspace';

export function ProductsWorkspaceView({
  t,
  pagination,
  locale,
  canExportAll,
  startExportAllMutation,
  exportInProgress,
  setEditorState,
  search,
  setSearch,
  setPage,
  mobileFiltersOpen,
  activeFilterCount,
  setMobileFiltersOpen,
  filter,
  setFilter,
  selectedBrandId,
  setSelectedBrandId,
  metaQuery,
  selectedCategoryId,
  setSelectedCategoryId,
  selectedIds,
  patchSelectedMutation,
  copySelectedProductIds,
  selectedProducts,
  openMetaCatalogExportPreview,
  setDeleteTarget,
  setSelectedIds,
  exportJobQuery,
  cancelExportAllMutation,
  productsQuery,
  visibleProducts,
  storefrontBaseUrl,
  sortRules,
  toggleSort,
  patchMutation,
  editorState,
  queryClient,
  deleteTarget,
  deleteProductsMutation,
  metaCatalogExportState,
  setMetaCatalogExportState,
  confirmMetaCatalogExport,
}: NonNullable<ReturnType<typeof useProductsWorkspace>['view']>) {
  return (
    <>
      <WorkspaceFrame data-admin-workspace="products">
        <WorkspaceHeader>
          <WorkspaceHeading
            title={t('nav.products')}
            meta={
              pagination ? (
                t('adminWorkspace.products.resultCount', { count: pagination.totalItems })
              ) : (
                <span
                  role="status"
                  className="inline-block h-4 w-20 animate-pulse rounded bg-muted"
                >
                  <span className="sr-only">{t('labels.loading')}</span>
                </span>
              )
            }
          />
          <WorkspaceActions>
            <Link
              href={`/${locale}/archive`}
              className="px-2 py-2 text-sm text-muted-foreground hover:text-foreground hover:underline"
            >
              {t('productArchive.title')}
            </Link>
            {canExportAll ? (
              <CompactMenu label={t('labels.actions')}>
                <CompactMenuItem
                  disabled={startExportAllMutation.isPending || exportInProgress}
                  onClick={() => startExportAllMutation.mutate()}
                >
                  {t(
                    exportInProgress
                      ? 'products.exportAll.runningAction'
                      : 'products.exportAll.action',
                  )}
                </CompactMenuItem>
              </CompactMenu>
            ) : null}
            <Button type="button" onClick={() => setEditorState({ mode: 'create', product: null })}>
              <Plus className="size-4" aria-hidden="true" />
              {t('actions.createProduct')}
            </Button>
          </WorkspaceActions>
        </WorkspaceHeader>
        <WorkspaceToolbar>
          <div className="flex flex-wrap items-center gap-2">
            <SearchField
              value={search}
              label={t('adminWorkspace.common.search')}
              placeholder={t('adminWorkspace.products.searchPlaceholder')}
              className="flex-1 sm:min-w-[16rem]"
              onChange={(value) => {
                setSearch(value);
                setPage(1);
              }}
            />
            <Button
              type="button"
              size="sm"
              variant={mobileFiltersOpen || activeFilterCount > 0 ? 'default' : 'outline'}
              className="sm:hidden"
              aria-expanded={mobileFiltersOpen}
              onClick={() => setMobileFiltersOpen((open) => !open)}
            >
              <SlidersHorizontal className="size-4" aria-hidden="true" />
              {t('adminWorkspace.common.filters')}
              {activeFilterCount > 0 ? ` · ${activeFilterCount}` : ''}
            </Button>
          </div>
          <div
            className={cn(
              'mt-2 gap-2 sm:grid sm:grid-cols-3 lg:max-w-3xl',
              mobileFiltersOpen ? 'grid' : 'hidden',
            )}
          >
            <NativeSelect
              value={filter}
              onChange={(event) => {
                setFilter(event.target.value as ProductStateFilter);
                setPage(1);
              }}
              aria-label={t('adminWorkspace.common.filters')}
            >
              <option value="all">{t('adminWorkspace.products.allStates')}</option>
              <option value="active">{t('adminWorkspace.products.active')}</option>
              <option value="inactive">{t('adminWorkspace.products.inactive')}</option>
              <option value="out">{t('adminWorkspace.products.outOfStock')}</option>
            </NativeSelect>
            <NativeSelect
              value={selectedBrandId ?? ''}
              aria-label={t('labels.filterByBrand')}
              onChange={(event) => {
                setSelectedBrandId(event.target.value === '' ? null : Number(event.target.value));
                setPage(1);
              }}
            >
              <option value="">{t('labels.allBrands')}</option>
              {(metaQuery.data?.brands ?? []).map((brand) => (
                <option key={brand.id} value={brand.id}>
                  {brand.name}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect
              value={selectedCategoryId ?? ''}
              aria-label={t('labels.filterByCategory')}
              onChange={(event) => {
                setSelectedCategoryId(
                  event.target.value === '' ? null : Number(event.target.value),
                );
                setPage(1);
              }}
            >
              <option value="">{t('labels.allCategories')}</option>
              {(metaQuery.data?.categories ?? []).map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </NativeSelect>
          </div>
        </WorkspaceToolbar>

        {selectedIds.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 border-b border-primary/20 bg-primary/[0.045] px-3 py-2">
            <span className="me-auto text-sm font-semibold">
              {t('adminWorkspace.common.selected', { count: selectedIds.length })}
            </span>
            <CompactMenu label={t('labels.actions')}>
              <CompactMenuItem
                disabled={patchSelectedMutation.isPending}
                onClick={() => patchSelectedMutation.mutate({ active: true })}
              >
                {t('actions.activateSelected')}
              </CompactMenuItem>
              <CompactMenuItem
                disabled={patchSelectedMutation.isPending}
                onClick={() => patchSelectedMutation.mutate({ active: false })}
              >
                {t('actions.deactivateSelected')}
              </CompactMenuItem>
              <CompactMenuItem
                disabled={patchSelectedMutation.isPending}
                onClick={() => patchSelectedMutation.mutate({ inStock: true })}
              >
                {t('actions.markInStock')}
              </CompactMenuItem>
              <CompactMenuItem
                disabled={patchSelectedMutation.isPending}
                onClick={() => patchSelectedMutation.mutate({ inStock: false })}
              >
                {t('actions.markOutOfStock')}
              </CompactMenuItem>
              <div className="my-1 border-t border-border/60" />
              <CompactMenuItem onClick={() => void copySelectedProductIds()}>
                {t('products.copy.action')}
              </CompactMenuItem>
              <CompactMenuItem
                disabled={selectedProducts.length === 0}
                onClick={openMetaCatalogExportPreview}
              >
                {t('products.export.action')}
              </CompactMenuItem>
              <div className="my-1 border-t border-border/60" />
              <CompactMenuItem
                destructive
                onClick={() =>
                  setDeleteTarget({
                    ids: [...selectedIds],
                    label: t('labels.bulkSelectionCount', { count: selectedIds.length }),
                  })
                }
              >
                {t('adminWorkspace.products.archiveSelected')}
              </CompactMenuItem>
            </CompactMenu>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="size-9 px-0"
              aria-label={t('actions.cancel')}
              onClick={() => setSelectedIds([])}
            >
              <X className="size-4" aria-hidden="true" />
            </Button>
          </div>
        ) : null}

        {canExportAll && exportJobQuery.data.job ? (
          <CompactExportStatus
            job={exportJobQuery.data.job}
            pendingCancel={cancelExportAllMutation.isPending}
            onCancel={() => cancelExportAllMutation.mutate()}
            onDownload={() => {
              const path = exportJobQuery.data.job?.downloadPath;
              if (path) window.open(path, '_self');
            }}
          />
        ) : null}

        {productsQuery.isError ? (
          <p className="border-b border-destructive/30 bg-destructive/5 px-3 py-3 text-sm text-destructive">
            {productsQuery.error.message}
          </p>
        ) : null}

        <div className="divide-y divide-border/55 lg:hidden">
          {visibleProducts.map((product) => (
            <div
              key={product.id}
              className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-3 py-3.5"
            >
              <Checkbox
                aria-label={t('labels.selectRow', { name: product.title })}
                checked={selectedIds.includes(product.id)}
                onChange={(event) =>
                  setSelectedIds((current) =>
                    event.target.checked
                      ? [...new Set([...current, product.id])]
                      : current.filter((id) => id !== product.id),
                  )
                }
              />
              <div className="flex min-w-0 items-center gap-3 text-start">
                <ProductThumbnail product={product} />
                <span className="min-w-0">
                  <a
                    href={buildStorefrontProductHref(product, storefrontBaseUrl)}
                    target="_blank"
                    rel="noreferrer"
                    className="block truncate text-sm font-semibold underline-offset-4 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-[length:var(--focus-ring-width)] focus-visible:ring-ring/30"
                  >
                    {product.title}
                  </a>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    {product.sku || t('adminWorkspace.products.noSku')} ·{' '}
                    {formatMoney(locale, product.price)}
                  </span>
                  <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    <span className={product.active ? 'text-emerald-700' : 'text-muted-foreground'}>
                      {product.active ? t('labels.active') : t('labels.inactive')}
                    </span>
                    <span className={product.inStock ? 'text-foreground' : 'text-amber-700'}>
                      {product.inStock
                        ? t('labels.inStock')
                        : t('adminWorkspace.products.outOfStock')}
                    </span>
                  </span>
                </span>
              </div>
              <CompactMenu label={`${t('labels.actions')} · ${product.title}`}>
                <CompactMenuItem onClick={() => setEditorState({ mode: 'edit', product })}>
                  {t('actions.edit')}
                </CompactMenuItem>
                <CompactMenuItem
                  destructive
                  onClick={() => setDeleteTarget({ ids: [product.id], label: product.title })}
                >
                  {t('adminWorkspace.products.archive')}
                </CompactMenuItem>
              </CompactMenu>
            </div>
          ))}
        </div>

        <div
          className="hidden overflow-x-auto outline-none focus-visible:ring-[length:var(--focus-ring-width)] focus-visible:ring-inset focus-visible:ring-ring/30 lg:block"
          role="region"
          aria-label={t('nav.products')}
          tabIndex={0}
        >
          <ProductLedger
            t={t}
            visibleProducts={visibleProducts}
            selectedIds={selectedIds}
            setSelectedIds={setSelectedIds}
            sortRules={sortRules}
            toggleSort={toggleSort}
            storefrontBaseUrl={storefrontBaseUrl}
            locale={locale}
            patchMutation={patchMutation}
            setEditorState={setEditorState}
            setDeleteTarget={setDeleteTarget}
          />
        </div>

        {productsQuery.isFetching ? (
          <div className="flex items-center justify-center gap-2 border-t border-border/50 px-4 py-4 text-sm text-muted-foreground">
            <Spinner className="size-4" />
            {t('labels.loading')}
          </div>
        ) : visibleProducts.length === 0 ? (
          <div className="grid min-h-56 place-items-center border-t border-border/50 text-sm text-muted-foreground">
            {t('adminWorkspace.common.noResults')}
          </div>
        ) : null}

        {pagination ? (
          <WorkspacePagination
            currentPage={pagination.page}
            totalPages={pagination.totalPages}
            pending={productsQuery.isFetching}
            onPageChange={setPage}
          />
        ) : null}
      </WorkspaceFrame>

      <ProductEditorPanel
        key={editorState ? (editorState.product?.id ?? 'create') : 'closed'}
        state={editorState}
        meta={metaQuery.data ?? { brands: [], categories: [] }}
        onClose={() => setEditorState(null)}
        onChanged={async () => {
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: ['products-workspace'] }),
            queryClient.invalidateQueries({ queryKey: ['products-workspace-editor'] }),
          ]);
        }}
      />
      <DeleteProductsDialog
        target={deleteTarget?.label ?? ''}
        open={deleteTarget !== null}
        pending={deleteProductsMutation.isPending}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteProductsMutation.mutate(deleteTarget)}
      />
      <MetaCatalogExportDialog
        state={metaCatalogExportState}
        onOpenChange={(open) => {
          if (!open) setMetaCatalogExportState(null);
        }}
        onConfirm={confirmMetaCatalogExport}
      />
    </>
  );
}
