'use client';

import { ResponsiveContainer } from 'recharts';

import { cn } from '../../lib/utils';
import { ScrollableRegion } from '../ui/scrollable-region';

export const AnalyticsResponsiveChart = ResponsiveContainer as React.ComponentType<{
  width: string;
  height: string;
  children: React.ReactNode;
}>;

export function AnalyticsMetricStrip({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      data-analytics-metric-strip
      className={cn(
        'grid grid-cols-2 border-b border-border/60 sm:[grid-template-columns:repeat(auto-fit,minmax(9rem,1fr))]',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function AnalyticsMetricCell({
  label,
  value,
  detail,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  detail?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'min-w-0 border-b border-border/45 px-4 py-4 sm:border-e sm:last:border-e-0 lg:border-b-0',
        className,
      )}
    >
      <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
      <div className="mt-1.5 min-w-0">{value}</div>
      {detail ? <div className="mt-1 text-[11px] text-muted-foreground">{detail}</div> : null}
    </div>
  );
}

export function AnalyticsSection({
  title,
  description,
  action,
  children,
  className,
  ...sectionProps
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
} & Omit<React.ComponentPropsWithoutRef<'section'>, 'title'>) {
  return (
    <section
      className={cn('min-w-0 border-b border-border/60 px-4 py-6 sm:px-6', className)}
      {...sectionProps}
    >
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-[-0.015em]">{title}</h2>
          {description ? (
            <p className="mt-1 max-w-3xl text-sm leading-5 text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {action ? <div className="flex flex-wrap items-center gap-2">{action}</div> : null}
      </header>
      {children}
    </section>
  );
}

export function AnalyticsChartFrame({
  children,
  className = 'h-[19rem]',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn('min-w-0 overflow-hidden', className)}>{children}</div>;
}

export function AnalyticsEmptyState({ children }: { children: React.ReactNode }) {
  return <p className="py-8 text-center text-sm text-muted-foreground">{children}</p>;
}

export function AnalyticsDenseTable({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <ScrollableRegion
      label={label}
      className={cn('max-h-[34rem] min-w-0 overflow-auto', className)}
    >
      <table className="w-full min-w-[46rem] border-collapse text-sm">{children}</table>
    </ScrollableRegion>
  );
}

export function AnalyticsTableHead({ children }: { children: React.ReactNode }) {
  return (
    <thead className="sticky top-0 z-10 border-y border-border/60 bg-background/95 text-start text-[11px] uppercase tracking-[0.08em] text-muted-foreground backdrop-blur">
      {children}
    </thead>
  );
}

export function humanizeAnalyticsKey(value: string) {
  return value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}
