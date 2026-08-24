'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { META_CATALOG_EXPORT_HEADERS } from '../../lib/meta-catalog-shared';
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

type MetaCatalogExportRow = {
  id: string;
  contentId: string;
  title: string;
  description: string;
  availability: string;
  condition: string;
  price: string;
  salePrice: string;
  link: string;
  imageLink: string;
  brand: string;
};

export type MetaCatalogExportPreviewState = {
  title: string;
  fileName: string;
  rows: MetaCatalogExportRow[];
} | null;

type ProductExportAllJob = {
  id: string;
  status: 'running' | 'completed' | 'cancelled' | 'failed';
  fileName: string | null;
  progress: {
    phase: 'counting' | 'loading' | 'processing-images' | 'packaging';
    current: number;
    total: number;
    percentage: number;
  };
  errorMessage: string | null;
  downloadPath: string | null;
};

export type ProductExportJobResponse = { job: ProductExportAllJob | null };

export function MetaCatalogExportDialog({
  state,
  onOpenChange,
  onConfirm,
}: {
  state: MetaCatalogExportPreviewState;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const t = useTranslations();
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
          <DialogTitle>{state?.title ?? t('products.export.previewTitle')}</DialogTitle>
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
            <div className="flex items-center justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setExpandedPreview((current) => !current)}
              >
                {t(
                  expandedPreview
                    ? 'products.export.compactPreview'
                    : 'products.export.fullPreview',
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
                      ? 'min-w-[920px]'
                      : 'min-w-[920px] origin-top-left scale-[0.78]',
                  )}
                >
                  <Table className="text-[11px] leading-tight">
                    <TableHeader>
                      <TableRow>
                        {META_CATALOG_EXPORT_HEADERS.map((header) => (
                          <TableHead key={header} className="px-2 py-2 whitespace-nowrap">
                            {header}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {state.rows.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="px-2 py-2 whitespace-nowrap">{row.id}</TableCell>
                          <TableCell className="px-2 py-2 whitespace-nowrap">
                            {row.contentId}
                          </TableCell>
                          <TableCell className="px-2 py-2 whitespace-nowrap">{row.title}</TableCell>
                          <TableCell className="px-2 py-2">{row.description}</TableCell>
                          <TableCell className="px-2 py-2 whitespace-nowrap">
                            {row.availability}
                          </TableCell>
                          <TableCell className="px-2 py-2 whitespace-nowrap">
                            {row.condition}
                          </TableCell>
                          <TableCell className="px-2 py-2 whitespace-nowrap">{row.price}</TableCell>
                          <TableCell className="px-2 py-2 whitespace-nowrap">
                            {row.salePrice}
                          </TableCell>
                          <TableCell className="px-2 py-2">{row.link}</TableCell>
                          <TableCell className="px-2 py-2">{row.imageLink}</TableCell>
                          <TableCell className="px-2 py-2 whitespace-nowrap">{row.brand}</TableCell>
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
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('actions.cancel')}
          </Button>
          <Button type="button" disabled={!state} onClick={onConfirm}>
            {t('products.export.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
