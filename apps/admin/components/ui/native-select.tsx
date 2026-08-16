'use client';

import * as React from 'react';

import { cn } from '../../lib/utils';

export function NativeSelect({
  className,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      data-slot="native-select"
      className={cn(
        'flex h-10 w-full cursor-pointer rounded-[0.75rem] border border-input/15 bg-input px-3 py-1 text-sm text-foreground shadow-[var(--shadow-vapor)] transition-[background-color,box-shadow,border-color] focus-visible:border-primary/20 focus-visible:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

export function NativeSelectOption({
  children,
  ...props
}: React.OptionHTMLAttributes<HTMLOptionElement>) {
  return <option {...props}>{children}</option>;
}

export function NativeSelectOptGroup({
  children,
  ...props
}: React.OptgroupHTMLAttributes<HTMLOptGroupElement>) {
  return <optgroup {...props}>{children}</optgroup>;
}
