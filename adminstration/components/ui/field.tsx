import * as React from 'react';

import { cn } from '../../lib/utils';

export function FieldGroup({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-4', className)} {...props} />;
}

export function FieldSet({ className, ...props }: React.FieldsetHTMLAttributes<HTMLFieldSetElement>) {
  return <fieldset className={cn('flex flex-col gap-4', className)} {...props} />;
}

export function Field({ className, orientation = 'vertical', ...props }: React.HTMLAttributes<HTMLDivElement> & { orientation?: 'vertical' | 'horizontal' }) {
  return <div data-slot="field" className={cn('flex gap-2', orientation === 'horizontal' ? 'items-center' : 'flex-col', className)} {...props} />;
}

export function FieldLabel({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('text-[0.75rem] font-semibold uppercase tracking-[0.05em] text-muted-foreground', className)} {...props} />;
}

export function FieldDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-sm text-muted-foreground', className)} {...props} />;
}

export function FieldError({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-xs text-destructive', className)} {...props} />;
}

export function FieldTitle({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return <legend className={cn('text-[0.75rem] font-semibold uppercase tracking-[0.05em] text-muted-foreground', className)} {...props} />;
}

export function FieldLegend({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return <legend className={cn('text-[0.75rem] font-semibold uppercase tracking-[0.05em] text-muted-foreground', className)} {...props} />;
}

export function FieldContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-1', className)} {...props} />;
}

export function FieldSeparator({ className, ...props }: React.HTMLAttributes<HTMLHRElement>) {
  return <hr className={cn('border-0 bg-border/15', className)} {...props} />;
}
