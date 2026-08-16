import * as React from 'react';

import { cn } from '../../lib/utils';

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'h-10 w-full rounded-[0.75rem] border border-input/15 bg-input px-3 py-1 text-sm text-foreground shadow-[var(--shadow-vapor)] transition-[background-color,box-shadow,border-color] placeholder:text-muted-foreground focus-visible:border-primary/20 focus-visible:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20',
        className,
      )}
      {...props}
    />
  );
}
