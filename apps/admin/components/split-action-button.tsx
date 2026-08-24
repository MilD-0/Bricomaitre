'use client';

import { ChevronDown } from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';

import { cn } from '../lib/utils';
import { Button } from './ui/button';

export type SplitActionOption = {
  key: string;
  label: string;
  onSelect: () => void | Promise<void>;
  disabled?: boolean;
};

export function SplitActionButton({
  label,
  icon,
  onPrimaryClick,
  variant = 'outline',
  size = 'default',
  compactOnMobile = false,
  primaryDisabled = false,
  options,
}: {
  label: string;
  icon?: ReactNode;
  onPrimaryClick: () => void | Promise<void>;
  variant?: 'default' | 'outline';
  size?: 'default' | 'sm';
  compactOnMobile?: boolean;
  primaryDisabled?: boolean;
  options: SplitActionOption[];
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  if (options.length === 0) {
    return (
      <Button
        type="button"
        size={size}
        variant={variant}
        disabled={primaryDisabled}
        aria-label={label}
        className={compactOnMobile ? 'max-sm:size-10 max-sm:px-0' : undefined}
        onClick={() => void onPrimaryClick()}
      >
        {icon}
        <span className={compactOnMobile ? 'max-sm:sr-only' : undefined}>{label}</span>
      </Button>
    );
  }

  return (
    <div ref={containerRef} className="relative inline-flex">
      <Button
        type="button"
        size={size}
        variant={variant}
        disabled={primaryDisabled}
        aria-label={label}
        className={cn(
          'rounded-e-none border-e border-border/70',
          compactOnMobile && 'max-sm:size-10 max-sm:px-0',
        )}
        onClick={() => void onPrimaryClick()}
      >
        {icon}
        <span className={compactOnMobile ? 'max-sm:sr-only' : undefined}>{label}</span>
      </Button>
      <Button
        type="button"
        size={size}
        variant={variant}
        aria-label={`${label} menu`}
        aria-haspopup="menu"
        aria-expanded={open}
        className="rounded-s-none px-3 max-sm:size-10 max-sm:px-0"
        onClick={() => setOpen((current) => !current)}
      >
        <ChevronDown className="size-4" />
      </Button>
      {open ? (
        <div
          role="menu"
          className="absolute end-0 top-full z-20 mt-2 min-w-48 rounded-2xl border border-border/70 bg-background p-1 shadow-[var(--shadow-vapor)]"
        >
          {options.map((option) => (
            <button
              key={option.key}
              type="button"
              role="menuitem"
              disabled={option.disabled}
              className={cn(
                'flex w-full rounded-xl px-3 py-2 text-start text-sm transition-colors',
                option.disabled ? 'cursor-not-allowed opacity-50' : 'hover:bg-muted/60',
              )}
              onClick={() => {
                setOpen(false);
                void option.onSelect();
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
