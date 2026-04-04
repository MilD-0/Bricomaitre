'use client';

import * as React from 'react';
import {
  Legend as RechartsLegend,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
} from 'recharts';

import { cn } from '../../lib/utils';

export type ChartConfig = Record<string, { label?: React.ReactNode; color?: string }>;

type ChartContextValue = {
  config: ChartConfig;
};

const ChartContext = React.createContext<ChartContextValue | null>(null);
const ResponsiveContainerCompat = ResponsiveContainer as React.ComponentType<{
  width: string;
  height: string;
  children: React.ReactNode;
}>;

function useChart() {
  const context = React.useContext(ChartContext);

  if (!context) {
    throw new Error('Chart components must be rendered inside ChartContainer.');
  }

  return context;
}

function ChartStyle({ chartId, config }: { chartId: string; config: ChartConfig }) {
  const colorRules = Object.entries(config)
    .filter(([, value]) => Boolean(value.color))
    .map(([key, value]) => `[data-chart="${chartId}"] { --color-${key}: ${value.color}; }`)
    .join('\n');

  if (!colorRules) {
    return null;
  }

  return <style>{colorRules}</style>;
}

export function ChartContainer({
  children,
  className,
  config,
}: {
  children: React.ReactElement;
  className?: string;
  config: ChartConfig;
}) {
  const reactId = React.useId();
  const chartId = React.useMemo(() => `chart-${reactId.replace(/:/g, '')}`, [reactId]);

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        data-chart={chartId}
        className={cn(
          'h-[260px] w-full rounded-[1.75rem] border border-border/60 bg-linear-to-br from-background via-background to-muted/30 p-3 shadow-sm sm:h-[320px]',
          className,
        )}
      >
        <ChartStyle chartId={chartId} config={config} />
        <ResponsiveContainerCompat width="100%" height="100%">
          {children}
        </ResponsiveContainerCompat>
      </div>
    </ChartContext.Provider>
  );
}

export const ChartTooltip = RechartsTooltip;
export const ChartLegend = RechartsLegend;

export function ChartTooltipContent({
  active,
  className,
  formatter,
  label,
  labelFormatter,
  payload,
}: {
  active?: boolean;
  className?: string;
  formatter?: (value: number) => React.ReactNode;
  label?: React.ReactNode;
  labelFormatter?: (label: React.ReactNode, payload: Array<{ value?: unknown }>) => React.ReactNode;
  payload?: Array<{
    color?: string;
    dataKey?: string | number;
    name?: string | number;
    value?: unknown;
  }>;
} & {
  className?: string;
}) {
  const { config } = useChart();

  if (!active || !payload?.length) {
    return null;
  }

  return (
    <div className={cn('min-w-40 rounded-2xl border border-border/70 bg-background/95 p-3 shadow-xl backdrop-blur', className)}>
      {label !== undefined ? (
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {labelFormatter ? labelFormatter(label, payload) : label}
        </p>
      ) : null}
      <div className="flex flex-col gap-2">
        {payload.map((item) => {
          const key = typeof item.dataKey === 'string' ? item.dataKey : String(item.name ?? '');
          const itemConfig = config[key];
          const value = typeof item.value === 'number' ? item.value : Number(item.value ?? 0);

          return (
            <div key={`${key}-${item.name}`} className="flex items-center justify-between gap-3 text-sm">
              <div className="flex items-center gap-2">
                <span
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: item.color ?? itemConfig?.color ?? 'currentColor' }}
                />
                <span className="text-muted-foreground">{itemConfig?.label ?? item.name ?? key}</span>
              </div>
              <span className="font-semibold text-foreground">
                {formatter ? formatter(value) : value.toLocaleString()}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ChartLegendContent({ className, payload }: { className?: string; payload?: Array<{ color?: string; dataKey?: string | number; value?: string | number }> }) {
  const { config } = useChart();

  if (!payload?.length) {
    return null;
  }

  return (
    <div className={cn('flex flex-wrap items-center gap-3 pt-3 text-xs text-muted-foreground', className)}>
      {payload.map((item) => {
        const key = typeof item.dataKey === 'string' ? item.dataKey : String(item.value ?? '');
        const itemConfig = config[key];

        return (
          <div key={key} className="flex items-center gap-2">
            <span
              className="size-2.5 rounded-full"
              style={{ backgroundColor: item.color ?? itemConfig?.color ?? 'currentColor' }}
            />
            <span>{itemConfig?.label ?? item.value ?? key}</span>
          </div>
        );
      })}
    </div>
  );
}
