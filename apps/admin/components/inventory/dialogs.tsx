'use client';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { type InventoryBarcodeInput } from '../../lib/inventory';
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
import { Field, FieldError, FieldGroup, FieldLabel } from '../ui/field';
import { Input } from '../ui/input';
import { Skeleton } from '../ui/skeleton';
import { TableCell, TableRow } from '../ui/table';
import { type BarcodeDialogState, type ScanBarcodeState, type ScanOrderState } from './state';

export function InventoryTableSkeleton() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, index) => (
        <TableRow key={index}>
          <TableCell>
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-24" />
            </div>
          </TableCell>
          <TableCell>
            <Skeleton className="h-8 w-28" />
          </TableCell>
          <TableCell>
            <div className="flex items-center gap-2">
              <Skeleton className="h-8 w-8" />
              <Skeleton className="h-4 w-10" />
              <Skeleton className="h-8 w-8" />
            </div>
          </TableCell>
          <TableCell>
            <Skeleton className="h-6 w-11" />
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

export function BarcodeDialog({
  state,
  pending,
  form,
  onOpenChange,
  onSubmit,
}: {
  state: BarcodeDialogState;
  pending: boolean;
  form: ReturnType<typeof useForm<InventoryBarcodeInput>>;
  onOpenChange: (open: boolean) => void;
  onSubmit: () => void;
}) {
  const t = useTranslations();

  return (
    <Dialog open={state.open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {state.item?.barcode
              ? t('inventory.barcode.editTitle', { name: state.item.title })
              : t('inventory.barcode.addTitle', { name: state.item?.title ?? '' })}
          </DialogTitle>
          <DialogDescription>{t('inventory.barcode.description')}</DialogDescription>
        </DialogHeader>

        <form
          className="mt-5"
          onSubmit={(event) => {
            event.preventDefault();
            void onSubmit();
          }}
        >
          <FieldGroup>
            <Field data-invalid={form.formState.errors.barcode ? '' : undefined}>
              <FieldLabel htmlFor="inventory-barcode">{t('inventory.columns.barcode')}</FieldLabel>
              <Input
                id="inventory-barcode"
                aria-invalid={form.formState.errors.barcode ? true : undefined}
                placeholder={t('inventory.barcode.placeholder')}
                {...form.register('barcode')}
              />
              {form.formState.errors.barcode ? (
                <FieldError>{form.formState.errors.barcode.message}</FieldError>
              ) : null}
            </Field>
          </FieldGroup>

          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('actions.cancel')}
            </Button>
            <Button type="submit" disabled={pending}>
              {t('actions.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ScanBarcodeDialog({
  state,
  pending,
  onOpenChange,
  onConfirm,
}: {
  state: ScanBarcodeState;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const t = useTranslations();

  return (
    <Dialog open={state.open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t('inventory.scan.barcodeTitle', { name: state.item?.title ?? '' })}
          </DialogTitle>
          <DialogDescription>{t('inventory.scan.barcodeDescription')}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="mt-6">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('actions.cancel')}
          </Button>
          <Button type="button" disabled={pending} onClick={onConfirm}>
            {t('inventory.scan.confirmAddOne')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ScanOrderDialog({
  state,
  pending,
  onOpenChange,
  onToggleItem,
  onIncreaseQuantity,
  onDecreaseQuantity,
  onConfirm,
}: {
  state: ScanOrderState;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onToggleItem: (productId: number) => void;
  onIncreaseQuantity: (productId: number) => void;
  onDecreaseQuantity: (productId: number) => void;
  onConfirm: () => void;
}) {
  const t = useTranslations();

  return (
    <Dialog open={state.open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[calc(100dvh-2rem)] max-h-[calc(100dvh-2rem)] max-w-none overflow-y-auto rounded-xl p-4 sm:h-auto sm:max-h-[90vh] sm:max-w-3xl sm:rounded-[var(--shape-radius-overlay)] sm:p-6">
        <DialogHeader>
          <DialogTitle>{t('inventory.scan.orderTitle', { id: state.order?.id ?? 0 })}</DialogTitle>
          <DialogDescription>{state.order?.fullName ?? ''}</DialogDescription>
        </DialogHeader>
        <div className="mt-4 divide-y divide-border/60 border-y border-border/60">
          {state.items.map((item) => (
            <div key={`${item.productId ?? item.title}`} className="py-3">
              <div className="flex items-start gap-3">
                <Checkbox
                  checked={item.selected}
                  disabled={!item.selectable || pending}
                  onChange={() => item.productId != null && onToggleItem(item.productId)}
                  aria-label={t('inventory.scan.toggleOrderItem', { name: item.title })}
                />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{item.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {t('inventory.scan.orderQuantity', { count: item.quantity })} •{' '}
                    {t('inventory.scan.currentInventory', { count: item.inventoryQuantity ?? 0 })}
                  </p>
                  {!item.selectable && item.reason ? (
                    <p className="text-xs text-muted-foreground">{item.reason}</p>
                  ) : null}
                </div>
                {item.selectable && item.productId != null ? (
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={pending || item.addQuantity <= 1}
                      onClick={() => onDecreaseQuantity(item.productId!)}
                    >
                      -1
                    </Button>
                    <span className="min-w-10 text-center text-sm font-medium">
                      {item.addQuantity}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={pending}
                      onClick={() => onIncreaseQuantity(item.productId!)}
                    >
                      +1
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
        <DialogFooter className="mt-6">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('actions.cancel')}
          </Button>
          <Button type="button" disabled={pending} onClick={onConfirm}>
            {t('inventory.scan.confirmOrderAdd')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
