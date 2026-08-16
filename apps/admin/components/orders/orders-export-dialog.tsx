'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { ORDER_EXPORT_HEADERS } from '../../lib/order-export';
import type { OrderRecord } from '../../lib/orders';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
type ExportRow = {
  reference: string;
  fullName: string;
  phoneNumber: string;
  phoneNumber2: string;
  wilayaCode: string;
  wilaya: string;
  commune: string;
  address: string;
  product: string;
  weightKg: string;
  totalToCollect: string;
  note: string;
  fragile: string;
  exchange: string;
  pickup: string;
  recouvrement: string;
  stopdesk: string;
  mapLink: string;
};
export type ExportPreviewState = {
  mode: 'selected' | 'confirmed';
  title: string;
  fileName: string;
  orders: OrderRecord[];
  rows: ExportRow[];
} | null;
export type ExportProgressState = {
  phase: string;
  current: number;
  total: number;
} | null;

export function ExportOrdersDialog({
  state,
  progress,
  errorMessage,
  onOpenChange,
  onConfirm,
  onCancelJob,
}: {
  state: ExportPreviewState;
  progress: ExportProgressState;
  errorMessage: string | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  onCancelJob: () => void;
}) {
  const t = useTranslations();
  const pending = progress !== null;
  const [expandedPreview, setExpandedPreview] = useState(false);

  return (
    <Dialog open={Boolean(state)} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          'flex max-h-[90vh] flex-col overflow-hidden',
          expandedPreview ? 'sm:max-w-[95vw]' : 'sm:max-w-6xl',
        )}
      >
        <DialogHeader className="shrink-0 border-b border-border/70 pb-4">
          <DialogTitle>{state?.title ?? t('ordersManager.export.previewTitle')}</DialogTitle>
          <DialogDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            {state ? (
              <span className="rounded-full border border-border/70 bg-muted/30 px-3 py-1 font-mono text-xs text-foreground">
                {state.fileName}
              </span>
            ) : null}
          </DialogDescription>
        </DialogHeader>
        {state ? (
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden py-4">
            {progress ? (
              <div className="rounded-2xl border border-border/70 p-4">
                <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                  <span>{t(`ordersManager.export.progress.${progress.phase}`)}</span>
                  <span>
                    {progress.current}/{progress.total}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-foreground transition-all"
                    style={{
                      width: `${progress.total === 0 ? 0 : (progress.current / progress.total) * 100}%`,
                    }}
                  />
                </div>
              </div>
            ) : null}
            {errorMessage ? (
              <div
                role="alert"
                className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
              >
                {errorMessage}
              </div>
            ) : null}
            <div className="flex items-center justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => setExpandedPreview((current) => !current)}
              >
                {t(
                  expandedPreview
                    ? 'ordersManager.export.compactPreview'
                    : 'ordersManager.export.fullPreview',
                )}
              </Button>
            </div>
            <div className="min-h-0 overflow-hidden rounded-2xl border border-border/70 bg-muted/10">
              <div
                className={cn(
                  'h-full w-full',
                  expandedPreview ? 'overflow-auto' : 'overflow-hidden',
                )}
              >
                <div
                  className={cn(
                    expandedPreview
                      ? 'min-w-[1200px]'
                      : 'origin-top-left scale-[0.72] min-w-[1200px]',
                  )}
                >
                  <Table className="text-[11px] leading-tight">
                    <TableHeader>
                      <TableRow>
                        {ORDER_EXPORT_HEADERS.map((header) => (
                          <TableHead key={header} className="px-2 py-2 whitespace-nowrap">
                            {header}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {state.rows.map((row) => (
                        <TableRow key={`${state.mode}-${row.reference}`}>
                          <TableCell className="px-2 py-2 whitespace-nowrap">
                            {row.reference}
                          </TableCell>
                          <TableCell className="px-2 py-2 whitespace-nowrap">
                            {row.fullName}
                          </TableCell>
                          <TableCell className="px-2 py-2 whitespace-nowrap">
                            {row.phoneNumber}
                          </TableCell>
                          <TableCell className="px-2 py-2 whitespace-nowrap">
                            {row.phoneNumber2}
                          </TableCell>
                          <TableCell className="px-2 py-2 whitespace-nowrap">
                            {row.wilayaCode}
                          </TableCell>
                          <TableCell className="px-2 py-2 whitespace-nowrap">
                            {row.wilaya}
                          </TableCell>
                          <TableCell className="px-2 py-2 whitespace-nowrap">
                            {row.commune}
                          </TableCell>
                          <TableCell className="px-2 py-2">{row.address}</TableCell>
                          <TableCell className="px-2 py-2 whitespace-pre-line">
                            {row.product}
                          </TableCell>
                          <TableCell className="px-2 py-2 whitespace-nowrap">
                            {row.weightKg}
                          </TableCell>
                          <TableCell className="px-2 py-2 whitespace-nowrap">
                            {row.totalToCollect}
                          </TableCell>
                          <TableCell className="px-2 py-2">{row.note}</TableCell>
                          <TableCell className="px-2 py-2 whitespace-nowrap">
                            {row.fragile}
                          </TableCell>
                          <TableCell className="px-2 py-2 whitespace-nowrap">
                            {row.exchange}
                          </TableCell>
                          <TableCell className="px-2 py-2 whitespace-nowrap">
                            {row.pickup}
                          </TableCell>
                          <TableCell className="px-2 py-2 whitespace-nowrap">
                            {row.recouvrement}
                          </TableCell>
                          <TableCell className="px-2 py-2 whitespace-nowrap">
                            {row.stopdesk}
                          </TableCell>
                          <TableCell className="px-2 py-2 whitespace-nowrap">
                            {row.mapLink}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          </div>
        ) : null}
        <DialogFooter className="sticky bottom-0 shrink-0 border-t border-border/70 bg-background pt-4">
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            {t('actions.cancel')}
          </Button>
          {pending ? (
            <Button type="button" variant="outline" onClick={onCancelJob}>
              {t('actions.cancel')}
            </Button>
          ) : null}
          <Button type="button" disabled={pending || !state} onClick={onConfirm}>
            {t(
              state?.mode === 'confirmed'
                ? 'ordersManager.export.confirmAndDispatch'
                : 'ordersManager.export.confirm',
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
