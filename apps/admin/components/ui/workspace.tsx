import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';

import { cn } from '../../lib/utils';

type WorkspaceElementProps = ComponentProps<'div'>;

export function WorkspaceFrame({ className, ...props }: WorkspaceElementProps) {
  return (
    <div
      className={cn('-mx-1 min-w-0 sm:-mx-2 lg:-mx-4', className)}
      data-workspace-frame=""
      {...props}
    />
  );
}

export function WorkspaceHeader({ className, ...props }: ComponentProps<'header'>) {
  return (
    <header
      className={cn(
        'flex min-h-14 flex-wrap items-center justify-between gap-3 border-b border-border/60 px-3 py-3 sm:px-4 lg:min-h-[4.75rem] lg:px-5',
        className,
      )}
      data-workspace-header=""
      {...props}
    />
  );
}

export interface WorkspaceHeadingProps {
  title: ReactNode;
  meta?: ReactNode;
  description?: ReactNode;
  showTitleOnMobile?: boolean;
  className?: string;
}

export function WorkspaceHeading({
  title,
  meta,
  description,
  showTitleOnMobile = false,
  className,
}: WorkspaceHeadingProps) {
  return (
    <div className={cn('min-w-0', className)} data-workspace-heading="">
      <div className="flex min-w-0 items-baseline gap-2">
        <h1
          className={cn(
            'min-w-0 truncate font-semibold tracking-[-0.025em] text-foreground lg:text-3xl',
            showTitleOnMobile ? 'text-xl' : 'sr-only lg:not-sr-only',
          )}
        >
          {title}
        </h1>
        {meta !== undefined && meta !== null ? (
          <span className="shrink-0 text-sm tabular-nums text-muted-foreground">{meta}</span>
        ) : null}
      </div>
      {description !== undefined && description !== null ? (
        <div className="mt-0.5 text-xs text-muted-foreground sm:text-sm">{description}</div>
      ) : null}
    </div>
  );
}

export function WorkspaceActions({ className, ...props }: WorkspaceElementProps) {
  return (
    <div
      className={cn('ms-auto flex flex-wrap items-center justify-end gap-2', className)}
      data-workspace-actions=""
      {...props}
    />
  );
}

export function WorkspaceNavigation({ className, ...props }: ComponentProps<'nav'>) {
  return (
    <nav
      className={cn(
        'flex min-h-12 items-center gap-1 overflow-x-auto border-b border-border/60 px-3 py-2 sm:px-4 lg:px-5',
        className,
      )}
      data-workspace-navigation=""
      {...props}
    />
  );
}

export interface WorkspaceNavigationLinkProps extends ComponentProps<typeof Link> {
  active?: boolean;
}

export function WorkspaceNavigationLink({
  active = false,
  className,
  ...props
}: WorkspaceNavigationLinkProps) {
  return (
    <Link
      aria-current={active ? 'page' : undefined}
      className={cn(
        'shrink-0 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
        active && 'bg-primary/10 text-foreground',
        className,
      )}
      {...props}
    />
  );
}

export function WorkspaceToolbar({ className, ...props }: WorkspaceElementProps) {
  return (
    <div
      className={cn('border-b border-border/60 px-3 py-3 sm:px-4 lg:px-5', className)}
      data-workspace-toolbar=""
      {...props}
    />
  );
}
