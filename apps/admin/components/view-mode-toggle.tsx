'use client';

import { Button } from './ui/button';
import { cn } from '../lib/utils';

export type ViewMode = 'cards' | 'table';

export function ViewModeToggle({
  value,
  onChange,
  cardsLabel,
  tableLabel,
  className,
}: {
  value: ViewMode;
  onChange: (value: ViewMode) => void;
  cardsLabel: string;
  tableLabel: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'inline-flex w-full rounded-[1rem] border border-border/70 bg-muted/20 p-1 sm:w-auto',
        className,
      )}
      role="group"
      aria-label={`${cardsLabel} / ${tableLabel}`}
    >
      <Button
        type="button"
        size="sm"
        variant={value === 'cards' ? 'default' : 'ghost'}
        className="flex-1 rounded-[0.8rem] sm:flex-none"
        aria-pressed={value === 'cards'}
        onClick={() => onChange('cards')}
      >
        {cardsLabel}
      </Button>
      <Button
        type="button"
        size="sm"
        variant={value === 'table' ? 'default' : 'ghost'}
        className="flex-1 rounded-[0.8rem] sm:flex-none"
        aria-pressed={value === 'table'}
        onClick={() => onChange('table')}
      >
        {tableLabel}
      </Button>
    </div>
  );
}
