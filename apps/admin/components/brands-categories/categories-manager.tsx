'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useDeferredValue, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useForm, useWatch } from 'react-hook-form';

import { requestJson as request } from '../../lib/admin-api';
import {
  categoriesListResponseSchema,
  categoryFormSchema,
  type CategoriesListResponse,
  type CategoryFormInput,
  type CategoryFormValues,
  type CategoryRow,
  type CategoryUpdateValues,
} from '../../lib/brands-categories';
import {
  readClientStorage as readStorage,
  writeClientStorage as writeStorage,
} from '../../lib/client-storage';
import {
  applyClientMultiSort,
  getEffectiveSortRules,
  getSortRuleState,
  toggleSortRule,
  type SortRule,
} from '../../lib/multi-sort';
import { captureQueries, restoreQueries } from '../../lib/query-cache';
import { slugify } from '../../lib/slug';
import { toast } from '../../lib/toast';
import { ImageUploadField } from '../image-upload-field';
import { MultiSortHeader } from '../multi-sort-header';
import { SearchField } from '../search-field';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Field, FieldError, FieldLabel } from '../ui/field';
import { Input } from '../ui/input';
import { PendingInline, sectionTransitionProps, SurfacePendingOverlay } from '../ui/motion';
import { NativeSelect, NativeSelectOption } from '../ui/native-select';
import { Switch } from '../ui/switch';
import { TablePaginationControls } from '../table-pagination-controls';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import {
  actorLabel,
  buildMessages,
  DeleteDialog,
  firstFormErrorMessage,
  mutationErrorMessage,
  timestampLabel,
  type MutationContext,
  type MutationMessages,
} from './manager-shared';

const CATEGORY_DIALOG_STORAGE_KEY = 'categories-dialog-state-v1';

const categoryFormDefaults: CategoryFormInput = {
  name: '',
  nameAr: '',
  imageUrl: '',
  parentId: null,
};

type CategorySortKey = 'status' | 'name' | 'parentName' | 'createdAt' | 'updatedAt';
type CategorySortRule = SortRule<CategorySortKey>;
type CategoryDialogState = { open: boolean; mode: 'create' | 'edit'; editingId: string | null };
type CategoryUpdateMutationVariables = {
  id: string;
  values: CategoryUpdateValues;
  messages: MutationMessages;
};
type CategoryCreateMutationVariables = { values: CategoryFormValues; messages: MutationMessages };
type CategoryBulkStatusMutationVariables = {
  ids: string[];
  status: 'active' | 'draft';
  messages: MutationMessages;
};
type CategoryDeleteMutationVariables = { ids: string[]; messages: MutationMessages };

function updateCategoryLists(
  queryClient: ReturnType<typeof useQueryClient>,
  updater: (category: CategoryRow) => CategoryRow | null,
) {
  queryClient.setQueriesData<CategoriesListResponse>(
    { queryKey: ['categories-table'] },
    (current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        items: current.items.map(updater).filter((item): item is CategoryRow => item !== null),
      };
    },
  );
}

