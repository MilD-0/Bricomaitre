import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '../../lib/utils';

const buttonVariants = cva(
  'inline-flex cursor-pointer items-center justify-center gap-2 rounded-[0.75rem] text-sm font-semibold transition-[background-color,color,box-shadow,transform] disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-[var(--shadow-vapor)] hover:bg-primary/92',
        outline: 'border border-transparent bg-secondary text-secondary-foreground shadow-[var(--shadow-vapor)] hover:bg-accent hover:text-accent-foreground',
        ghost: 'bg-transparent text-muted-foreground hover:bg-transparent hover:text-primary hover:underline hover:decoration-2 hover:underline-offset-4',
        destructive: 'bg-destructive text-destructive-foreground shadow-[var(--shadow-vapor)] hover:bg-destructive/92',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-8 px-3 text-xs uppercase tracking-[0.05em]',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}
