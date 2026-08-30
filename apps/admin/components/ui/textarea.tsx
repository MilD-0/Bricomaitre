import * as React from 'react';

import { cn } from '../../lib/utils';

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'min-h-[var(--control-height-textarea)] w-full rounded-[var(--shape-radius-control)] border border-input/15 bg-input px-3 py-2 text-sm text-foreground shadow-[var(--shadow-vapor)] transition-[background-color,box-shadow,border-color] placeholder:text-muted-foreground focus-visible:border-primary/20 focus-visible:bg-background focus-visible:outline-none focus-visible:ring-[length:var(--focus-ring-width)] focus-visible:ring-ring/20',
      className,
    )}
    {...props}
  />
));

Textarea.displayName = 'Textarea';
