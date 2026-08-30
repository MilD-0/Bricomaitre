import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '../../lib/utils';

const buttonVariants = cva(
  'inline-flex cursor-pointer items-center justify-center gap-2 rounded-[var(--shape-radius-control)] text-sm font-semibold transition-[background-color,color,box-shadow,transform] disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground shadow-[var(--shadow-vapor)] hover:bg-primary/92',
        outline:
          'border border-transparent bg-secondary text-secondary-foreground shadow-[var(--shadow-vapor)] hover:bg-accent hover:text-accent-foreground',
        ghost:
          'bg-transparent text-muted-foreground hover:bg-transparent hover:text-primary hover:underline hover:decoration-2 hover:underline-offset-4',
        destructive:
          'bg-destructive text-destructive-foreground shadow-[var(--shadow-vapor)] hover:bg-destructive/92',
      },
      size: {
        default: 'h-[var(--control-height-default)] px-4 py-2',
        sm: 'h-[var(--control-height-compact)] px-3 text-xs uppercase tracking-[var(--type-tracking-p050)]',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props} />
  ),
);

Button.displayName = 'Button';
