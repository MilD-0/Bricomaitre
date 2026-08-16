import * as React from 'react';

import { cn } from '../../lib/utils';

export function Separator({
  className,
  orientation = 'horizontal',
  ...props
}: React.HTMLAttributes<HTMLHRElement> & { orientation?: 'horizontal' | 'vertical' }) {
  return (
    <hr
      role="separator"
      aria-orientation={orientation}
      className={cn(
        orientation === 'horizontal'
          ? 'h-px w-full border-0 bg-border/15'
          : 'h-full w-px border-0 bg-border/15',
        className,
      )}
      {...props}
    />
  );
}
