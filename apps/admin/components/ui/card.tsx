import * as React from 'react';

import { cn } from '../../lib/utils';

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-[var(--shape-radius-control)] bg-card p-4 text-card-foreground shadow-[var(--shadow-vapor)]',
        className,
      )}
      {...props}
    />
  );
}
