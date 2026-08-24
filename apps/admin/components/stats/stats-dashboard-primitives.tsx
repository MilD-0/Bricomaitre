import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

import { cn } from '../../lib/utils';
import { Card } from '../ui/card';
import type { ChartConfig } from '../ui/chart';
import { Skeleton } from '../ui/skeleton';

export const feeBreakdownConfig = {
  livraison: { label: 'Delivery', color: 'hsl(var(--chart-1))' },
  commission: { label: 'Commission', color: 'hsl(var(--chart-2))' },
  poids: { label: 'Weight', color: 'hsl(var(--chart-3))' },
  extra: { label: 'Extra', color: 'hsl(var(--chart-4))' },
  sms: { label: 'SMS', color: 'hsl(var(--chart-5))' },
  stockage: { label: 'Storage', color: 'hsl(var(--chart-1))' },
  publicite: { label: 'Ads', color: 'hsl(var(--chart-2))' },
} satisfies ChartConfig;

export const topProductsConfig = {
  units: { label: 'Units sold', color: 'hsl(var(--chart-1))' },
} satisfies ChartConfig;

export const segmentConfig = {
  revenue: { label: 'Revenue', color: 'hsl(var(--chart-1))' },
  profit: { label: 'Profit', color: 'hsl(var(--chart-2))' },
} satisfies ChartConfig;

export const geographyComposedConfig = {
  orders: { label: 'Orders', color: 'hsl(var(--chart-4))' },
  revenue: { label: 'Revenue', color: 'hsl(var(--chart-2))' },
} satisfies ChartConfig;

export const geographyProfitConfig = {
  profit: { label: 'Profit', color: 'hsl(var(--chart-2))' },
} satisfies ChartConfig;

export const geographyAverageConfig = {
  avgOrder: { label: 'Average order', color: 'hsl(var(--chart-3))' },
} satisfies ChartConfig;

export const timeOrdersConfig = {
  orders: { label: 'Orders', color: 'hsl(var(--chart-1))' },
} satisfies ChartConfig;

export function formatCurrency(locale: string, value: number) {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'DZD',
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatNumber(locale: string, value: number) {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value);
}

export function formatPercent(locale: string, value: number) {
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value)}%`;
}

export function formatUsd(locale: string, value: number | null) {
  if (value == null) return '—';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 4,
  }).format(value);
}

export function formatMilliseconds(locale: string, value: number) {
  if (value < 1_000) return `${formatNumber(locale, value)} ms`;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value / 1_000)} s`;
}

export function formatDate(locale: string, value: string | null) {
  if (!value) {
    return '—';
  }

  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(value));
}

export function formatDateTime(locale: string, value: string | null) {
  if (!value) {
    return '—';
  }

  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function formatBucket(locale: string, value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(
      new Date(`${value}T00:00:00Z`),
    );
  }

  if (/^\d{4}-\d{2}$/.test(value)) {
    return new Intl.DateTimeFormat(locale, { month: 'short', year: '2-digit' }).format(
      new Date(`${value}-01T00:00:00Z`),
    );
  }

  return value;
}

export function MetricCard({
  accent,
  icon: Icon,
  title,
  value,
}: {
  accent: string;
  icon: LucideIcon;
  title: string;
  value: string;
}) {
  return (
    <Card className="group relative min-w-0 overflow-hidden rounded-[1.4rem] border-border/60 bg-linear-to-br from-card via-card to-muted/30 p-0 transition-transform duration-300 hover:-translate-y-0.5 sm:rounded-[1.6rem]">
      <div className={cn('absolute inset-x-0 top-0 h-1.5', accent)} />
      <div className="flex items-start gap-2 p-3.5 sm:gap-3 sm:p-5">
        <div className="shrink-0 rounded-xl bg-background/80 p-2 shadow-sm sm:rounded-2xl sm:p-3">
          <Icon className="size-4 text-foreground sm:size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="break-words text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground sm:tracking-[0.18em]">
            {title}
          </p>
          <p className="mt-1.5 break-words text-lg font-semibold tracking-tight text-foreground sm:mt-2 sm:text-2xl">
            {value}
          </p>
        </div>
      </div>
    </Card>
  );
}