function CategoryDialogForm({
  open,
  mode,
  form,
  pending,
  parentOptions,
  editingId,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  mode: 'create' | 'edit';
  form: ReturnType<typeof useForm<CategoryFormInput>>;
  pending: boolean;
  parentOptions: Array<{ id: string; name: string }>;
  editingId: string | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: () => void;
}) {
  const t = useTranslations();
  const imageValue = useWatch({ control: form.control, name: 'imageUrl' }) ?? '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {mode === 'create' ? t('labels.createCategoryTitle') : t('labels.editCategoryTitle')}
          </DialogTitle>
          <DialogDescription>{t('labels.categoryDialogDescription')}</DialogDescription>
        </DialogHeader>

        <form
          className="mt-5 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void onSubmit();
          }}
        >
          <Field>
            <FieldLabel htmlFor="category-name">{t('labels.name')}</FieldLabel>
            <Input
              id="category-name"
              placeholder={t('labels.categoryNamePlaceholder')}
              {...form.register('name')}
            />
            {form.formState.errors.name ? (
              <FieldError>{form.formState.errors.name.message}</FieldError>
            ) : null}
          </Field>

          <Field>
            <FieldLabel htmlFor="category-name-ar">{t('labels.nameAr')}</FieldLabel>
            <Input
              id="category-name-ar"
              placeholder={t('labels.categoryNameArPlaceholder')}
              {...form.register('nameAr')}
            />
            {form.formState.errors.nameAr ? (
              <FieldError>{form.formState.errors.nameAr.message}</FieldError>
            ) : null}
          </Field>

          <Field>
            <FieldLabel htmlFor="category-parent">{t('labels.parentCategory')}</FieldLabel>
            <NativeSelect
              id="category-parent"
              aria-label={t('labels.parentCategory')}
              {...form.register('parentId', {
                setValueAs: (value) => (value === '' ? null : Number(value)),
              })}
            >
              <NativeSelectOption value="">{t('labels.noParentCategory')}</NativeSelectOption>
              {parentOptions
                .filter((option) => option.id !== editingId)
                .map((option) => (
                  <NativeSelectOption key={option.id} value={option.id}>
                    {option.name}
                  </NativeSelectOption>
                ))}
            </NativeSelect>
            {form.formState.errors.parentId ? (
              <FieldError>{form.formState.errors.parentId.message}</FieldError>
            ) : null}
          </Field>

          <ImageUploadField
            uploadUrl="/api/uploads/categories"
            label={t('labels.image')}
            value={imageValue ? [imageValue] : []}
            onChange={(urls) =>
              form.setValue('imageUrl', urls[0] ?? '', { shouldDirty: true, shouldValidate: true })
            }
          />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('actions.cancel')}
            </Button>
            <Button type="submit" disabled={pending}>
              {mode === 'create' ? t('actions.createCategory') : t('actions.saveCategory')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CategoriesManager() {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search.trim());
  const [sortRules, setSortRules] = useState<CategorySortRule[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deleteState, setDeleteState] = useState<{ ids: string[]; label: string } | null>(null);
  const [dialogState, setDialogState] = useState<CategoryDialogState>({
    open: false,
    mode: 'create',
    editingId: null,
  });
  const [isFilterPending, startFilterTransition] = useTransition();
  const hydratedRef = useRef(false);

  const form = useForm<CategoryFormInput>({
    resolver: zodResolver(categoryFormSchema),
    defaultValues: categoryFormDefaults,
  });
  const draftValues = useWatch({ control: form.control });

  const query = useQuery({
    queryKey: ['categories-table', page, deferredSearch, dialogState.open ? 'form' : 'view'],
    queryFn: async () =>
      categoriesListResponseSchema.parse(
        await request(
          `/api/categories?page=${page}&limit=50&search=${encodeURIComponent(deferredSearch)}${dialogState.open ? '&includeParentOptions=1' : ''}`,
        ),
      ),
    initialData: {
      writable: false,
      items: [],
      parentOptions: [],
      pagination: {
        page: 1,
        limit: 50,
        totalItems: 0,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    },
    initialDataUpdatedAt: 0,
    placeholderData: keepPreviousData,
    staleTime: dialogState.open ? 0 : 30_000,
  });

  useEffect(() => {
    const stored = readStorage<{ dialogState: CategoryDialogState; values: CategoryFormInput }>(
      CATEGORY_DIALOG_STORAGE_KEY,
    );
    if (stored) {
      queueMicrotask(() => setDialogState(stored.dialogState));
      form.reset(stored.values);
    }
    hydratedRef.current = true;
  }, [form]);

  useEffect(() => {
    if (!hydratedRef.current) {
      return;
    }

    if (!dialogState.open) {
      writeStorage(CATEGORY_DIALOG_STORAGE_KEY, null);
      return;
    }

    writeStorage(CATEGORY_DIALOG_STORAGE_KEY, {
      dialogState,
      values: {
        name: draftValues.name ?? '',
        nameAr: draftValues.nameAr ?? '',
        imageUrl: draftValues.imageUrl ?? '',
        parentId: draftValues.parentId ?? null,
      },
    });
  }, [
    dialogState,
    draftValues.imageUrl,
    draftValues.name,
    draftValues.nameAr,
    draftValues.parentId,
  ]);

  const openCreate = () => {
    form.reset(categoryFormDefaults);
    startFilterTransition(() => {
      setDialogState({ open: true, mode: 'create', editingId: null });
    });
  };

  const closeDialog = () => {
    setDialogState({ open: false, mode: 'create', editingId: null });
    form.reset(categoryFormDefaults);
    writeStorage(CATEGORY_DIALOG_STORAGE_KEY, null);
  };

  const updateMutation = useMutation<
    unknown,
    Error,
    CategoryUpdateMutationVariables,
    MutationContext<CategoriesListResponse>
  >({
    mutationFn: ({ id, values }) =>
      request(`/api/categories/${id}`, { method: 'PATCH', body: JSON.stringify(values) }),
    onMutate: async ({ id, values, messages }) => {
      await queryClient.cancelQueries({ queryKey: ['categories-table'] });
      const snapshot = captureQueries<CategoriesListResponse>(queryClient, ['categories-table']);
      const toastId = toast.loading(messages.loading);

      updateCategoryLists(queryClient, (category) => {
        if (category.id !== id) {
          return category;
        }

        const parentOption =
          values.parentId === undefined || values.parentId === null
            ? null
            : (query.data.parentOptions.find((option) => option.id === String(values.parentId)) ??
              null);

        return {
          ...category,
          name: values.name ?? category.name,
          nameAr: values.nameAr === undefined ? category.nameAr : values.nameAr,
          image: values.imageUrl === undefined ? category.image : values.imageUrl,
          parentId:
            values.parentId === undefined
              ? category.parentId
              : values.parentId === null
                ? null
                : String(values.parentId),
          parentName:
            values.parentId === undefined ? category.parentName : (parentOption?.name ?? null),
          isActive: values.status === undefined ? category.isActive : values.status === 'active',
          status: values.status ?? category.status,
          updatedAt: new Date().toISOString(),
          updatedByName: t('history.systemActor'),
        };
      });

      return { messages, snapshot, toastId };
    },
    onError: (error, _variables, context) => {
      if (!context) return;
      restoreQueries(queryClient, context.snapshot);
      toast.error(mutationErrorMessage(context.messages.error, error), { id: context.toastId });
    },
    onSuccess: (_data, _variables, context) => {
      if (!context) return;
      toast.success(context.messages.success, { id: context.toastId });
      closeDialog();
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ['categories-table'] });
    },
  });

  const createMutation = useMutation<
    unknown,
    Error,
    CategoryCreateMutationVariables,
    MutationContext<CategoriesListResponse>
  >({
    mutationFn: ({ values }) =>
      request('/api/categories', { method: 'POST', body: JSON.stringify(values) }),
    onMutate: async ({ values, messages }) => {
      await queryClient.cancelQueries({ queryKey: ['categories-table'] });
      const snapshot = captureQueries<CategoriesListResponse>(queryClient, ['categories-table']);
      const toastId = toast.loading(messages.loading);
      const now = new Date().toISOString();
      const parentOption =
        values.parentId === null || values.parentId === undefined
          ? null
          : (query.data.parentOptions.find((option) => option.id === String(values.parentId)) ??
            null);
      const optimisticRow: CategoryRow = {
        id: `temp-category-${now}`,
        name: values.name,
        slug: slugify(values.name),
        nameAr: values.nameAr,
        image: values.imageUrl,
        isActive: true,
        status: 'active',
        parentId: values.parentId ? String(values.parentId) : null,
        parentName: parentOption?.name ?? null,
        createdAt: now,
        updatedAt: now,
        createdBy: null,
        createdByName: t('history.systemActor'),
        updatedBy: null,
        updatedByName: t('history.systemActor'),
      };

      queryClient.setQueryData<CategoriesListResponse>(
        ['categories-table', page, deferredSearch, dialogState.open ? 'form' : 'view'],
        (current) => {
          if (!current) {
            return current;
          }

          const matchesCurrentSearch =
            deferredSearch.length === 0 ||
            optimisticRow.name.toLowerCase().includes(deferredSearch.toLowerCase());
          if (page !== 1 || !matchesCurrentSearch) {
            return current;
          }

          return {
            ...current,
            items: [optimisticRow, ...current.items].slice(0, current.pagination.limit),
          };
        },
      );

      return { messages, snapshot, toastId };
    },
    onError: (error, _variables, context) => {
      if (!context) return;
      restoreQueries(queryClient, context.snapshot);
      toast.error(mutationErrorMessage(context.messages.error, error), { id: context.toastId });
    },
    onSuccess: (_data, _variables, context) => {
      if (!context) return;
      toast.success(context.messages.success, { id: context.toastId });
      closeDialog();
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ['categories-table'] });
    },
  });

  const bulkStatusMutation = useMutation<
    unknown,
    Error,
    CategoryBulkStatusMutationVariables,
    MutationContext<CategoriesListResponse>
  >({
    mutationFn: async ({ ids, status }) =>
      Promise.all(
        ids.map((id) =>
          request(`/api/categories/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
        ),
      ),
    onMutate: async ({ ids, status, messages }) => {
      await queryClient.cancelQueries({ queryKey: ['categories-table'] });
      const snapshot = captureQueries<CategoriesListResponse>(queryClient, ['categories-table']);
      const toastId = toast.loading(messages.loading);

      updateCategoryLists(queryClient, (category) =>
        ids.includes(category.id)
          ? {
              ...category,
              isActive: status === 'active',
              status,
              updatedAt: new Date().toISOString(),
              updatedByName: t('history.systemActor'),
            }
          : category,
      );
      setSelectedIds([]);

      return { messages, snapshot, toastId };
    },
    onError: (error, _variables, context) => {
      if (!context) return;
      restoreQueries(queryClient, context.snapshot);
      toast.error(mutationErrorMessage(context.messages.error, error), { id: context.toastId });
    },
    onSuccess: (_data, _variables, context) => {
      if (!context) return;
      toast.success(context.messages.success, { id: context.toastId });
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ['categories-table'] });
    },
  });

  const deleteMutation = useMutation<
    unknown,
    Error,
    CategoryDeleteMutationVariables,
    MutationContext<CategoriesListResponse>
  >({
    mutationFn: async ({ ids }) =>
      Promise.all(ids.map((id) => request(`/api/categories/${id}`, { method: 'DELETE' }))),
    onMutate: async ({ ids, messages }) => {
      await queryClient.cancelQueries({ queryKey: ['categories-table'] });
      const snapshot = captureQueries<CategoriesListResponse>(queryClient, ['categories-table']);
      const toastId = toast.loading(messages.loading);

      updateCategoryLists(queryClient, (category) => (ids.includes(category.id) ? null : category));
      setSelectedIds([]);
      setDeleteState(null);

      return { messages, snapshot, toastId };
    },
    onError: (error, _variables, context) => {
      if (!context) return;
      restoreQueries(queryClient, context.snapshot);
      toast.error(mutationErrorMessage(context.messages.error, error), { id: context.toastId });
    },
    onSuccess: (_data, _variables, context) => {
      if (!context) return;
      toast.success(context.messages.success, { id: context.toastId });
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ['categories-table'] });
    },
  });

  const sortedItems = useMemo(
    () =>
      applyClientMultiSort(
        query.data.items,
        getEffectiveSortRules(sortRules, [{ key: 'updatedAt', direction: 'desc' }]),
        {
          status: (category) => category.status,
          name: (category) => category.name,
          parentName: (category) => category.parentName,
          createdAt: (category) => category.createdAt,
          updatedAt: (category) => category.updatedAt,
        },
      ),
    [query.data.items, sortRules],
  );

  const allSelected =
    sortedItems.length > 0 && sortedItems.every((item) => selectedIds.includes(item.id));

  const toggleSort = (key: CategorySortKey) => {
    startFilterTransition(() => {
      setSortRules((current) => toggleSortRule(current, key, 'asc'));
    });
  };

  const submitCategoryDialog = form.handleSubmit(
    async (rawValues) => {
      const values = categoryFormSchema.parse(rawValues);
      if (dialogState.mode === 'edit' && dialogState.editingId) {
        await updateMutation.mutateAsync({
          id: dialogState.editingId,
          values,
          messages: buildMessages(
            t,
            'notifications.categories.save.loading',
            'notifications.categories.save.success',
            'notifications.categories.save.error',
            { name: values.name },
          ),
        });
        return;
      }

      await createMutation.mutateAsync({
        values,
        messages: buildMessages(
          t,
          'notifications.categories.create.loading',
          'notifications.categories.create.success',
          'notifications.categories.create.error',
          { name: values.name },
        ),
      });
    },
    (errors) => {
      toast.error(
        firstFormErrorMessage(errors) ??
          t('notifications.categories.create.error', {
            name: form.getValues('name') || t('labels.categoryNamePlaceholder'),
          }),
      );
    },
  );

  return (
    <motion.section
      id="categories"
      className="scroll-mt-24 overflow-hidden rounded-[1.75rem] border border-border/70 bg-background/95 shadow-sm"
      {...sectionTransitionProps}
    >
      <div className="flex flex-col gap-4 px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold">{t('nav.categories')}</h2>
            <PendingInline
              active={isFilterPending || query.isFetching}
              label={t('labels.loading')}
              className="mt-2"
            />
          </div>
          <Button type="button" onClick={openCreate} disabled={!query.data.writable}>
            {t('actions.createCategory')}
          </Button>
        </div>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <SearchField
            value={search}
            placeholder={t('labels.searchCategories')}
            onChange={(value) => {
              startFilterTransition(() => {
                setPage(1);
                setSearch(value);
              });
            }}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={selectedIds.length === 0}
              onClick={() =>
                bulkStatusMutation.mutate({
                  ids: selectedIds,
                  status: 'active',
                  messages: buildMessages(
                    t,
                    'notifications.categories.activateSelected.loading',
                    'notifications.categories.activateSelected.success',
                    'notifications.categories.activateSelected.error',
                    { count: selectedIds.length },
                  ),
                })
              }
            >
              {t('actions.activateSelected')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={selectedIds.length === 0}
              onClick={() =>
                bulkStatusMutation.mutate({
                  ids: selectedIds,
                  status: 'draft',
                  messages: buildMessages(
                    t,
                    'notifications.categories.deactivateSelected.loading',
                    'notifications.categories.deactivateSelected.success',
                    'notifications.categories.deactivateSelected.error',
                    { count: selectedIds.length },
                  ),
                })
              }
            >
              {t('actions.deactivateSelected')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={selectedIds.length === 0}
              onClick={() =>
                setDeleteState({
                  ids: selectedIds,
                  label: t('labels.bulkSelectionCount', { count: selectedIds.length }),
                })
              }
            >
              {t('actions.deleteSelected')}
            </Button>
          </div>
        </div>
      </div>

      <div className="relative" aria-busy={query.isFetching}>
        <div
          className={
            query.isFetching
              ? 'transition-opacity duration-200 opacity-70'
              : 'transition-opacity duration-200'
          }
        >
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-12">
                    <Checkbox
                      aria-label={t('labels.selectAll')}
                      checked={allSelected}
                      onChange={(event) =>
                        setSelectedIds(
                          event.target.checked ? sortedItems.map((item) => item.id) : [],
                        )
                      }
                    />
                  </TableHead>
                  <TableHead className="w-28">
                    <MultiSortHeader
                      label={t('labels.status')}
                      sortState={getSortRuleState(sortRules, 'status')}
                      onClick={() => toggleSort('status')}
                    />
                  </TableHead>
                  <TableHead>
                    <MultiSortHeader
                      label={t('labels.name')}
                      sortState={getSortRuleState(sortRules, 'name')}
                      onClick={() => toggleSort('name')}
                    />
                  </TableHead>
                  <TableHead>
                    <MultiSortHeader
                      label={t('labels.parentCategory')}
                      sortState={getSortRuleState(sortRules, 'parentName')}
                      onClick={() => toggleSort('parentName')}
                    />
                  </TableHead>
                  <TableHead>
                    <MultiSortHeader
                      label={t('labels.created')}
                      sortState={getSortRuleState(sortRules, 'createdAt')}
                      onClick={() => toggleSort('createdAt')}
                    />
                  </TableHead>
                  <TableHead>
                    <MultiSortHeader
                      label={t('labels.modified')}
                      sortState={getSortRuleState(sortRules, 'updatedAt')}
                      onClick={() => toggleSort('updatedAt')}
                    />
                  </TableHead>
                  <TableHead className="w-48 text-right">{t('labels.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedItems.map((category) => (
                  <TableRow key={category.id}>
                    <TableCell>
                      <Checkbox
                        aria-label={t('labels.selectRow', { name: category.name })}
                        checked={selectedIds.includes(category.id)}
                        onChange={(event) =>
                          setSelectedIds((value) =>
                            event.target.checked
                              ? [...new Set([...value, category.id])]
                              : value.filter((id) => id !== category.id),
                          )
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={category.isActive}
                        aria-label={t('labels.status')}
                        disabled={!query.data.writable}
                        onCheckedChange={(checked) =>
                          updateMutation.mutate({
                            id: category.id,
                            values: { status: checked ? 'active' : 'draft' },
                            messages: buildMessages(
                              t,
                              checked
                                ? 'notifications.categories.activate.loading'
                                : 'notifications.categories.deactivate.loading',
                              checked
                                ? 'notifications.categories.activate.success'
                                : 'notifications.categories.deactivate.success',
                              checked
                                ? 'notifications.categories.activate.error'
                                : 'notifications.categories.deactivate.error',
                              { name: category.name },
                            ),
                          })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{category.name}</span>
                        {category.nameAr ? (
                          <span className="text-sm text-muted-foreground">{category.nameAr}</span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-muted-foreground">
                        {category.parentName ?? t('labels.noParentCategory')}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm text-muted-foreground">
                        {timestampLabel(
                          category.createdAt,
                          actorLabel(
                            category.createdByName,
                            category.createdBy,
                            t('history.systemActor'),
                          ),
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm text-muted-foreground">
                        {timestampLabel(
                          category.updatedAt,
                          actorLabel(
                            category.updatedByName,
                            category.updatedBy,
                            t('history.systemActor'),
                          ),
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={!query.data.writable}
                          onClick={() => {
                            form.reset({
                              name: category.name,
                              nameAr: category.nameAr ?? '',
                              imageUrl: category.image ?? '',
                              parentId: category.parentId ? Number(category.parentId) : null,
                            });
                            startFilterTransition(() => {
                              setDialogState({ open: true, mode: 'edit', editingId: category.id });
                            });
                          }}
                        >
                          {t('actions.edit')}
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          disabled={!query.data.writable}
                          onClick={() =>
                            setDeleteState({ ids: [category.id], label: category.name })
                          }
                        >
                          {t('actions.delete')}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <TablePaginationControls
            currentPage={query.data.pagination.page}
            totalPages={query.data.pagination.totalPages}
            onPageChange={(nextPage) => startFilterTransition(() => setPage(nextPage))}
          />
        </div>
        <SurfacePendingOverlay active={query.isFetching} label={t('labels.loading')} />
      </div>

      <CategoryDialogForm
        open={dialogState.open}
        mode={dialogState.mode}
        form={form}
        pending={createMutation.isPending || updateMutation.isPending}
        parentOptions={query.data.parentOptions}
        editingId={dialogState.editingId}
        onOpenChange={(open) => {
          if (!open) {
            closeDialog();
          }
        }}
        onSubmit={submitCategoryDialog}
      />

      <DeleteDialog
        open={Boolean(deleteState)}
        onOpenChange={(open) => {
          if (!open) setDeleteState(null);
        }}
        title={t('labels.deleteDialogTitle')}
        description={t('labels.deleteDialogDescription', { target: deleteState?.label ?? '' })}
        pending={deleteMutation.isPending}
        onConfirm={() => {
          if (deleteState) {
            deleteMutation.mutate({
              ids: deleteState.ids,
              messages: buildMessages(
                t,
                'notifications.categories.delete.loading',
                'notifications.categories.delete.success',
                'notifications.categories.delete.error',
                { target: deleteState.label },
              ),
            });
          }
        }}
      />
    </motion.section>
  );
}
