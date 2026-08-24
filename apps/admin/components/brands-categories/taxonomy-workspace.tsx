'use client';

/* eslint-disable @next/next/no-img-element -- Taxonomy thumbnails use admin-configured CDN origins. */

import { ImageIcon, Plus, Search } from 'lucide-react';
import { useLocale } from 'next-intl';
import * as React from 'react';

import { requestJson } from '../../lib/admin-api';
import { taxonomyAiSurfaceDetails } from '../../lib/admin-ai-live-surface-details';
import {
  type BrandRow,
  type BrandsListResponse,
  type CategoriesListResponse,
  type CategoryRow,
  brandsListResponseSchema,
  categoriesListResponseSchema,
} from '../../lib/brands-categories';
import { toast } from '../../lib/toast';
import { AdminAiAskButton } from '../admin-ai-ask-button';
import { Button } from '../ui/button';
import { useAdminAiSurfaceDetails } from '../admin-ai-surface-context';
import { Checkbox } from '../ui/checkbox';
import { CompactMenu, CompactMenuItem } from '../ui/compact-menu';
import { Input } from '../ui/input';
import { NativeSelect, NativeSelectOption } from '../ui/native-select';
import { Switch } from '../ui/switch';
import {
  WorkspaceActions,
  WorkspaceFrame,
  WorkspaceHeader,
  WorkspaceHeading,
  WorkspaceNavigation,
  WorkspaceNavigationLink,
  WorkspaceToolbar,
} from '../ui/workspace';
import { WorkspacePagination } from '../ui/workspace-pagination';

import { DeleteDialog } from './manager-shared';
import {
  TaxonomyEditorPanel,
  type TaxonomyEditorState,
  type TaxonomyEditorValue,
} from './taxonomy-editor-panel';
import { getTaxonomyCopy, type TaxonomyView } from './taxonomy-workspace-copy';

type TaxonomyRow = BrandRow | CategoryRow;
type TaxonomyResponse = BrandsListResponse | CategoriesListResponse;
type SortMode = 'updated' | 'name' | 'products';

function emptyResponse(view: TaxonomyView): TaxonomyResponse {
  const pagination = {
    page: 1,
    limit: 50,
    totalItems: 0,
    totalPages: 1,
    hasNextPage: false,
    hasPreviousPage: false,
  };
  return view === 'brands'
    ? { writable: false, items: [], pagination }
    : { writable: false, items: [], parentOptions: [], pagination };
}

function sortRows(items: TaxonomyRow[], mode: SortMode) {
  return [...items].sort((left, right) => {
    if (mode === 'name') return left.name.localeCompare(right.name);
    if (mode === 'products') return right.productCount - left.productCount;
    return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
  });
}

function isCategory(row: TaxonomyRow): row is CategoryRow {
  return 'parentId' in row;
}

function TaxonomyThumbnail({ item }: { item: TaxonomyRow }) {
  if (item.image) {
    return <img src={item.image} alt="" className="size-11 rounded-lg object-cover sm:size-12" />;
  }

  return (
    <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground sm:size-12">
      <ImageIcon className="size-4" aria-hidden="true" />
    </span>
  );
}

