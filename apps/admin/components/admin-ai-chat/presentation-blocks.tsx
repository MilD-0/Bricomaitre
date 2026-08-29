'use client';

import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';

import type { AdminAiToolResult } from '../../lib/admin-ai-result-view';
import {
  type AdminAiPresentationPlan,
  adminAiPresentationToolResult,
  adminAiPresentationValueAtPath,
} from '../../lib/admin-ai-presentation';
import { adminAiToolPresentation } from '../../lib/admin-ai-tool-presentation';
import { AdminAiResultTable } from './result-table';

type AnalyticsMetric = {
  key?: string;
  name?: string;
  value?: unknown;
  previous?: unknown;
  changePct?: number | null;
  unit?: string;
  estimated?: boolean;
};

type AnalyticsSource = {
  key?: string;
  state?: string;
  coveragePct?: number | null;
  throughDate?: string | null;
};

function label(value: string) {
  return value
    .replaceAll('_', ' ')
    .replaceAll('.', ' · ')
    .replace(/([a-z\d])([A-Z])/gu, '$1 $2')
    .toLocaleLowerCase();
}

function analyticsObjects(value: unknown, depth = 0): Record<string, unknown>[] {
  if (depth > 5 || value == null) return [];
  if (Array.isArray(value)) return value.flatMap((item) => analyticsObjects(item, depth + 1));
  if (typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  return [
    ...(record.kind === 'analytics' || record.kind === 'ai_stats' ? [record] : []),
    ...Object.values(record).flatMap((item) => analyticsObjects(item, depth + 1)),
  ];
}

function scalar(value: unknown) {
  return value == null || ['string', 'number', 'boolean'].includes(typeof value);
}

export function AdminAiPresentationBlocks({
  plan,
  evidence,
  onNavigate,
}: {
  plan: AdminAiPresentationPlan | null | undefined;
  evidence: readonly AdminAiToolResult[];
  onNavigate: () => void;
}) {
  const locale = useLocale();
  const t = useTranslations();
  if (!plan) return null;

  const formatValue = (value: unknown, unit?: string) => {
    if (typeof value === 'number') {
      if (unit === 'dzd' || unit === 'eur') {
        return new Intl.NumberFormat(locale, {
          style: 'currency',
          currency: unit.toUpperCase(),
          maximumFractionDigits: 2,
        }).format(value);
      }
      if (unit === 'usd') {
        return new Intl.NumberFormat(locale, {
          style: 'currency',
          currency: 'USD',
          maximumFractionDigits: 4,
        }).format(value);
      }
      if (unit === 'milliseconds') {
        return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value)} ms`;
      }
      const formatted = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
      return unit === 'percent' ? `${formatted}%` : formatted;
    }
    if (value == null) return '—';
    if (typeof value === 'boolean') return value ? t('aiChat.yes') : t('aiChat.no');
    return String(value);
  };

  return (
    <div className="mt-3 space-y-3" data-slot="admin-ai-presentation-blocks">
      {plan.blocks.map((block, index) => {
        const result = adminAiPresentationToolResult(evidence, block);
        if (!result) return null;

        if (block.kind === 'metrics') {
          const metrics = analyticsObjects(result.output)
            .flatMap((analytics) =>
              Array.isArray(analytics.metrics) ? (analytics.metrics as AnalyticsMetric[]) : [],
            )
            .filter((metric) => {
              const key = metric.name ?? metric.key;
              return key
                ? block.keys.includes(key) || block.keys.includes(metric.key ?? '')
                : false;
            })
            .filter((metric, metricIndex, rows) => {
              const key = metric.name ?? metric.key;
              return (
                rows.findIndex((candidate) => (candidate.name ?? candidate.key) === key) ===
                metricIndex
              );
            })
            .slice(0, 6);
          if (!metrics.length) return null;
          return (
            <section
              key={`${block.kind}-${index}`}
              className="overflow-hidden rounded-xl bg-secondary/35"
            >
              {block.title ? (
                <p className="px-3 pt-2.5 text-xs font-medium text-muted-foreground">
                  {block.title}
                </p>
              ) : null}
              <div className="grid grid-cols-2 gap-px bg-border/45 sm:grid-cols-3">
                {metrics.map((metric) => (
                  <div key={metric.name ?? metric.key} className="min-w-0 bg-card/85 px-3 py-2.5">
                    <p className="truncate text-[0.66rem] capitalize text-muted-foreground">
                      {label(metric.name ?? metric.key ?? '')}
                    </p>
                    <p className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">
                      {formatValue(metric.value, metric.unit)}
                    </p>
                    {typeof metric.changePct === 'number' ? (
                      <p className="mt-0.5 text-[0.64rem] text-muted-foreground">
                        {metric.changePct >= 0 ? '+' : ''}
                        {formatValue(metric.changePct, 'percent')}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
          );
        }

        if (block.kind === 'source_health') {
          const sources = analyticsObjects(result.output)
            .flatMap((analytics) =>
              Array.isArray(analytics.sources) ? (analytics.sources as AnalyticsSource[]) : [],
            )
            .filter((source) => source.key && block.keys.includes(source.key))
            .filter(
              (source, sourceIndex, rows) =>
                rows.findIndex((candidate) => candidate.key === source.key) === sourceIndex,
            )
            .slice(0, 6);
          if (!sources.length) return null;
          return (
            <section key={`${block.kind}-${index}`} className="flex flex-wrap items-center gap-2">
              {block.title ? (
                <p className="w-full text-xs font-medium text-muted-foreground">{block.title}</p>
              ) : null}
              {sources.map((source) => (
                <span
                  key={source.key}
                  className="rounded-full bg-secondary px-2.5 py-1 text-[0.68rem] text-muted-foreground"
                >
                  <span className="font-medium capitalize text-foreground">
                    {label(source.key ?? '')}
                  </span>
                  {source.state ? ` · ${label(source.state)}` : ''}
                  {typeof source.coveragePct === 'number'
                    ? ` · ${formatValue(source.coveragePct, 'percent')}`
                    : ''}
                </span>
              ))}
            </section>
          );
        }

        if (block.kind === 'records') {
          const value = adminAiPresentationValueAtPath(result.output, block.path);
          if (!Array.isArray(value)) return null;
          const rows = value
            .filter(
              (row): row is Record<string, unknown> =>
                Boolean(row) && typeof row === 'object' && !Array.isArray(row),
            )
            .slice(0, block.limit);
          const columns = block.columns.filter((column) => rows.some((row) => scalar(row[column])));
          if (!rows.length || !columns.length) return null;
          return (
            <section
              key={`${block.kind}-${index}`}
              className="overflow-hidden rounded-xl border border-border/55 bg-card/70"
            >
              {block.title ? (
                <p className="px-3 pt-2.5 text-xs font-medium text-foreground">{block.title}</p>
              ) : null}
              <AdminAiResultTable
                table={{ path: block.path, rows, columns, available: value.length }}
                formatLabel={label}
                formatValue={formatValue}
                showingRows={(shown, available) => t('aiChat.showingRows', { shown, available })}
                compact
              />
            </section>
          );
        }

        const presentation = adminAiToolPresentation(result.toolName, result.output, locale);
        if (!presentation.href || !presentation.destinationKey) return null;
        return (
          <Link
            key={`${block.kind}-${index}`}
            href={presentation.href}
            onClick={onNavigate}
            className="inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
          >
            {block.title ?? t(`aiChat.toolDestinations.${presentation.destinationKey}`)}
            <ArrowUpRight className="size-3.5 rtl:-scale-x-100" />
          </Link>
        );
      })}
    </div>
  );
}
