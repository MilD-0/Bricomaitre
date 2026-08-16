'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

import { cn } from '../lib/utils';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { PendingInline } from './ui/motion';

type TablePaginationControlsProps = {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
};

function buildPageItems(currentPage: number, totalPages: number) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set<number>([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);

  if (currentPage <= 3) {
    pages.add(2);
    pages.add(3);
    pages.add(4);
  }

  if (currentPage >= totalPages - 2) {
    pages.add(totalPages - 1);
    pages.add(totalPages - 2);
    pages.add(totalPages - 3);
  }

  const sortedPages = [...pages]
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((a, b) => a - b);
  const items: Array<number | 'ellipsis'> = [];

  sortedPages.forEach((page, index) => {
    if (index > 0 && page - sortedPages[index - 1]! > 1) {
      items.push('ellipsis');
    }

    items.push(page);
  });

  return items;
}

export function TablePaginationControls({
  currentPage,
  totalPages,
  onPageChange,
  className,
}: TablePaginationControlsProps) {
  const t = useTranslations();
  const [jumpPage, setJumpPage] = useState(String(currentPage));

  useEffect(() => {
    queueMicrotask(() => setJumpPage(String(currentPage)));
  }, [currentPage]);

  if (totalPages <= 1) {
    return null;
  }

  const pageItems = buildPageItems(currentPage, totalPages);
  const transitionToPage = (page: number) => onPageChange(page);

  return (
    <div
      className={cn(
        'flex flex-col gap-3 border-t border-border/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between',
        className,
      )}
    >
      <div className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">
          {t('labels.pageOfTotal', { page: currentPage, total: totalPages })}
        </p>
        <PendingInline active={false} label={t('labels.loading')} />
      </div>

      <div className="flex flex-col gap-3 sm:items-end">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={currentPage <= 1}
            onClick={() => transitionToPage(1)}
          >
            {t('actions.first')}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={currentPage <= 1}
            onClick={() => transitionToPage(currentPage - 1)}
          >
            {t('actions.previous')}
          </Button>

          <div className="flex flex-wrap items-center gap-2">
            {pageItems.map((item, index) =>
              item === 'ellipsis' ? (
                <span
                  key={`ellipsis-${index}`}
                  aria-hidden="true"
                  className="px-1 text-sm text-muted-foreground"
                >
                  ...
                </span>
              ) : (
                <Button
                  key={item}
                  type="button"
                  size="sm"
                  variant={item === currentPage ? 'default' : 'outline'}
                  aria-current={item === currentPage ? 'page' : undefined}
                  aria-label={t('labels.goToPage', { page: item })}
                  onClick={() => transitionToPage(item)}
                >
                  {item}
                </Button>
              ),
            )}
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={currentPage >= totalPages}
            onClick={() => transitionToPage(currentPage + 1)}
          >
            {t('actions.next')}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={currentPage >= totalPages}
            onClick={() => transitionToPage(totalPages)}
          >
            {t('actions.last')}
          </Button>
        </div>

        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const parsedPage = Number.parseInt(jumpPage, 10);

            if (Number.isNaN(parsedPage)) {
              setJumpPage(String(currentPage));
              return;
            }

            transitionToPage(Math.min(totalPages, Math.max(1, parsedPage)));
          }}
        >
          <label className="sr-only" htmlFor="table-pagination-jump">
            {t('labels.goToPageInput')}
          </label>
          <Input
            id="table-pagination-jump"
            type="number"
            inputMode="numeric"
            min={1}
            max={totalPages}
            value={jumpPage}
            onChange={(event) => setJumpPage(event.target.value)}
            className="h-9 w-20"
          />
          <Button type="submit" variant="outline" size="sm">
            {t('actions.go')}
          </Button>
        </form>
      </div>
    </div>
  );
}
