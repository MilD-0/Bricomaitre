import * as React from 'react';

import { cn } from '../../lib/utils';

type SwitchProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> & {
  checked: boolean;
  onCheckedChange?: (checked: boolean) => void;
};

export function Switch({ checked, className, onCheckedChange, ...props }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      data-state={checked ? 'checked' : 'unchecked'}
      className={cn(
        'inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-transparent bg-secondary shadow-[inset_0_0_0_1px_hsl(var(--border)/0.18)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=checked]:bg-primary data-[state=checked]:shadow-none',
        className,
      )}
      onClick={() => onCheckedChange?.(!checked)}
      {...props}
    >
      <span
        className={cn(
          'pointer-events-none block size-5 rounded-full bg-card shadow-[0_1px_3px_hsl(var(--foreground)/0.12)] transition-transform data-[state=checked]:translate-x-5',
          checked ? 'translate-x-5' : 'translate-x-0.5',
        )}
        data-state={checked ? 'checked' : 'unchecked'}
      />
    </button>
  );
}
