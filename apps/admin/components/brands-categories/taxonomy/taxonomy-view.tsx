'use client';
import { Plus, Search } from 'lucide-react';
import { type TaxonomySort } from '../../../lib/brands-categories';
import { Button } from '../../ui/button';
import { Checkbox } from '../../ui/checkbox';
import { CompactMenu, CompactMenuItem } from '../../ui/compact-menu';
import { Input } from '../../ui/input';
import { NativeSelect } from '../../ui/native-select';
import { Switch } from '../../ui/switch';
import {
  WorkspaceActions,
  WorkspaceFrame,
  WorkspaceHeader,
  WorkspaceHeading,
  WorkspaceNavigation,
  WorkspaceNavigationLink,
  WorkspaceToolbar,
} from '../../ui/workspace';
import { WorkspacePagination } from '../../ui/workspace-pagination';
import { TaxonomyDeleteDialog } from '../taxonomy-delete-dialog';
import { TaxonomyEditorPanel } from '../taxonomy-editor-panel';
import { TaxonomyThumbnail, isCategory, type useTaxonomyWorkspace } from './use-taxonomy';

export function TaxonomyWorkspaceView({
  viewTitle,
  data,
  pending,
  setEditor,
  t,
  singular,
  locale,
  view,
  search,
  setSearch,
  setPage,
  setSelected,
  sort,
  setSort,
  selected,
  setActive,
  setDeleteIds,
  loaded,
  loadError,
  query,
  loading,
  items,
  allVisibleSelected,
  deferredSearch,
  editor,
  parentOptions,
  submitEditor,
  deleteIds,
  remove,
}: NonNullable<ReturnType<typeof useTaxonomyWorkspace>['view']>) {
  return (
    <WorkspaceFrame className="pb-10" data-admin-workspace="taxonomy">
      <WorkspaceHeader>
        <WorkspaceHeading title={viewTitle} meta={data.pagination.totalItems} />
        <WorkspaceActions>
          <Button
            type="button"
            disabled={!data.writable || pending}
            onClick={() => setEditor({ mode: 'create' })}
          >
            <Plus className="size-4" aria-hidden="true" />
            {t.create} {singular.toLocaleLowerCase(locale)}
          </Button>
        </WorkspaceActions>
      </WorkspaceHeader>

      <WorkspaceNavigation aria-label={t.title}>
        {(
          [
            ['brands', t.brands],
            ['categories', t.categories],
          ] as const
        ).map(([value, label]) => (
          <WorkspaceNavigationLink key={value} href={`/${locale}/${value}`} active={view === value}>
            {label}
          </WorkspaceNavigationLink>
        ))}
      </WorkspaceNavigation>

      <WorkspaceToolbar
        className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 md:flex md:items-center md:gap-3"
        data-mobile-taxonomy-controls
      >
        <label className="relative col-span-2 min-w-0 md:flex-1">
          <span className="sr-only">{t.search}</span>
          <Search
            className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
              setSelected([]);
            }}
            placeholder={t.search}
            className="ps-9"
          />
        </label>
        <label className="col-span-2 flex items-center gap-2 text-sm text-muted-foreground md:col-span-1">
          <span className="shrink-0">{t.sort}</span>
          <NativeSelect
            aria-label={t.sort}
            value={sort}
            onChange={(event) => {
              setSort(event.target.value as TaxonomySort);
              setPage(1);
              setSelected([]);
            }}
            className="min-w-44"
          >
            <option value="updated">{t.recentlyModified}</option>
            <option value="name">{t.alphabetically}</option>
            <option value="products">{t.mostProducts}</option>
          </NativeSelect>
        </label>
      </WorkspaceToolbar>

      {selected.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-border/70 bg-muted/35 px-3 py-2">
          <span className="me-auto text-sm font-medium">
            {selected.length} {t.selected}
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => void setActive(selected, true)}
          >
            {t.activate}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => void setActive(selected, false)}
          >
            {t.deactivate}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            disabled={pending}
            onClick={() => setDeleteIds(selected)}
          >
            {t.delete}
          </Button>
        </div>
      ) : null}

      {!data.writable && loaded ? (
        <p className="border-b border-border/70 px-3 py-2 text-sm text-muted-foreground">
          {t.readOnly}
        </p>
      ) : null}

      {loadError ? (
        <div role="alert" className="border-b border-border/70 py-8 text-center text-destructive">
          <p>{t.loadFailed}</p>
          <p className="mt-1 text-sm">{loadError}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => void query.refetch()}
          >
            {t.loading}
          </Button>
        </div>
      ) : null}

      <div aria-busy={loading} className="relative">
        {items.length > 0 ? (
          <>
            <div className="hidden grid-cols-[2.5rem_minmax(16rem,1.4fr)_minmax(8rem,.65fr)_7rem_3rem] items-center border-b border-border/70 px-2 py-2 text-xs font-semibold uppercase tracking-[var(--type-tracking-p060)] text-muted-foreground md:grid">
              <Checkbox
                checked={allVisibleSelected}
                aria-label={t.selectAll}
                onChange={(event) =>
                  setSelected(event.target.checked ? items.map((item) => item.id) : [])
                }
              />
              <span>{t.name}</span>
              <span>{t.products}</span>
              <span>{t.active}</span>
              <span className="sr-only">{t.actions}</span>
            </div>
            <div className="divide-y divide-border/70">
              {items.map((item) => (
                <section
                  key={item.id}
                  className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 px-2 py-3 transition-colors hover:bg-muted/25 md:grid-cols-[2.5rem_minmax(16rem,1.4fr)_minmax(8rem,.65fr)_7rem_3rem]"
                >
                  <Checkbox
                    checked={selected.includes(item.id)}
                    aria-label={`${t.select} ${item.name}`}
                    onChange={(event) =>
                      setSelected((current) =>
                        event.target.checked
                          ? [...new Set([...current, item.id])]
                          : current.filter((id) => id !== item.id),
                      )
                    }
                  />
                  <button
                    type="button"
                    className="flex min-w-0 items-center gap-3 text-start focus-visible:outline-none focus-visible:ring-[length:var(--focus-ring-width)] focus-visible:ring-ring/30"
                    disabled={!data.writable}
                    onClick={() => setEditor({ mode: 'edit', item })}
                  >
                    <TaxonomyThumbnail item={item} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-foreground sm:text-[length:var(--type-size-body-compact)]">
                        {item.name}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        {isCategory(item)
                          ? [item.nameAr, item.parentName].filter(Boolean).join(' · ') || item.slug
                          : item.slug}
                      </span>
                    </span>
                  </button>
                  <div className="col-start-3 row-start-1 flex items-center justify-end gap-2 md:col-span-2 md:col-start-4">
                    <Switch
                      checked={item.isActive}
                      disabled={!data.writable || pending}
                      aria-label={`${item.name} · ${item.isActive ? t.active : t.inactive}`}
                      onCheckedChange={(active) => void setActive([item.id], active)}
                    />
                    <CompactMenu label={`${t.actions} · ${item.name}`}>
                      <CompactMenuItem
                        disabled={!data.writable}
                        onClick={() => setEditor({ mode: 'edit', item })}
                      >
                        {t.edit}
                      </CompactMenuItem>
                      <CompactMenuItem
                        destructive
                        disabled={!data.writable}
                        onClick={() => setDeleteIds([item.id])}
                      >
                        {t.delete}
                      </CompactMenuItem>
                    </CompactMenu>
                  </div>
                  <span className="col-start-2 row-start-2 text-xs tabular-nums text-muted-foreground md:col-start-3 md:row-start-1 md:text-sm">
                    {item.productCount.toLocaleString(locale)} {t.products}
                  </span>
                </section>
              ))}
            </div>
          </>
        ) : loaded && !loading && !loadError ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            {deferredSearch ? t.noMatches : t.empty}
          </div>
        ) : null}

        {!loaded && loading ? (
          <div className="py-16 text-center text-sm text-muted-foreground">{t.loading}</div>
        ) : null}
        {loaded && loading ? (
          <div
            className="pointer-events-none absolute inset-0 bg-background/35"
            aria-label={t.loading}
          />
        ) : null}
      </div>

      <WorkspacePagination
        currentPage={data.pagination.page}
        totalPages={data.pagination.totalPages}
        pending={loading}
        onPageChange={(nextPage) => {
          setPage(nextPage);
          setSelected([]);
        }}
        className="px-0"
      />

      {editor ? (
        <TaxonomyEditorPanel
          key={`${view}-${editor.mode}-${editor.item?.id ?? 'new'}`}
          view={view}
          state={editor}
          copy={t}
          parentOptions={parentOptions}
          pending={pending}
          onClose={() => setEditor(null)}
          onSubmit={submitEditor}
        />
      ) : null}

      <TaxonomyDeleteDialog
        open={deleteIds.length > 0}
        onOpenChange={(open) => !open && setDeleteIds([])}
        title={t.delete}
        description={deleteIds.length > 1 ? t.confirmBulkDelete : t.confirmDelete}
        pending={pending}
        onConfirm={() => void remove(deleteIds)}
      />
    </WorkspaceFrame>
  );
}
