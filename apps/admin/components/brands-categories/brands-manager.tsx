'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useDeferredValue, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useForm, useWatch } from 'react-hook-form';

import { requestJson as request } from '../../lib/admin-api';
import {
  brandFormSchema,
  brandsListResponseSchema,
  type BrandFormInput,
  type BrandFormValues,
  type BrandRow,
  type BrandUpdateValues,
  type BrandsListResponse,
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

const BRAND_DIALOG_STORAGE_KEY = 'brands-dialog-state-v1';

const brandFormDefaults: BrandFormInput = {
  name: '',
  imageUrl: '',
};

type BrandSortKey = 'status' | 'name' | 'createdAt' | 'updatedAt';
type BrandSortRule = SortRule<BrandSortKey>;
type BrandDialogState = { open: boolean; mode: 'create' | 'edit'; editingId: string | null };
type BrandUpdateMutationVariables = {
  id: string;
  values: BrandUpdateValues;
  messages: MutationMessages;
};
type BrandCreateMutationVariables = { values: BrandFormValues; messages: MutationMessages };
type BrandBulkStatusMutationVariables = {
  ids: string[];
  status: 'active' | 'draft';
  messages: MutationMessages;
};
type BrandDeleteMutationVariables = { ids: string[]; messages: MutationMessages };

function updateBrandLists(
  queryClient: ReturnType<typeof useQueryClient>,
  updater: (brand: BrandRow) => BrandRow | null,
) {
  queryClient.setQueriesData<BrandsListResponse>({ queryKey: ['brands-table'] }, (current) => {
    if (!current) {
      return current;
    }

    return {
      ...current,
      items: current.items.map(updater).filter((item): item is BrandRow => item !== null),
    };
  });
}

function BrandDialogForm({
  open,
  mode,
  form,
  pending,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  mode: 'create' | 'edit';
  form: ReturnType<typeof useForm<BrandFormInput>>;
  pending: boolean;
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
            {mode === 'create' ? t('labels.createBrandTitle') : t('labels.editBrandTitle')}
          </DialogTitle>
          <DialogDescription>{t('labels.brandDialogDescription')}</DialogDescription>
        </DialogHeader>

        <form
          className="mt-5 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void onSubmit();
          }}
        >
          <Field>
            <FieldLabel htmlFor="brand-name">{t('labels.name')}</FieldLabel>
            <Input
              id="brand-name"
              placeholder={t('labels.brandNamePlaceholder')}
              {...form.register('name')}
            />
            {form.formState.errors.name ? (
              <FieldError>{form.formState.errors.name.message}</FieldError>
            ) : null}
          </Field>

          <ImageUploadField
            uploadUrl="/api/uploads/brands"
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
              {mode === 'create' ? t('actions.createBrand') : t('actions.saveBrand')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function BrandsManager() {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search.trim());
  const [sortRules, setSortRules] = useState<BrandSortRule[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deleteState, setDeleteState] = useState<{ ids: string[]; label: string } | null>(null);
  const [dialogState, setDialogState] = useState<BrandDialogState>({
    open: false,
    mode: 'create',
    editingId: null,
  });
  const [isFilterPending, startFilterTransition] = useTransition();
  const hydratedRef = useRef(false);

  const form = useForm<BrandFormInput>({
    resolver: zodResolver(brandFormSchema),
    defaultValues: brandFormDefaults,
  });
  const draftValues = useWatch({ control: form.control });

  const query = useQuery({
    queryKey: ['brands-table', page, deferredSearch],
    queryFn: async () =>
      brandsListResponseSchema.parse(
        await request(
          `/api/brands?page=${page}&limit=50&search=${encodeURIComponent(deferredSearch)}`,
        ),
      ),
    initialData: {
      writable: false,
      items: [],
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
    staleTime: 30_000,
  });

  useEffect(() => {
    const stored = readStorage<{ dialogState: BrandDialogState; values: BrandFormInput }>(
      BRAND_DIALOG_STORAGE_KEY,
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
      writeStorage(BRAND_DIALOG_STORAGE_KEY, null);
      return;
    }

    writeStorage(BRAND_DIALOG_STORAGE_KEY, {
      dialogState,
      values: {
        name: draftValues.name ?? '',
        imageUrl: draftValues.imageUrl ?? '',
      },
    });
  }, [dialogState, draftValues.imageUrl, draftValues.name]);

  const openCreate = () => {
    form.reset(brandFormDefaults);
    startFilterTransition(() => {
      setDialogState({ open: true, mode: 'create', editingId: null });
    });
  };

  const closeDialog = () => {
    setDialogState({ open: false, mode: 'create', editingId: null });
    form.reset(brandFormDefaults);
    writeStorage(BRAND_DIALOG_STORAGE_KEY, null);
  };

  const updateMutation = useMutation<
    unknown,
    Error,
    BrandUpdateMutationVariables,
    MutationContext<BrandsListResponse>
  >({
    mutationFn: ({ id, values }) =>
      request(`/api/brands/${id}`, { method: 'PATCH', body: JSON.stringify(values) }),
    onMutate: async ({ id, values, messages }) => {
      await queryClient.cancelQueries({ queryKey: ['brands-table'] });
      const snapshot = captureQueries<BrandsListResponse>(queryClient, ['brands-table']);
      const toastId = toast.loading(messages.loading);

      updateBrandLists(queryClient, (brand) => {
        if (brand.id !== id) {
          return brand;
        }

        return {
          ...brand,
          name: values.name ?? brand.name,
          image: values.imageUrl === undefined ? brand.image : values.imageUrl,
          isActive: values.status === undefined ? brand.isActive : values.status === 'active',
          status: values.status ?? brand.status,
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
      await queryClient.invalidateQueries({ queryKey: ['brands-table'] });
    },
  });

  const createMutation = useMutation<
    unknown,
    Error,
    BrandCreateMutationVariables,
    MutationContext<BrandsListResponse>
  >({
    mutationFn: ({ values }) =>
      request('/api/brands', { method: 'POST', body: JSON.stringify(values) }),
    onMutate: async ({ values, messages }) => {
      await queryClient.cancelQueries({ queryKey: ['brands-table'] });
      const snapshot = captureQueries<BrandsListResponse>(queryClient, ['brands-table']);
      const toastId = toast.loading(messages.loading);
      const now = new Date().toISOString();
      const optimisticRow: BrandRow = {
        id: `temp-brand-${now}`,
        name: values.name,
        slug: slugify(values.name),
        image: values.imageUrl,
        isActive: true,
        status: 'active',
        productCount: 0,
        createdAt: now,
        updatedAt: now,
        createdBy: null,
        createdByName: t('history.systemActor'),
        updatedBy: null,
        updatedByName: t('history.systemActor'),
      };

      queryClient.setQueryData<BrandsListResponse>(
        ['brands-table', page, deferredSearch],
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
      await queryClient.invalidateQueries({ queryKey: ['brands-table'] });
    },
  });

  const bulkStatusMutation = useMutation<
    unknown,
    Error,
    BrandBulkStatusMutationVariables,
    MutationContext<BrandsListResponse>
  >({
    mutationFn: async ({ ids, status }) =>
      Promise.all(
        ids.map((id) =>
          request(`/api/brands/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
        ),
      ),
    onMutate: async ({ ids, status, messages }) => {
      await queryClient.cancelQueries({ queryKey: ['brands-table'] });
      const snapshot = captureQueries<BrandsListResponse>(queryClient, ['brands-table']);
      const toastId = toast.loading(messages.loading);

      updateBrandLists(queryClient, (brand) =>
        ids.includes(brand.id)
          ? {
              ...brand,
              isActive: status === 'active',
              status,
              updatedAt: new Date().toISOString(),
              updatedByName: t('history.systemActor'),
            }
          : brand,
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
      await queryClient.invalidateQueries({ queryKey: ['brands-table'] });
    },
  });

  const deleteMutation = useMutation<
    unknown,
    Error,
    BrandDeleteMutationVariables,
    MutationContext<BrandsListResponse>
  >({
    mutationFn: async ({ ids }) =>
      Promise.all(ids.map((id) => request(`/api/brands/${id}`, { method: 'DELETE' }))),
    onMutate: async ({ ids, messages }) => {
      await queryClient.cancelQueries({ queryKey: ['brands-table'] });
      const snapshot = captureQueries<BrandsListResponse>(queryClient, ['brands-table']);
      const toastId = toast.loading(messages.loading);

      updateBrandLists(queryClient, (brand) => (ids.includes(brand.id) ? null : brand));
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
      await queryClient.invalidateQueries({ queryKey: ['brands-table'] });
    },
  });

  const sortedItems = useMemo(
    () =>
      applyClientMultiSort(
        query.data.items,
        getEffectiveSortRules(sortRules, [{ key: 'updatedAt', direction: 'desc' }]),
        {
          status: (brand) => brand.status,
          name: (brand) => brand.name,
          createdAt: (brand) => brand.createdAt,
          updatedAt: (brand) => brand.updatedAt,
        },
      ),
    [query.data.items, sortRules],
  );

  const allSelected =
    sortedItems.length > 0 && sortedItems.every((item) => selectedIds.includes(item.id));

  const toggleSort = (key: BrandSortKey) => {
    startFilterTransition(() => {
      setSortRules((current) => toggleSortRule(current, key, 'asc'));
    });
  };

  const submitBrandDialog = form.handleSubmit(
    async (rawValues) => {
      const values = brandFormSchema.parse(rawValues);
      if (dialogState.mode === 'edit' && dialogState.editingId) {
        await updateMutation.mutateAsync({
          id: dialogState.editingId,
          values,
          messages: buildMessages(
            t,
            'notifications.brands.save.loading',
            'notifications.brands.save.success',
            'notifications.brands.save.error',
            { name: values.name },
          ),
        });
        return;
      }

      await createMutation.mutateAsync({
        values,
        messages: buildMessages(
          t,
          'notifications.brands.create.loading',
          'notifications.brands.create.success',
          'notifications.brands.create.error',
          { name: values.name },
        ),
      });
    },
    (errors) => {
      toast.error(
        firstFormErrorMessage(errors) ??
          t('notifications.brands.create.error', {
            name: form.getValues('name') || t('labels.brandNamePlaceholder'),
          }),
      );
    },
  );

  return (
    <motion.section
      id="brands"
      className="scroll-mt-24 overflow-hidden rounded-[1.75rem] border border-border/70 bg-background/95 shadow-sm"
      {...sectionTransitionProps}
    >
      <div className="flex flex-col gap-4 px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold">{t('nav.brands')}</h2>
            <PendingInline
              active={isFilterPending || query.isFetching}
              label={t('labels.loading')}
              className="mt-2"
            />
          </div>
          <Button type="button" onClick={openCreate} disabled={!query.data.writable}>
            {t('actions.createBrand')}
          </Button>
        </div>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <SearchField
            value={search}
            placeholder={t('labels.searchBrands')}
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
                    'notifications.brands.activateSelected.loading',
                    'notifications.brands.activateSelected.success',
                    'notifications.brands.activateSelected.error',
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
                    'notifications.brands.deactivateSelected.loading',
                    'notifications.brands.deactivateSelected.success',
                    'notifications.brands.deactivateSelected.error',
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
                {sortedItems.map((brand) => (
                  <TableRow key={brand.id}>
                    <TableCell>
                      <Checkbox
                        aria-label={t('labels.selectRow', { name: brand.name })}
                        checked={selectedIds.includes(brand.id)}
                        onChange={(event) =>
                          setSelectedIds((value) =>
                            event.target.checked
                              ? [...new Set([...value, brand.id])]
                              : value.filter((id) => id !== brand.id),
                          )
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={brand.isActive}
                        aria-label={t('labels.status')}
                        disabled={!query.data.writable}
                        onCheckedChange={(checked) =>
                          updateMutation.mutate({
                            id: brand.id,
                            values: { status: checked ? 'active' : 'draft' },
                            messages: buildMessages(
                              t,
                              checked
                                ? 'notifications.brands.activate.loading'
                                : 'notifications.brands.deactivate.loading',
                              checked
                                ? 'notifications.brands.activate.success'
                                : 'notifications.brands.deactivate.success',
                              checked
                                ? 'notifications.brands.activate.error'
                                : 'notifications.brands.deactivate.error',
                              { name: brand.name },
                            ),
                          })
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">{brand.name}</span>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm text-muted-foreground">
                        {timestampLabel(
                          brand.createdAt,
                          actorLabel(
                            brand.createdByName,
                            brand.createdBy,
                            t('history.systemActor'),
                          ),
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm text-muted-foreground">
                        {timestampLabel(
                          brand.updatedAt,
                          actorLabel(
                            brand.updatedByName,
                            brand.updatedBy,
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
                              name: brand.name,
                              imageUrl: brand.image ?? '',
                            });
                            startFilterTransition(() => {
                              setDialogState({ open: true, mode: 'edit', editingId: brand.id });
                            });
                          }}
                        >
                          {t('actions.modify')}
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          disabled={!query.data.writable}
                          onClick={() => setDeleteState({ ids: [brand.id], label: brand.name })}
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

      <BrandDialogForm
        open={dialogState.open}
        mode={dialogState.mode}
        form={form}
        pending={createMutation.isPending || updateMutation.isPending}
        onOpenChange={(open) => {
          if (!open) {
            closeDialog();
          }
        }}
        onSubmit={submitBrandDialog}
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
                'notifications.brands.delete.loading',
                'notifications.brands.delete.success',
                'notifications.brands.delete.error',
                { target: deleteState.label },
              ),
            });
          }
        }}
      />
    </motion.section>
  );
}
