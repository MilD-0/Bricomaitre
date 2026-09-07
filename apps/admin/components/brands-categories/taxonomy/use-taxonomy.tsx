'use client';

/* eslint-disable @next/next/no-img-element -- Taxonomy thumbnails use admin-configured CDN origins. */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ImageIcon } from 'lucide-react';
import { useLocale } from 'next-intl';
import * as React from 'react';

import { taxonomyAiSurfaceDetails } from '../../../lib/admin-ai-live-surface-details';
import { requestJson } from '../../../lib/admin-api';
import {
  brandsListResponseSchema,
  categoriesListResponseSchema,
  type BrandRow,
  type BrandsListResponse,
  type CategoriesListResponse,
  type CategoryRow,
  type TaxonomySort,
} from '../../../lib/brands-categories';
import { toast } from '../../../lib/toast';
import { useAdminAiSurfaceDetails } from '../../admin-ai-surface-context';

import { type TaxonomyEditorState, type TaxonomyEditorValue } from '../taxonomy-editor-panel';
import { getTaxonomyCopy, type TaxonomyView } from '../taxonomy-workspace-copy';

type TaxonomyRow = BrandRow | CategoryRow;
type TaxonomyResponse = BrandsListResponse | CategoriesListResponse;

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

export function isCategory(row: TaxonomyRow): row is CategoryRow {
  return 'parentId' in row;
}

export function TaxonomyThumbnail({ item }: { item: TaxonomyRow }) {
  if (item.image) {
    return <img src={item.image} alt="" className="size-11 rounded-lg object-cover sm:size-12" />;
  }

  return (
    <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground sm:size-12">
      <ImageIcon className="size-4" aria-hidden="true" />
    </span>
  );
}

export function useTaxonomyWorkspace({ view }: { view: TaxonomyView }) {
  const queryClient = useQueryClient();
  const localeValue = useLocale();
  const locale = localeValue === 'ar' || localeValue === 'fr' ? localeValue : 'en';
  const t = getTaxonomyCopy(locale);
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState('');
  const deferredSearch = React.useDeferredValue(search.trim());
  const [sort, setSort] = React.useState<TaxonomySort>('updated');
  const [selected, setSelected] = React.useState<string[]>([]);
  const [editor, setEditor] = React.useState<TaxonomyEditorState | null>(null);
  const [deleteIds, setDeleteIds] = React.useState<string[]>([]);
  const [pending, setPending] = React.useState(false);

  const endpoint = view === 'brands' ? '/api/brands' : '/api/categories';
  const responseSchema =
    view === 'brands' ? brandsListResponseSchema : categoriesListResponseSchema;

  const queryKey = ['taxonomy-workspace', view, page, deferredSearch, sort] as const;
  const query = useQuery({
    queryKey,
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({
        page: String(page),
        limit: '50',
        search: deferredSearch,
        sort,
      });
      if (view === 'categories') params.set('includeParentOptions', '1');
      const response = await requestJson<unknown>(`${endpoint}?${params}`, { signal });
      return responseSchema.parse(response);
    },
  });
  const data = query.data ?? emptyResponse(view);
  const loaded = query.data !== undefined;
  const loading = query.isFetching;
  const loadError = query.error
    ? query.error instanceof Error
      ? query.error.message
      : t.loadFailed
    : '';

  const items = data.items;
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
    setPending(true);
    await queryClient.cancelQueries({ queryKey, exact: true });
    const snapshot = queryClient.getQueryData<TaxonomyResponse>(queryKey);
    queryClient.setQueryData(queryKey, optimistic);
    try {
      await operation();
      await queryClient.invalidateQueries({ queryKey: ['products-meta-workspace'] });
      await queryClient.invalidateQueries({ queryKey: ['taxonomy-workspace', view] });
      if (closeEditor) setEditor((current) => (current === editor ? null : current));
      toast.success(success);
      return true;
    } catch (error) {
      queryClient.setQueryData(queryKey, snapshot);
      await queryClient.invalidateQueries({ queryKey: ['products-meta-workspace'] });
      await queryClient.invalidateQueries({ queryKey: ['taxonomy-workspace', view] });
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

  const mutateSelected = async (ids: string[], method: 'PATCH' | 'DELETE', body?: string) => {
    const results = await Promise.allSettled(
      ids.map((id) => requestJson(`${endpoint}/${id}`, { method, body })),
    );
    const succeeded = new Set(ids.filter((_, index) => results[index].status === 'fulfilled'));
    setSelected((current) => current.filter((id) => !succeeded.has(id)));
    setDeleteIds((current) => current.filter((id) => !succeeded.has(id)));
    const failure = results.find((result) => result.status === 'rejected');
    if (failure?.status === 'rejected') throw failure.reason;
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
        mutateSelected(ids, 'PATCH', JSON.stringify({ status: active ? 'active' : 'draft' })),
      success: ids.length === 1 ? t.saved : t.bulkSaved,
    });
    if (succeeded && ids.length > 1) setSelected([]);
  };

  const remove = async (ids: string[]) => {
    const targetIds = new Set(ids);
    const succeeded = await perform({
      optimistic: patchItems((item) => (targetIds.has(item.id) ? null : item)),
      operation: () => mutateSelected(ids, 'DELETE'),
      success: t.deleted,
    });
    if (succeeded) {
      setSelected([]);
      setDeleteIds([]);
    }
  };

  return {
    view: {
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
    } as const,
    fallback: null,
  };
}
