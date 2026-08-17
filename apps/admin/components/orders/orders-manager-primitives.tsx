'use client';

import { useTranslations } from 'next-intl';

import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { Skeleton } from '../ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';

export function OrdersTableSkeleton() {
  return (
    <div className="hidden overflow-x-auto lg:block">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {Array.from({ length: 10 }).map((_, index) => (
              <TableHead key={index}>
                <Skeleton className="h-4 w-full max-w-24" />
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 5 }).map((_, rowIndex) => (
            <TableRow key={rowIndex}>
              {Array.from({ length: 10 }).map((__, cellIndex) => (
                <TableCell key={cellIndex}>
                  <Skeleton className="h-9 w-full" />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function OrdersMobileSkeleton() {
  return (
    <div className="grid gap-3 px-4 pb-4 lg:hidden">
      {Array.from({ length: 3 }).map((_, index) => (
        <Card key={index} className="rounded-[1.5rem] border border-border/70 p-4">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="mt-2 h-4 w-28" />
          <Skeleton className="mt-4 h-20 w-full" />
          <Skeleton className="mt-3 h-20 w-full" />
          <div className="mt-3 flex gap-2">
            <Skeleton className="h-9 flex-1" />
            <Skeleton className="h-9 flex-1" />
            <Skeleton className="h-9 flex-1" />
          </div>
        </Card>
      ))}
    </div>
  );
}

export function NoAnswerCounter({
  count,
  disabled,
  onDecrease,
  onIncrease,
  compact = false,
}: {
  count: number;
  disabled: boolean;
  onDecrease: () => void;
  onIncrease: () => void;
  compact?: boolean;
}) {
  const t = useTranslations();

  return (
    <div
      className={`mt-2 flex items-center ${compact ? 'gap-2' : 'justify-between gap-3 rounded-xl border border-border/70 p-2'}`}
    >
      <span className="text-sm text-muted-foreground">
        {t('ordersManager.status.noAnswerCounter', { count })}
      </span>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled || count <= 1}
          onClick={onDecrease}
          aria-label={t('ordersManager.status.decreaseNoAnswer', { count: Math.max(count - 1, 1) })}
        >
          -
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={onIncrease}
          aria-label={t('ordersManager.status.increaseNoAnswer', { count: count + 1 })}
        >
          +
        </Button>
      </div>
    </div>
  );
}
