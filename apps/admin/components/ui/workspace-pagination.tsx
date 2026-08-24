'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { getPaginationItems } from '../../lib/pagination';
import { cn } from '../../lib/utils';
import { Button } from './button';

export function WorkspacePagination({
  currentPage,
  totalPages,
  onPageChange,
  pending = false,
  className,
}: {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  pending?: boolean;
  className?: string;
}) {
  const t = useTranslations();
  const safeTotalPages = Math.max(1, totalPages);
  const safeCurrentPage = Math.min(safeTotalPages, Math.max(1, currentPage));

  if (safeTotalPages <= 1) return null;

  return (
    <div
      className={cn(
        'flex flex-col gap-3 border-t border-border/60 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4',
        className,
      )}
    >
      <p className="text-sm text-muted-foreground">
        {t('labels.pageOfTotal', { page: safeCurrentPage, total: safeTotalPages })}
      </p>
      <nav
        aria-label={t('labels.goToPageInput')}
        className="flex items-center justify-center gap-1"
      >
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="size-9 shrink-0 px-0"
          aria-label={t('actions.previous')}
          disabled={pending || safeCurrentPage <= 1}
          onClick={() => onPageChange(safeCurrentPage - 1)}
        >
          <ChevronLeft className="size-4 rtl:hidden" aria-hidden="true" />
          <ChevronRight className="hidden size-4 rtl:block" aria-hidden="true" />
        </Button>
        {getPaginationItems(safeCurrentPage, safeTotalPages).map((item) =>
          typeof item === 'number' ? (
            <Button
              key={item}
              type="button"
              size="sm"
              variant={item === safeCurrentPage ? 'default' : 'ghost'}
              className={cn(
                'size-9 shrink-0 px-0 tabular-nums',
                item !== 1 &&
                  item !== safeTotalPages &&
                  Math.abs(item - safeCurrentPage) > 1 &&
                  'hidden sm:inline-flex',
              )}
              aria-label={t('labels.goToPage', { page: item })}
              aria-current={item === safeCurrentPage ? 'page' : undefined}
              disabled={pending}
              onClick={() => onPageChange(item)}
            >
              {item}
            </Button>
          ) : (
            <span
              key={item}
              aria-hidden="true"
              className="hidden size-7 place-items-center text-sm text-muted-foreground sm:grid"
            >
              …
            </span>
          ),
        )}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="size-9 shrink-0 px-0"
          aria-label={t('actions.next')}
          disabled={pending || safeCurrentPage >= safeTotalPages}
          onClick={() => onPageChange(safeCurrentPage + 1)}
        >
          <ChevronRight className="size-4 rtl:hidden" aria-hidden="true" />
          <ChevronLeft className="hidden size-4 rtl:block" aria-hidden="true" />
        </Button>
      </nav>
    </div>
  );
}