export function StatBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 overflow-hidden rounded-[1.15rem] border border-border/70 bg-muted/20 p-3.5 sm:rounded-[1.35rem] sm:p-4">
      <p className="break-words text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground sm:tracking-[0.16em]">
        {label}
      </p>
      <p className="mt-2 break-words text-lg font-semibold leading-snug text-foreground sm:text-xl">
        {value}
      </p>
    </div>
  );
}

export function MobileBreakdownCard({
  children,
  subtitle,
  title,
}: {
  children: ReactNode;
  subtitle?: string;
  title: string;
}) {
  return (
    <article
      data-slot="stats-mobile-breakdown"
      className="min-w-0 rounded-[1.15rem] border border-border/70 bg-muted/20 p-3.5"
    >
      <h3 className="break-words font-semibold text-foreground">{title}</h3>
      {subtitle ? (
        <p className="mt-1 break-words text-xs leading-5 text-muted-foreground">{subtitle}</p>
      ) : null}
      {children}
    </article>
  );
}

export function MobileBreakdownMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="break-words text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

export function CostRow({
  bold,
  highlight,
  label,
  total,
  value,
}: {
  bold?: boolean;
  highlight?: boolean;
  label: string;
  total: number;
  value: number;
}) {
  const percentage = total > 0 ? (value / total) * 100 : 0;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_96px_76px] items-center gap-3 py-2">
      <div className="min-w-0">
        <p
          className={cn(
            'text-sm text-foreground',
            bold && 'font-semibold',
            highlight && 'text-rose-600',
          )}
        >
          {label}
        </p>
        <div className="mt-2 h-2 rounded-full bg-muted">
          <div
            className={cn(
              'h-2 rounded-full bg-[hsl(var(--chart-1))]',
              bold && 'bg-foreground',
              highlight && 'bg-rose-500',
            )}
            style={{ width: `${Math.min(percentage, 100)}%` }}
          />
        </div>
      </div>
      <p
        className={cn(
          'text-right text-sm tabular-nums text-foreground',
          bold && 'font-semibold',
          highlight && 'text-rose-600',
        )}
      >
        {value.toLocaleString()}
      </p>
      <p className="text-right text-xs tabular-nums text-muted-foreground">
        {percentage.toFixed(1)}%
      </p>
    </div>
  );
}

export function SectionCard({
  action,
  children,
  title,
}: {
  action?: ReactNode;
  children: ReactNode;
  title: string;
}) {
  return (
    <Card
      data-slot="stats-section-card"
      className="min-w-0 max-w-full rounded-[1.5rem] border-border/60 bg-card p-4 sm:rounded-[2rem] sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="break-words text-lg font-semibold tracking-tight text-foreground sm:text-xl">
            {title}
          </h2>
        </div>
        {action}
      </div>
      <div className="mt-5">{children}</div>
    </Card>
  );
}

export function StatsPageSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Card className="rounded-[2rem] border-border/60 bg-card p-5 sm:p-6">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-9 w-52" />
            </div>
            <Skeleton className="h-9 w-28" />
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full w-2/5 animate-pulse rounded-full bg-primary/60" />
          </div>
          <div className="grid gap-2 sm:grid-cols-5">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-9 rounded-xl" />
            ))}
          </div>
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-32 rounded-[1.75rem]" />
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="rounded-[2rem] border-border/60 p-5 sm:p-6">
          <div className="flex flex-col gap-4">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-[320px] rounded-[1.5rem]" />
          </div>
        </Card>
        <Card className="rounded-[2rem] border-border/60 p-5 sm:p-6">
          <div className="flex flex-col gap-4">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-[320px] rounded-[1.5rem]" />
          </div>
        </Card>
      </div>

      <Card className="rounded-[2rem] border-border/60 p-5 sm:p-6">
        <div className="flex flex-col gap-4">
          <Skeleton className="h-6 w-56" />
          <Skeleton className="h-16 rounded-[1.4rem]" />
          <Skeleton className="h-16 rounded-[1.4rem]" />
          <Skeleton className="h-16 rounded-[1.4rem]" />
        </div>
      </Card>
    </div>
  );
}
