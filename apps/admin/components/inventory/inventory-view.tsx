'use client';
import { Search } from 'lucide-react';
import { motion } from 'motion/react';
import { getSortRuleState } from '../../lib/multi-sort';
import { MultiSortHeader } from '../multi-sort-header';
import { SearchField } from '../search-field';
import { Button } from '../ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '../ui/empty';
import { Input } from '../ui/input';
import { PendingInline, sectionTransitionProps, SurfacePendingOverlay } from '../ui/motion';
import { ScrollableRegion } from '../ui/scrollable-region';
import { Skeleton } from '../ui/skeleton';
import { Switch } from '../ui/switch';
import { Table, TableBody, TableCell, TableHead, TableRow } from '../ui/table';
import {
  WorkspaceFrame,
  WorkspaceHeader,
  WorkspaceHeading,
  WorkspaceToolbar,
} from '../ui/workspace';
import { WorkspacePagination } from '../ui/workspace-pagination';
import {
  BarcodeDialog,
  InventoryTableSkeleton,
  ScanBarcodeDialog,
  ScanOrderDialog,
  type useInventoryManager,
} from './use-inventory';

export function InventoryManagerView({
  title,
  query,
  isFilterPending,
  t,
  scanQuery,
  setScanQuery,
  submitScan,
  scanMutation,
  batchApplyMutation,
  search,
  startFilterTransition,
  setPage,
  setSearch,
  isLoading,
  sortRules,
  toggleSort,
  items,
  writable,
  isMutating,
  openBarcodeDialog,
  changeQuantity,
  changeStock,
  page,
  barcodeDialogState,
  mutation,
  barcodeForm,
  closeBarcodeDialog,
  submitBarcode,
  scanBarcodeState,
  closeScanBarcodeDialog,
  confirmBarcodeScanAdd,
  scanOrderState,
  closeScanOrderDialog,
  toggleScanOrderItem,
  increaseScanOrderQuantity,
  decreaseScanOrderQuantity,
  confirmOrderScanAdd,
}: NonNullable<ReturnType<typeof useInventoryManager>['view']>) {
  return (
    <WorkspaceFrame>
      <motion.section
        className="scroll-mt-24"
        {...sectionTransitionProps()}
        data-admin-workspace="inventory"
      >
        <WorkspaceHeader>
          <WorkspaceHeading
            title={title}
            meta={query.data?.pagination.totalItems}
            description={
              <PendingInline
                active={isFilterPending || query.isFetching}
                label={t('labels.loading')}
              />
            }
          />
        </WorkspaceHeader>

        {query.isError ? (
          <div
            role="alert"
            className="flex items-center justify-between gap-3 py-3 text-sm text-destructive"
          >
            <p>{t('inventory.loadError')}</p>
            <Button
              type="button"
              variant="outline"
              disabled={query.isFetching}
              onClick={() => void query.refetch()}
            >
              {t('inventory.retry')}
            </Button>
          </div>
        ) : null}

        <WorkspaceToolbar className="grid gap-3 lg:grid-cols-[minmax(20rem,0.8fr)_minmax(18rem,1.2fr)]">
          <section className="min-w-0">
            <p className="text-sm font-medium">{t('inventory.scan.title')}</p>
            <p className="text-xs text-muted-foreground">{t('inventory.scan.description')}</p>
            <div className="mt-2 flex gap-2">
              <Input
                value={scanQuery}
                onChange={(event) => setScanQuery(event.target.value)}
                placeholder={t('inventory.scan.placeholder')}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void submitScan();
                  }
                }}
              />
              <Button
                type="button"
                disabled={
                  scanMutation.isPending ||
                  batchApplyMutation.isPending ||
                  scanQuery.trim().length === 0
                }
                onClick={() => void submitScan()}
              >
                {t('inventory.scan.action')}
              </Button>
            </div>
          </section>
          <div className="flex min-w-0 items-end">
            <SearchField
              value={search}
              placeholder={t('inventory.searchPlaceholder')}
              onChange={(value) => {
                startFilterTransition(() => {
                  setPage(1);
                  setSearch(value);
                });
              }}
            />
          </div>
        </WorkspaceToolbar>

        <div className="relative" aria-busy={query.isFetching && !isLoading}>
          <div
            className={
              query.isFetching && !isLoading
                ? 'transition-opacity duration-[var(--duration-standard)] opacity-70'
                : 'transition-opacity duration-[var(--duration-standard)]'
            }
          >
            <ScrollableRegion label={t('nav.inventory')} className="hidden md:block">
              <Table>
                <thead>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>
                      <MultiSortHeader
                        label={t('inventory.columns.product')}
                        sortState={getSortRuleState(sortRules, 'title')}
                        onClick={() => toggleSort('title')}
                      />
                    </TableHead>
                    <TableHead>{t('inventory.columns.barcode')}</TableHead>
                    <TableHead>
                      <MultiSortHeader
                        label={t('inventory.columns.quantity')}
                        sortState={getSortRuleState(sortRules, 'inventoryQuantity')}
                        onClick={() => toggleSort('inventoryQuantity')}
                      />
                    </TableHead>
                    <TableHead className="w-40">
                      <MultiSortHeader
                        label={t('inventory.columns.inStock')}
                        sortState={getSortRuleState(sortRules, 'inStock')}
                        onClick={() => toggleSort('inStock')}
                      />
                    </TableHead>
                  </TableRow>
                </thead>
                <TableBody>
                  {isLoading ? <InventoryTableSkeleton /> : null}

                  {query.isSuccess && items.length === 0 ? (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={4}>
                        <Empty className="border-none">
                          <EmptyHeader>
                            <EmptyMedia variant="icon">
                              <Search />
                            </EmptyMedia>
                            <EmptyTitle>{t('inventory.emptyTitle')}</EmptyTitle>
                            <EmptyDescription>{t('inventory.empty')}</EmptyDescription>
                          </EmptyHeader>
                        </Empty>
                      </TableCell>
                    </TableRow>
                  ) : null}

                  {!isLoading
                    ? items.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              <span className="font-medium">{item.title}</span>
                              <span className="text-sm text-muted-foreground">
                                {item.sku
                                  ? t('inventory.productMeta', { sku: item.sku })
                                  : t('inventory.noSku')}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Button
                              type="button"
                              variant={item.barcode ? 'ghost' : 'outline'}
                              size="sm"
                              disabled={!writable || isMutating}
                              onClick={() => openBarcodeDialog(item)}
                            >
                              {item.barcode ?? t('inventory.addBarcode')}
                            </Button>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                aria-label={t('inventory.decreaseRow', { name: item.title })}
                                disabled={!writable || isMutating || item.inventoryQuantity === 0}
                                onClick={() => changeQuantity(item, -1)}
                              >
                                -1
                              </Button>
                              <div className="min-w-12 text-center">
                                <p className="font-medium">{item.inventoryQuantity}</p>
                              </div>
                              <Button
                                type="button"
                                size="sm"
                                aria-label={t('inventory.increaseRow', { name: item.title })}
                                disabled={!writable || isMutating}
                                onClick={() => changeQuantity(item, 1)}
                              >
                                +1
                              </Button>
                              <span className="text-xs text-muted-foreground">
                                {new Date(item.updatedAt).toLocaleString()}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Switch
                              checked={item.inStock}
                              aria-label={t('inventory.toggleStock', { name: item.title })}
                              disabled={!writable || isMutating}
                              onCheckedChange={(checked) => changeStock(item, checked)}
                            />
                          </TableCell>
                        </TableRow>
                      ))
                    : null}
                </TableBody>
              </Table>
            </ScrollableRegion>

            <div
              className="divide-y divide-border/60 border-b border-border/60 md:hidden"
              data-mobile-inventory-list
            >
              {isLoading
                ? Array.from({ length: 4 }).map((_, index) => (
                    <div key={index} className="space-y-3 px-3 py-4">
                      <Skeleton className="h-4 w-2/3" />
                      <Skeleton className="h-9 w-full" />
                    </div>
                  ))
                : null}
              {query.isSuccess && items.length === 0 ? (
                <Empty className="border-none px-3 py-10">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <Search />
                    </EmptyMedia>
                    <EmptyTitle>{t('inventory.emptyTitle')}</EmptyTitle>
                    <EmptyDescription>{t('inventory.empty')}</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : null}
              {!isLoading
                ? items.map((item) => (
                    <article key={item.id} className="px-3 py-3.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="truncate text-sm font-semibold">{item.title}</h3>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {item.sku
                              ? t('inventory.productMeta', { sku: item.sku })
                              : t('inventory.noSku')}
                          </p>
                        </div>
                        <Switch
                          checked={item.inStock}
                          aria-label={t('inventory.toggleStock', { name: item.title })}
                          disabled={!writable || isMutating}
                          onCheckedChange={(checked) => changeStock(item, checked)}
                        />
                      </div>
                      <div className="mt-3 flex items-center gap-2">
                        <Button
                          type="button"
                          variant={item.barcode ? 'ghost' : 'outline'}
                          size="sm"
                          className="min-w-0 max-w-[45%] truncate"
                          disabled={!writable || isMutating}
                          onClick={() => openBarcodeDialog(item)}
                        >
                          {item.barcode ?? t('inventory.addBarcode')}
                        </Button>
                        <div className="ms-auto flex items-center gap-1.5">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="size-8 px-0"
                            aria-label={t('inventory.decreaseRow', { name: item.title })}
                            disabled={!writable || isMutating || item.inventoryQuantity === 0}
                            onClick={() => changeQuantity(item, -1)}
                          >
                            −
                          </Button>
                          <span className="min-w-8 text-center text-sm font-semibold tabular-nums">
                            {item.inventoryQuantity}
                          </span>
                          <Button
                            type="button"
                            size="sm"
                            className="size-8 px-0"
                            aria-label={t('inventory.increaseRow', { name: item.title })}
                            disabled={!writable || isMutating}
                            onClick={() => changeQuantity(item, 1)}
                          >
                            +
                          </Button>
                        </div>
                      </div>
                    </article>
                  ))
                : null}
            </div>

            <WorkspacePagination
              currentPage={query.data?.pagination.page ?? page}
              totalPages={query.data?.pagination.totalPages ?? 1}
              pending={query.isFetching}
              onPageChange={(nextPage) => startFilterTransition(() => setPage(nextPage))}
            />
          </div>
          <SurfacePendingOverlay
            active={query.isFetching && !isLoading}
            label={t('inventory.refreshing')}
          />
        </div>

        <BarcodeDialog
          state={barcodeDialogState}
          pending={mutation.isPending}
          form={barcodeForm}
          onOpenChange={(open) => {
            if (!open) {
              closeBarcodeDialog();
            }
          }}
          onSubmit={submitBarcode}
        />
        <ScanBarcodeDialog
          state={scanBarcodeState}
          pending={batchApplyMutation.isPending}
          onOpenChange={(open) => {
            if (!open) {
              closeScanBarcodeDialog();
            }
          }}
          onConfirm={() => void confirmBarcodeScanAdd()}
        />
        <ScanOrderDialog
          state={scanOrderState}
          pending={batchApplyMutation.isPending}
          onOpenChange={(open) => {
            if (!open) {
              closeScanOrderDialog();
            }
          }}
          onToggleItem={toggleScanOrderItem}
          onIncreaseQuantity={increaseScanOrderQuantity}
          onDecreaseQuantity={decreaseScanOrderQuantity}
          onConfirm={() => void confirmOrderScanAdd()}
        />
      </motion.section>
    </WorkspaceFrame>
  );
}