export function TaxonomyWorkspace({ view }: { view: TaxonomyView }) {
  const localeValue = useLocale();
  const locale = localeValue === 'ar' || localeValue === 'fr' ? localeValue : 'en';
  const t = getTaxonomyCopy(locale);
  const [data, setData] = React.useState<TaxonomyResponse>(() => emptyResponse(view));
  const [loaded, setLoaded] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [loadError, setLoadError] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState('');
  const deferredSearch = React.useDeferredValue(search.trim());
  const [sort, setSort] = React.useState<SortMode>('updated');
  const [selected, setSelected] = React.useState<string[]>([]);
  const [editor, setEditor] = React.useState<TaxonomyEditorState | null>(null);
  const [deleteIds, setDeleteIds] = React.useState<string[]>([]);
  const [pending, setPending] = React.useState(false);

  const endpoint = view === 'brands' ? '/api/brands' : '/api/categories';
  const responseSchema =
    view === 'brands' ? brandsListResponseSchema : categoriesListResponseSchema;

  const load = React.useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setLoadError('');
      const query = new URLSearchParams({
        page: String(page),
        limit: '50',
        search: deferredSearch,
      });
      if (view === 'categories') query.set('includeParentOptions', '1');

      try {
        const response = await requestJson<unknown>(`${endpoint}?${query}`, { signal });
        setData(responseSchema.parse(response));
        setLoaded(true);
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setLoadError(error instanceof Error ? error.message : t.loadFailed);
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [deferredSearch, endpoint, page, responseSchema, t.loadFailed, view],
  );

  React.useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => void load(controller.signal), 0);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [load]);

  const items = sortRows(data.items as TaxonomyRow[], sort);
  const allVisibleSelected = items.length > 0 && items.every((item) => selected.includes(item.id));
  const parentOptions = 'parentOptions' in data ? data.parentOptions : [];
  const viewTitle = view === 'brands' ? t.brands : t.categories;
  const singular = view === 'brands' ? t.brand : t.category;
  const focusedTaxonomyId = editor?.mode === 'edit' ? Number(editor.item.id) : null;
  useAdminAiSurfaceDetails(
    taxonomyAiSurfaceDetails({
      view,
      page,
      search: deferredSearch,
      sort,
      visibleCount: items.length,
      totalItems: data.pagination.totalItems,
      selectedIds: selected.map(Number),
      focusedId: focusedTaxonomyId,
      loading,
    }),
  );

  const perform = async ({
    optimistic,
    operation,
    success,
    closeEditor = false,
  }: {
    optimistic: TaxonomyResponse;
    operation: () => Promise<unknown>;
    success: string;
    closeEditor?: boolean;
  }) => {
    const snapshot = data;
    setData(optimistic);
    setPending(true);
    try {
      await operation();
      await load();
      if (closeEditor) setEditor(null);
      toast.success(success);
      return true;
    } catch (error) {
      setData(snapshot);
      toast.error(error instanceof Error ? error.message : t.saveFailed);
      return false;
    } finally {
      setPending(false);
    }
  };

  const patchItems = (update: (item: TaxonomyRow) => TaxonomyRow | null) => ({
    ...data,
    items: (data.items as TaxonomyRow[])
      .map(update)
      .filter((item): item is TaxonomyRow => item !== null),
  });

  const submitEditor = async (value: TaxonomyEditorValue) => {
    if (!editor) return;
    const now = new Date().toISOString();
    const body =
      view === 'brands'
        ? { name: value.name, imageUrl: value.imageUrl }
        : {
            name: value.name,
            nameAr: value.nameAr ?? null,
            imageUrl: value.imageUrl,
            parentId: value.parentId ?? null,
          };

    if (editor.mode === 'create') {
      const optimistic: TaxonomyRow =
        view === 'brands'
          ? {
              id: `temp-${now}`,
              name: value.name,
              slug: value.name.toLocaleLowerCase().replace(/\s+/g, '-'),
              image: value.imageUrl,
              isActive: true,
              status: 'active',
              productCount: 0,
              createdAt: now,
              updatedAt: now,
            }
          : {
              id: `temp-${now}`,
              name: value.name,
              slug: value.name.toLocaleLowerCase().replace(/\s+/g, '-'),
              nameAr: value.nameAr ?? null,
              image: value.imageUrl,
              isActive: true,
              status: 'active',
              parentId: value.parentId ? String(value.parentId) : null,
              parentName:
                parentOptions.find((option) => option.id === String(value.parentId))?.name ?? null,
              productCount: 0,
              createdAt: now,
              updatedAt: now,
            };
      await perform({
        optimistic: { ...data, items: [optimistic, ...(data.items as TaxonomyRow[])] },
        operation: () => requestJson(endpoint, { method: 'POST', body: JSON.stringify(body) }),
        success: t.saved,
        closeEditor: true,
      });
      return;
    }

    const editingId = editor.item.id;
    await perform({
      optimistic: patchItems((item) =>
        item.id === editingId
          ? {
              ...item,
              ...body,
              image: body.imageUrl,
              ...(isCategory(item)
                ? {
                    nameAr: 'nameAr' in body ? body.nameAr : item.nameAr,
                    parentId: 'parentId' in body && body.parentId ? String(body.parentId) : null,
                    parentName:
                      'parentId' in body
                        ? (parentOptions.find((option) => option.id === String(body.parentId))
                            ?.name ?? null)
                        : item.parentName,
                  }
                : {}),
              updatedAt: now,
            }
          : item,
      ),
      operation: () =>
        requestJson(`${endpoint}/${editingId}`, { method: 'PATCH', body: JSON.stringify(body) }),
      success: t.saved,
      closeEditor: true,
    });
  };

  const setActive = async (ids: string[], active: boolean) => {
    const targetIds = new Set(ids);
    const succeeded = await perform({
      optimistic: patchItems((item) =>
        targetIds.has(item.id)
          ? { ...item, isActive: active, status: active ? 'active' : 'draft' }
          : item,
      ),
      operation: () =>
        Promise.all(
          ids.map((id) =>
            requestJson(`${endpoint}/${id}`, {
              method: 'PATCH',
              body: JSON.stringify({ status: active ? 'active' : 'draft' }),
            }),
          ),
        ),
      success: ids.length === 1 ? t.saved : t.bulkSaved,
    });
    if (succeeded && ids.length > 1) setSelected([]);
  };

  const remove = async (ids: string[]) => {
    const targetIds = new Set(ids);
    const succeeded = await perform({
      optimistic: patchItems((item) => (targetIds.has(item.id) ? null : item)),
      operation: () =>
        Promise.all(ids.map((id) => requestJson(`${endpoint}/${id}`, { method: 'DELETE' }))),
      success: t.deleted,
    });
    if (succeeded) {
      setSelected([]);
      setDeleteIds([]);
    }
  };

  return (
    <WorkspaceFrame className="pb-10" data-admin-workspace="taxonomy">
      <WorkspaceHeader>
        <WorkspaceHeading title={viewTitle} meta={data.pagination.totalItems} />
        <WorkspaceActions>
          <AdminAiAskButton />
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
            onChange={(event) => setSort(event.target.value as SortMode)}
            className="min-w-44"
          >
            <NativeSelectOption value="updated">{t.recentlyModified}</NativeSelectOption>
            <NativeSelectOption value="name">{t.alphabetically}</NativeSelectOption>
            <NativeSelectOption value="products">{t.mostProducts}</NativeSelectOption>
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
            onClick={() => void load()}
          >
            {t.loading}
          </Button>
        </div>
      ) : null}

      <div aria-busy={loading} className="relative">
        {items.length > 0 ? (
          <>
            <div className="hidden grid-cols-[2.5rem_minmax(16rem,1.4fr)_minmax(8rem,.65fr)_7rem_3rem] items-center border-b border-border/70 px-2 py-2 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground md:grid">
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
                    className="flex min-w-0 items-center gap-3 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                    disabled={!data.writable}
                    onClick={() => setEditor({ mode: 'edit', item })}
                  >
                    <TaxonomyThumbnail item={item} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-foreground sm:text-[0.95rem]">
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

      <DeleteDialog
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
