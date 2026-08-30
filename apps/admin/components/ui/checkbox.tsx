'use client';

import * as React from 'react';

import { cn } from '../../lib/utils';

export function Checkbox({
  className,
  type = 'checkbox',
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type={type}
      data-slot="checkbox"
      className={cn(
        'size-4 shrink-0 cursor-pointer rounded-[var(--shape-radius-compact)] border border-input/15 bg-input shadow-[var(--shadow-vapor)] transition-colors focus-visible:outline-none focus-visible:ring-[length:var(--focus-ring-width)] focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}
