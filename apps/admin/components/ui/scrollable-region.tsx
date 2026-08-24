import type { ReactNode } from 'react';

import { cn } from '../../lib/utils';

export function ScrollableRegion({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      aria-label={label}
      className={cn(
        'max-w-full overflow-x-auto outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40',
        className,
      )}
      role="region"
      tabIndex={0}
    >
      {children}
    </div>
  );
}
