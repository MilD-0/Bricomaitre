'use client';

import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

import { cn } from '../lib/utils';
import type { SortDirection } from '../lib/multi-sort';

type MultiSortHeaderProps = {
  label: string;
  sortState: {
    active: boolean;
    direction?: SortDirection;
    priority?: number;
  };
  onClick: () => void;
  className?: string;
};

export function MultiSortHeader({ label, sortState, onClick, className }: MultiSortHeaderProps) {
  const Icon = !sortState.active
    ? ArrowUpDown
    : sortState.direction === 'asc'
      ? ArrowUp
      : ArrowDown;

  return (
    <button
      type="button"
      className={cn(
        'inline-flex cursor-pointer items-center gap-2 text-left font-medium',
        className,
      )}
      onClick={onClick}
    >
      <span>{label}</span>
      <Icon className="size-4 shrink-0" />
    </button>
  );
}
