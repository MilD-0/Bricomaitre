'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bar, CartesianGrid, ComposedChart, Line, LineChart, XAxis, YAxis } from 'recharts';
import {
  Activity,
  CalendarDays,
  CircleDollarSign,
  Download,
  Pencil,
  RefreshCcw,
  Settings2,
  Target,
  Trash2,
  TrendingUp,
  WalletCards,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from 'react';

import { requestJson as request } from '../../lib/admin-api';
import type { getProfitTrackerReport } from '../../lib/profit-tracker';
import { toast } from '../../lib/toast';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '../ui/chart';
import { Input } from '../ui/input';
import { NativeSelect, NativeSelectOption } from '../ui/native-select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import {
  formatBucket,
  formatCurrency,
  formatDateTime,
  formatNumber,
  MetricCard,
  SectionCard,
  StatsPageSkeleton,
} from './stats-dashboard-primitives';

export type ProfitTrackerReport = Awaited<ReturnType<typeof getProfitTrackerReport>>;

type RangeKey = '7d' | '14d' | '30d' | '90d' | 'year' | 'all' | 'custom';
type ActiveRange = { range: RangeKey; startDate?: string; endDate?: string };
type ReportResponse = { data: ProfitTrackerReport };

const RANGE_KEYS: RangeKey[] = ['7d', '14d', '30d', '90d', 'year', 'all', 'custom'];

function queryString(range: ActiveRange) {
  const params = new URLSearchParams({ range: range.range });
  if (range.range === 'custom' && range.startDate && range.endDate) {
    params.set('startDate', range.startDate);
    params.set('endDate', range.endDate);
  }
  return params.toString();
}

function optionalNumber(value: string) {
  if (value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function formatRatio(locale: string, value: number | null) {
  return value == null
    ? '—'
    : `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value)}×`;
}

function formatEur(locale: string, value: number) {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2,
  }).format(value);
}

function Field({ children, label }: { children: ReactNode; label: string }) {
  return (
    <label className="grid min-w-0 gap-1.5 text-sm font-medium text-foreground">
      <span>{label}</span>
      {children}
    </label>
  );
}

function EmptyRows({ colSpan, label }: { colSpan: number; label: string }) {
  return (
    <TableRow>
      <TableCell className="py-10 text-center text-muted-foreground" colSpan={colSpan}>
        {label}
      </TableCell>
    </TableRow>
  );
}

export function ProfitTrackerDashboard({
  description,
  initialData,
  surface = 'full',
  title,
}: {
  description: string;
  initialData?: ProfitTrackerReport | null;
  surface?: 'full' | 'costs';
  title: string;
}) {
  const locale = useLocale();
  const t = useTranslations('statsDashboard');
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedRange = searchParams.get('range') as RangeKey | null;
  const initialRange =
    requestedRange && RANGE_KEYS.includes(requestedRange) ? requestedRange : '30d';
  const requestedStart = searchParams.get('startDate') ?? '';
  const requestedEnd = searchParams.get('endDate') ?? '';
  const hasValidCustom =
    initialRange === 'custom' &&
    Boolean(requestedStart) &&
    Boolean(requestedEnd) &&
    requestedStart <= requestedEnd;
  const [selectedRange, setSelectedRange] = useState<RangeKey>(
    hasValidCustom ? 'custom' : initialRange === 'custom' ? '30d' : initialRange,
  );
  const [activeRange, setActiveRange] = useState<ActiveRange>(
    hasValidCustom
      ? { range: 'custom', startDate: requestedStart, endDate: requestedEnd }
      : { range: initialRange === 'custom' ? '30d' : initialRange },
  );
  const [customStart, setCustomStart] = useState(
    requestedStart || initialData?.filters.startDate || '',
  );
  const [customEnd, setCustomEnd] = useState(requestedEnd || initialData?.filters.endDate || '');
  const [settingsForm, setSettingsForm] = useState({
    fxRate: String(initialData?.settings.fxRate ?? 280),
    defaultReturnRate: String(initialData?.settings.defaultReturnRate ?? 10),
    restFrom: initialData?.settings.restFrom ?? '',
  });
  const [dayForm, setDayForm] = useState({
    date: initialData?.filters.endDate ?? '',
    grossProfitDzd: '',
    returnRatePct: '',
    confirmedOrders: '',
    note: '',
  });
  const [costForm, setCostForm] = useState({
    name: '',
    amountDzd: '',
    period: 'monthly' as 'monthly' | 'once',
    startDate: initialData?.filters.endDate ?? '',
    endDate: '',
  });
  const [editingCostId, setEditingCostId] = useState<number | null>(null);

  const params = queryString(activeRange);
  const reportQuery = useQuery({
    queryKey: ['profit-tracker', params],
    queryFn: async () => {
      if (surface === 'costs') {
        const response = await request<{ data: { economics: ProfitTrackerReport } }>(
          `/api/stats/costs?${params}`,
        );
        return { data: response.data.economics };
      }
      return request<ReportResponse>(`/api/stats/profit-tracker?${params}`);
    },
    initialData: initialData && activeRange.range === '30d' ? { data: initialData } : undefined,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const report = reportQuery.data?.data;

  useEffect(() => {
    const query = queryString(activeRange);
    router.replace(`${pathname}?${query}`, { scroll: false });
  }, [activeRange, pathname, router]);

  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['profit-tracker'] }),
      queryClient.invalidateQueries({ queryKey: ['stats-dashboard'] }),
    ]);
  const settingsMutation = useMutation({
    mutationFn: () =>
      request('/api/stats/profit-tracker/settings', {
        method: 'PUT',
        body: JSON.stringify({
          fxRate: Number(settingsForm.fxRate),
          defaultReturnRate: Number(settingsForm.defaultReturnRate),
          restFrom: settingsForm.restFrom || null,
        }),
      }),
    onSuccess: () => {
      toast.success(t('profitTracker.notifications.settingsSaved'));
      void invalidate();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : t('errorDescription')),
  });
  const dayMutation = useMutation({
    mutationFn: () => {
      const payload: Record<string, string | number | null> = {
        date: dayForm.date,
        note: dayForm.note.trim() || null,
      };
      const fields = ['grossProfitDzd', 'returnRatePct', 'confirmedOrders'] as const;
      for (const field of fields) {
        const value = optionalNumber(dayForm[field]);
        payload[field] = value ?? null;
      }
      return request('/api/stats/profit-tracker/days', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      toast.success(t('profitTracker.notifications.daySaved'));
      setDayForm((current) => ({ ...current, grossProfitDzd: '', confirmedOrders: '', note: '' }));
      void invalidate();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : t('errorDescription')),
  });
  const deleteDayMutation = useMutation({
    mutationFn: (date: string) =>
      request(`/api/stats/profit-tracker/days/${date}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success(t('profitTracker.notifications.dayDeleted'));
      void invalidate();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : t('errorDescription')),
  });
  const resetDayFieldMutation = useMutation({
    mutationFn: ({
      date,
      field,
    }: {
      date: string;
      field: 'grossProfitDzd' | 'returnRatePct' | 'confirmedOrders';
    }) =>
      request('/api/stats/profit-tracker/days', {
        method: 'POST',
        body: JSON.stringify({ date, [field]: null }),
      }),
    onSuccess: () => {
      toast.success(t('profitTracker.notifications.dayReset'));
      void invalidate();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : t('errorDescription')),
  });
  const metaMutation = useMutation({
    mutationFn: () =>
      request('/api/stats/profit-tracker/fetch-meta', {
        method: 'POST',
        body: JSON.stringify({ date: dayForm.date }),
      }),
    onSuccess: () => {
      toast.success(t('profitTracker.notifications.metaFetched'));
      void invalidate();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : t('errorDescription')),
  });
  const costMutation = useMutation({
    mutationFn: () =>
      request(
        editingCostId
          ? `/api/stats/profit-tracker/costs/${editingCostId}`
          : '/api/stats/profit-tracker/costs',
        {
          method: editingCostId ? 'PUT' : 'POST',
          body: JSON.stringify({
            name: costForm.name,
            amountDzd: Number(costForm.amountDzd),
            period: costForm.period,
            startDate: costForm.startDate,
            endDate: costForm.endDate || null,
          }),
        },
      ),
    onSuccess: () => {
      toast.success(t('profitTracker.notifications.costSaved'));
      setCostForm((current) => ({ ...current, name: '', amountDzd: '', endDate: '' }));
      setEditingCostId(null);
      void invalidate();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : t('errorDescription')),
  });
  const deleteCostMutation = useMutation({
    mutationFn: (id: number) =>
      request(`/api/stats/profit-tracker/costs/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success(t('profitTracker.notifications.costDeleted'));
      setEditingCostId(null);
      void invalidate();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : t('errorDescription')),
  });

  const chartDays = useMemo(() => {
    if (!report) return [];
    const ascending = [...report.days].reverse();
    return ascending.map((day, index) => {
      const trendWindow = ascending
        .slice(Math.max(0, index - 6), index + 1)
        .map((item) => item.metrics.netProfitDzd)
        .filter((value): value is number => value != null);
      return {
        ...day,
        ...day.metrics,
        netTrendDzd:
          trendWindow.length > 0
            ? trendWindow.reduce((total, value) => total + value, 0) / trendWindow.length
            : null,
        breakEven: 1,
      };
    });
  }, [report]);
  const profitConfig = useMemo(
    () =>
      ({
        netProfitDzd: { label: t('profitTracker.metrics.net'), color: 'hsl(var(--chart-2))' },
        netProfitBeforeReturnsDzd: {
          label: t('profitTracker.metrics.netBefore'),
          color: 'hsl(var(--chart-3))',
        },
        netTrendDzd: { label: t('profitTracker.metrics.trend'), color: 'hsl(var(--chart-5))' },
        trueProfitDzd: { label: t('profitTracker.cards.trueProfit'), color: 'hsl(var(--chart-1))' },
        adCostDzd: { label: t('profitTracker.metrics.adCost'), color: 'hsl(var(--chart-4))' },
      }) satisfies ChartConfig,
    [t],
  );
  const cumulativeConfig = useMemo(
    () =>
      ({
        cumulativeNetDzd: {
          label: t('profitTracker.metrics.cumulativeNet'),
          color: 'hsl(var(--chart-1))',
        },
        cumulativeNetBeforeReturnsDzd: {
          label: t('profitTracker.metrics.cumulativeBefore'),
          color: 'hsl(var(--chart-5))',
        },
        cumulativeTrueProfitDzd: {
          label: t('profitTracker.metrics.cumulativeTrue'),
          color: 'hsl(var(--chart-3))',
        },
      }) satisfies ChartConfig,
    [t],
  );
  const roasConfig = useMemo(
    () =>
      ({
        profitX: { label: t('profitTracker.metrics.profitAfter'), color: 'hsl(var(--chart-2))' },
        profitXBeforeReturns: {
          label: t('profitTracker.metrics.profitBefore'),
          color: 'hsl(var(--chart-5))',
        },
        breakEven: {
          label: t('profitTracker.metrics.breakEven'),
          color: 'hsl(var(--muted-foreground))',
        },
      }) satisfies ChartConfig,
    [t],
  );
  const creativeConfig = useMemo(
    () =>
      ({
        cpm: { label: t('profitTracker.metrics.cpm'), color: 'hsl(var(--chart-4))' },
        ctr: { label: t('profitTracker.metrics.ctr'), color: 'hsl(var(--chart-2))' },
      }) satisfies ChartConfig,
    [t],
  );
  const funnelConfig = useMemo(
    () =>
      ({
        confirmationRatePct: {
          label: t('profitTracker.metrics.confirmation'),
          color: 'hsl(var(--chart-2))',
        },
        clickToPageRatePct: {
          label: t('profitTracker.metrics.clickToPage'),
          color: 'hsl(var(--chart-1))',
        },
        costPerConfirmedDzd: {
          label: t('profitTracker.metrics.costConfirmed'),
          color: 'hsl(var(--chart-5))',
        },
      }) satisfies ChartConfig,
    [t],
  );

  const handleRangeChange = (next: RangeKey) => {
    setSelectedRange(next);
    if (next !== 'custom') setActiveRange({ range: next });
  };
  const applyCustomRange = () => {
    if (!customStart || !customEnd || customStart > customEnd) return;
    setActiveRange({ range: 'custom', startDate: customStart, endDate: customEnd });
  };
  const loadDay = (day: ProfitTrackerReport['days'][number]) => {
    setDayForm({
      date: day.date,
      grossProfitDzd: day.grossProfitDzd == null ? '' : String(day.grossProfitDzd),
      returnRatePct: day.returnRatePct == null ? '' : String(day.returnRatePct),
      confirmedOrders: day.confirmedOrders == null ? '' : String(day.confirmedOrders),
      note: day.note ?? '',
    });
  };
  const loadCost = (cost: ProfitTrackerReport['costs'][number]) => {
    if (!cost.id) return;
    setEditingCostId(cost.id);
    setCostForm({
      name: cost.name,
      amountDzd: String(cost.amountDzd),
      period: cost.period,
      startDate: cost.startDate,
      endDate: cost.endDate ?? '',
    });
  };
  const resetCostForm = () => {
    setEditingCostId(null);
    setCostForm({
      name: '',
      amountDzd: '',
      period: 'monthly',
      startDate: report?.filters.endDate ?? '',
      endDate: '',
    });
  };
  const exportHref = `/api/stats/profit-tracker/export.csv?${params}`;
  const activeMonthlyBurn =
    report?.costs
      .filter(
        (cost) =>
          cost.period === 'monthly' &&
          cost.startDate <= (report.filters.endDate || '') &&
          (!cost.endDate || cost.endDate >= (report.filters.endDate || '')),
      )
      .reduce((total, cost) => total + cost.amountDzd, 0) ?? 0;

  if (reportQuery.isLoading && !report) return <StatsPageSkeleton />;
  if (reportQuery.isError || !report) {
    return (
      <Alert variant="destructive">
        <AlertTitle>{t('errorTitle')}</AlertTitle>
        <AlertDescription>
          {reportQuery.error instanceof Error ? reportQuery.error.message : t('errorDescription')}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-5 sm:gap-6">
      <Card className="rounded-[1.5rem] border-border/60 bg-card p-4 sm:rounded-[2rem] sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              {t('profitTracker.eyebrow')}
            </p>
            <h1 className="mt-2 break-words text-2xl font-semibold tracking-tight sm:text-3xl">
              {title}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>
            <p className="mt-3 text-xs text-muted-foreground">
              {t('profitTracker.latestMeta')}:{' '}
              {formatDateTime(locale, report.freshness.metaSyncedAt)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => void reportQuery.refetch()}
              disabled={reportQuery.isFetching}
            >
              <RefreshCcw className={reportQuery.isFetching ? 'size-4 animate-spin' : 'size-4'} />
              {t('refresh')}
            </Button>
            <a
              className="inline-flex h-10 items-center justify-center gap-2 rounded-[0.75rem] border border-transparent bg-secondary px-4 py-2 text-sm font-semibold text-secondary-foreground shadow-[var(--shadow-vapor)] transition-colors hover:bg-accent hover:text-accent-foreground"
              href={exportHref}
            >
              <Download className="size-4" />
              {t('profitTracker.export')}
            </a>
          </div>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-[minmax(150px,220px)_1fr]">
          <NativeSelect
            aria-label={t('profitTracker.rangeLabel')}
            value={selectedRange}
            onChange={(event) => handleRangeChange(event.target.value as RangeKey)}
          >
            {RANGE_KEYS.map((range) => (
              <NativeSelectOption key={range} value={range}>
                {t(`ranges.${range}`)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          {selectedRange === 'custom' ? (
            <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <Input
                aria-label={t('customStart')}
                type="date"
                value={customStart}
                onChange={(event) => setCustomStart(event.target.value)}
              />
              <Input
                aria-label={t('customEnd')}
                type="date"
                value={customEnd}
                onChange={(event) => setCustomEnd(event.target.value)}
              />
              <Button
                onClick={applyCustomRange}
                disabled={!customStart || !customEnd || customStart > customEnd}
              >
                {t('profitTracker.applyRange')}
              </Button>
            </div>
          ) : null}
        </div>
      </Card>

      {surface === 'full' ? (
        <>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-6">
            <MetricCard
              accent="bg-violet-500"
              icon={TrendingUp}
              title={t('profitTracker.cards.profitX')}
              value={formatRatio(locale, report.summary.profitX)}
            />
            <MetricCard
              accent="bg-emerald-500"
              icon={CircleDollarSign}
              title={t('profitTracker.cards.adjusted')}
              value={formatCurrency(locale, report.summary.adjustedProfitDzd)}
            />
            <MetricCard
              accent="bg-blue-500"
              icon={Activity}
              title={t('profitTracker.cards.net')}
              value={formatCurrency(locale, report.summary.netProfitDzd)}
            />
            <MetricCard
              accent="bg-amber-500"
              icon={WalletCards}
              title={t('profitTracker.cards.trueProfit')}
              value={formatCurrency(locale, report.summary.trueProfitDzd)}
            />
            <MetricCard
              accent="bg-rose-500"
              icon={Target}
              title={t('profitTracker.cards.spend')}
              value={formatEur(locale, report.summary.spendEur)}
            />
            <MetricCard
              accent="bg-cyan-500"
              icon={CalendarDays}
              title={t('profitTracker.cards.confirmed')}
              value={formatNumber(locale, report.summary.confirmedOrders)}
            />
          </div>
        </>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <MetricCard
            accent="bg-amber-500"
            icon={WalletCards}
            title={t('profitTracker.costs.rangeTotal')}
            value={formatCurrency(locale, report.summary.operatingCostDzd)}
          />
          <MetricCard
            accent="bg-violet-500"
            icon={CalendarDays}
            title={t('profitTracker.costs.monthlyBurn')}
            value={formatCurrency(locale, activeMonthlyBurn)}
          />
        </div>
      )}

      {surface === 'full' ? (
        <div className="grid min-w-0 gap-5 xl:grid-cols-2">
          <SectionCard title={t('profitTracker.charts.daily')}>
            <ChartContainer config={profitConfig}>
              <ComposedChart data={chartDays}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(value) => formatBucket(locale, value)}
                  minTickGap={28}
                />
                <YAxis tickFormatter={(value) => formatNumber(locale, Number(value))} width={72} />
                <ChartTooltip
                  content={
                    <ChartTooltipContent formatter={(value) => formatCurrency(locale, value)} />
                  }
                />
                <Bar
                  dataKey="netProfitDzd"
                  fill="var(--color-netProfitDzd)"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="netProfitBeforeReturnsDzd"
                  fill="var(--color-netProfitBeforeReturnsDzd)"
                  opacity={0.3}
                  radius={[4, 4, 0, 0]}
                />
                <Line
                  dataKey="netTrendDzd"
                  stroke="var(--color-netTrendDzd)"
                  dot={false}
                  strokeWidth={2}
                />
                <Line
                  dataKey="trueProfitDzd"
                  stroke="var(--color-trueProfitDzd)"
                  dot={false}
                  strokeWidth={2}
                />
                <Line
                  dataKey="adCostDzd"
                  stroke="var(--color-adCostDzd)"
                  dot={false}
                  strokeWidth={2}
                />
              </ComposedChart>
            </ChartContainer>
          </SectionCard>
          <SectionCard title={t('profitTracker.charts.cumulative')}>
            <ChartContainer config={cumulativeConfig}>
              <LineChart data={chartDays}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(value) => formatBucket(locale, value)}
                  minTickGap={28}
                />
                <YAxis tickFormatter={(value) => formatNumber(locale, Number(value))} width={72} />
                <ChartTooltip
                  content={
                    <ChartTooltipContent formatter={(value) => formatCurrency(locale, value)} />
                  }
                />
                <Line
                  dataKey="cumulativeNetDzd"
                  stroke="var(--color-cumulativeNetDzd)"
                  dot={false}
                  strokeWidth={2}
                />
                <Line
                  dataKey="cumulativeNetBeforeReturnsDzd"
                  stroke="var(--color-cumulativeNetBeforeReturnsDzd)"
                  dot={false}
                  strokeWidth={2}
                  strokeDasharray="6 5"
                />
                <Line
                  dataKey="cumulativeTrueProfitDzd"
                  stroke="var(--color-cumulativeTrueProfitDzd)"
                  dot={false}
                  strokeWidth={2}
                />
              </LineChart>
            </ChartContainer>
          </SectionCard>
          <SectionCard title={t('profitTracker.charts.creative')}>
            <ChartContainer config={creativeConfig}>
              <LineChart data={chartDays}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(value) => formatBucket(locale, value)}
                  minTickGap={28}
                />
                <YAxis yAxisId="left" width={58} />
                <YAxis yAxisId="right" orientation="right" width={48} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line
                  yAxisId="left"
                  dataKey="cpm"
                  stroke="var(--color-cpm)"
                  dot={false}
                  strokeWidth={2}
                />
                <Line
                  yAxisId="right"
                  dataKey="ctr"
                  stroke="var(--color-ctr)"
                  dot={false}
                  strokeWidth={2}
                />
              </LineChart>
            </ChartContainer>
          </SectionCard>
          <div className="xl:col-span-2">
            <SectionCard title={t('profitTracker.charts.roas')}>
              <ChartContainer config={roasConfig}>
                <LineChart data={chartDays}>
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(value) => formatBucket(locale, value)}
                    minTickGap={28}
                  />
                  <YAxis tickFormatter={(value) => `${value}×`} width={48} />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent formatter={(value) => formatRatio(locale, value)} />
                    }
                  />
                  <Line
                    dataKey="profitX"
                    stroke="var(--color-profitX)"
                    dot={false}
                    strokeWidth={3}
                  />
                  <Line
                    dataKey="profitXBeforeReturns"
                    stroke="var(--color-profitXBeforeReturns)"
                    strokeDasharray="6 5"
                    dot={false}
                    strokeWidth={2}
                  />
                  <Line
                    dataKey="breakEven"
                    stroke="var(--color-breakEven)"
                    strokeDasharray="3 4"
                    dot={false}
                    strokeWidth={1.5}
                  />
                </LineChart>
              </ChartContainer>
            </SectionCard>
          </div>
          <SectionCard title={t('profitTracker.charts.funnel')}>
            <ChartContainer config={funnelConfig}>
              <ComposedChart data={chartDays}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(value) => formatBucket(locale, value)}
                  minTickGap={28}
                />
                <YAxis
                  yAxisId="cost"
                  tickFormatter={(value) => formatNumber(locale, Number(value))}
                  width={64}
                />
                <YAxis
                  yAxisId="percent"
                  orientation="right"
                  domain={[0, 100]}
                  tickFormatter={(value) => `${value}%`}
                  width={48}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar
                  yAxisId="cost"
                  dataKey="costPerConfirmedDzd"
                  fill="var(--color-costPerConfirmedDzd)"
                  radius={[4, 4, 0, 0]}
                />
                <Line
                  yAxisId="percent"
                  dataKey="confirmationRatePct"
                  stroke="var(--color-confirmationRatePct)"
                  dot={false}
                  strokeWidth={2}
                />
                <Line
                  yAxisId="percent"
                  dataKey="clickToPageRatePct"
                  stroke="var(--color-clickToPageRatePct)"
                  dot={false}
                  strokeWidth={2}
                />
              </ComposedChart>
            </ChartContainer>
          </SectionCard>
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-2">
        <SectionCard title={t('profitTracker.settings.title')}>
          <form
            className="grid gap-3 sm:grid-cols-3"
            onSubmit={(event) => {
              event.preventDefault();
              settingsMutation.mutate();
            }}
          >
            <Field label={t('profitTracker.settings.fx')}>
              <Input
                required
                min="0.0001"
                step="any"
                inputMode="decimal"
                value={settingsForm.fxRate}
                onChange={(event) =>
                  setSettingsForm((current) => ({ ...current, fxRate: event.target.value }))
                }
              />
            </Field>
            <Field label={t('profitTracker.settings.returns')}>
              <Input
                required
                min="0"
                max="100"
                step="any"
                inputMode="decimal"
                value={settingsForm.defaultReturnRate}
                onChange={(event) =>
                  setSettingsForm((current) => ({
                    ...current,
                    defaultReturnRate: event.target.value,
                  }))
                }
              />
            </Field>
            <Field label={t('profitTracker.settings.restFrom')}>
              <Input
                type="date"
                value={settingsForm.restFrom}
                onChange={(event) =>
                  setSettingsForm((current) => ({ ...current, restFrom: event.target.value }))
                }
              />
            </Field>
            <Button
              className="sm:col-span-3 sm:justify-self-start"
              type="submit"
              disabled={settingsMutation.isPending}
            >
              <Settings2 className="size-4" />
              {t('profitTracker.settings.save')}
            </Button>
          </form>
          <p className="mt-4 text-xs leading-5 text-muted-foreground">
            {t('profitTracker.settings.fxHint')}
          </p>
        </SectionCard>

        <SectionCard title={t('profitTracker.day.title')}>
          <form
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              dayMutation.mutate();
            }}
          >
            <Field label={t('profitTracker.day.date')}>
              <Input
                required
                type="date"
                value={dayForm.date}
                onChange={(event) =>
                  setDayForm((current) => ({ ...current, date: event.target.value }))
                }
              />
            </Field>
            <Field label={t('profitTracker.day.gross')}>
              <Input
                min="0"
                step="any"
                inputMode="decimal"
                value={dayForm.grossProfitDzd}
                onChange={(event) =>
                  setDayForm((current) => ({ ...current, grossProfitDzd: event.target.value }))
                }
              />
            </Field>
            <Field label={t('profitTracker.day.returns')}>
              <Input
                min="0"
                max="100"
                step="any"
                inputMode="decimal"
                placeholder={settingsForm.defaultReturnRate}
                value={dayForm.returnRatePct}
                onChange={(event) =>
                  setDayForm((current) => ({ ...current, returnRatePct: event.target.value }))
                }
              />
            </Field>
            <Field label={t('profitTracker.day.confirmed')}>
              <Input
                min="0"
                step="1"
                inputMode="numeric"
                value={dayForm.confirmedOrders}
                onChange={(event) =>
                  setDayForm((current) => ({ ...current, confirmedOrders: event.target.value }))
                }
              />
            </Field>
            <Field label={t('profitTracker.day.note')}>
              <Input
                value={dayForm.note}
                maxLength={500}
                onChange={(event) =>
                  setDayForm((current) => ({ ...current, note: event.target.value }))
                }
              />
            </Field>
            <div className="flex items-end gap-2">
              <Button type="submit" disabled={dayMutation.isPending || !dayForm.date}>
                {t('profitTracker.day.save')}
              </Button>
              {surface === 'full' ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={metaMutation.isPending || !dayForm.date}
                  onClick={() => metaMutation.mutate()}
                >
                  <RefreshCcw
                    className={metaMutation.isPending ? 'size-4 animate-spin' : 'size-4'}
                  />
                  {t('profitTracker.day.fetchMeta')}
                </Button>
              ) : null}
            </div>
          </form>
        </SectionCard>
      </div>

      {surface === 'full' ? (
        <SectionCard title={t('profitTracker.weekly.title')}>
          <div className="max-w-full overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('profitTracker.weekly.week')}</TableHead>
                  <TableHead>{t('profitTracker.weekly.days')}</TableHead>
                  <TableHead>{t('profitTracker.cards.spend')}</TableHead>
                  <TableHead>{t('profitTracker.cards.net')}</TableHead>
                  <TableHead>{t('profitTracker.cards.profitX')}</TableHead>
                  <TableHead>{t('profitTracker.cards.trueProfit')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.weeks.length === 0 ? (
                  <EmptyRows colSpan={6} label={t('profitTracker.empty')} />
                ) : (
                  report.weeks.map((week) => (
                    <TableRow key={week.weekStart}>
                      <TableCell className="font-medium">{week.weekStart}</TableCell>
                      <TableCell>{formatNumber(locale, week.trackedDays)}</TableCell>
                      <TableCell>{formatEur(locale, week.spendEur)}</TableCell>
                      <TableCell>{formatCurrency(locale, week.netProfitDzd)}</TableCell>
                      <TableCell>{formatRatio(locale, week.profitX)}</TableCell>
                      <TableCell>{formatCurrency(locale, week.trueProfitDzd)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </SectionCard>
      ) : null}

      <SectionCard title={t('profitTracker.history.title')}>
        <div className="max-h-[620px] max-w-full overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow>
                <TableHead>{t('profitTracker.day.date')}</TableHead>
                <TableHead>{t('profitTracker.cards.spend')}</TableHead>
                <TableHead>{t('profitTracker.day.gross')}</TableHead>
                <TableHead>{t('profitTracker.day.confirmed')}</TableHead>
                <TableHead>{t('profitTracker.cards.adjusted')}</TableHead>
                <TableHead>{t('profitTracker.metrics.adCost')}</TableHead>
                <TableHead>{t('profitTracker.cards.net')}</TableHead>
                <TableHead>{t('profitTracker.cards.profitX')}</TableHead>
                <TableHead>{t('profitTracker.cards.trueProfit')}</TableHead>
                <TableHead>{t('profitTracker.history.roll')}</TableHead>
                <TableHead>{t('profitTracker.day.note')}</TableHead>
                <TableHead>{t('profitTracker.history.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.days.length === 0 ? (
                <EmptyRows colSpan={12} label={t('profitTracker.empty')} />
              ) : (
                report.days.map((day) => (
                  <TableRow
                    key={day.date}
                    className={day.isRestDay ? 'bg-amber-500/10' : undefined}
                  >
                    <TableCell className="whitespace-nowrap font-medium">
                      {day.date}
                      {day.isRestDay ? (
                        <span className="ms-2 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-700">
                          {t('profitTracker.history.rest')}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell>{formatEur(locale, day.spendEur ?? 0)}</TableCell>
                    <TableCell>
                      <div>
                        {day.grossProfitDzd == null
                          ? '—'
                          : formatCurrency(locale, day.grossProfitDzd)}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {t(`profitTracker.sources.${day.grossProfitSource ?? 'missing'}`)}
                      </span>
                      {day.grossProfitSource === 'manual' ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            resetDayFieldMutation.mutate({
                              date: day.date,
                              field: 'grossProfitDzd',
                            })
                          }
                        >
                          {t('profitTracker.history.reset')}
                        </Button>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <div>
                        {day.confirmedOrders == null
                          ? '—'
                          : formatNumber(locale, day.confirmedOrders)}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {t(`profitTracker.sources.${day.confirmedOrdersSource ?? 'missing'}`)}
                      </span>
                      {day.confirmedOrdersSource === 'manual' ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            resetDayFieldMutation.mutate({
                              date: day.date,
                              field: 'confirmedOrders',
                            })
                          }
                        >
                          {t('profitTracker.history.reset')}
                        </Button>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <div>
                        {day.metrics.adjustedProfitDzd == null
                          ? '—'
                          : formatCurrency(locale, day.metrics.adjustedProfitDzd)}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {t(`profitTracker.sources.${day.returnRateSource ?? 'missing'}`)}
                      </span>
                      {day.returnRateSource === 'manual' ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            resetDayFieldMutation.mutate({ date: day.date, field: 'returnRatePct' })
                          }
                        >
                          {t('profitTracker.history.reset')}
                        </Button>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      {day.metrics.adCostDzd == null
                        ? '—'
                        : formatCurrency(locale, day.metrics.adCostDzd)}
                    </TableCell>
                    <TableCell>
                      {day.metrics.netProfitDzd == null
                        ? '—'
                        : formatCurrency(locale, day.metrics.netProfitDzd)}
                    </TableCell>
                    <TableCell>{formatRatio(locale, day.metrics.profitX)}</TableCell>
                    <TableCell>
                      {day.trueProfitDzd == null ? '—' : formatCurrency(locale, day.trueProfitDzd)}
                    </TableCell>
                    <TableCell>
                      {day.rolledOutDzd > 0
                        ? `→ ${formatCurrency(locale, day.rolledOutDzd)}`
                        : day.rolledInDzd > 0
                          ? `← ${formatCurrency(locale, day.rolledInDzd)}`
                          : '—'}
                    </TableCell>
                    <TableCell className="max-w-52 truncate">{day.note || '—'}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          aria-label={t('profitTracker.history.edit', { date: day.date })}
                          onClick={() => loadDay(day)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          aria-label={t('profitTracker.history.delete', { date: day.date })}
                          disabled={deleteDayMutation.isPending}
                          onClick={() => {
                            if (
                              window.confirm(
                                t('profitTracker.history.confirmDelete', { date: day.date }),
                              )
                            )
                              deleteDayMutation.mutate(day.date);
                          }}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </SectionCard>

      {surface === 'full' ? (
        <SectionCard title={t('profitTracker.adsets.title')}>
          <div className="max-w-full overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('profitTracker.adsets.name')}</TableHead>
                  <TableHead>{t('profitTracker.weekly.days')}</TableHead>
                  <TableHead>{t('profitTracker.cards.spend')}</TableHead>
                  <TableHead>{t('profitTracker.adsets.purchases')}</TableHead>
                  <TableHead>{t('profitTracker.adsets.costPerPurchase')}</TableHead>
                  <TableHead>{t('profitTracker.adsets.value')}</TableHead>
                  <TableHead>{t('profitTracker.adsets.estimatedNet')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.adsets.length === 0 ? (
                  <EmptyRows colSpan={7} label={t('profitTracker.empty')} />
                ) : (
                  report.adsets.map((adset) => (
                    <TableRow key={adset.adsetId}>
                      <TableCell className="font-medium">{adset.adsetName}</TableCell>
                      <TableCell>{formatNumber(locale, adset.days)}</TableCell>
                      <TableCell>{formatEur(locale, adset.spendEur)}</TableCell>
                      <TableCell>{formatNumber(locale, adset.purchases)}</TableCell>
                      <TableCell>
                        {adset.costPerPurchaseDzd == null
                          ? '—'
                          : formatCurrency(locale, adset.costPerPurchaseDzd)}
                      </TableCell>
                      <TableCell>{formatNumber(locale, adset.purchaseValue)}</TableCell>
                      <TableCell>
                        {adset.hasEstimate
                          ? formatCurrency(locale, adset.estimatedNetProfitDzd)
                          : '—'}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </SectionCard>
      ) : null}

      <SectionCard title={t('profitTracker.costs.title')}>
        <form
          className="grid gap-3 md:grid-cols-5"
          onSubmit={(event) => {
            event.preventDefault();
            costMutation.mutate();
          }}
        >
          <Field label={t('profitTracker.costs.name')}>
            <Input
              required
              value={costForm.name}
              onChange={(event) =>
                setCostForm((current) => ({ ...current, name: event.target.value }))
              }
            />
          </Field>
          <Field label={t('profitTracker.costs.amount')}>
            <Input
              required
              min="0"
              step="any"
              inputMode="decimal"
              value={costForm.amountDzd}
              onChange={(event) =>
                setCostForm((current) => ({ ...current, amountDzd: event.target.value }))
              }
            />
          </Field>
          <Field label={t('profitTracker.costs.period')}>
            <NativeSelect
              value={costForm.period}
              onChange={(event) =>
                setCostForm((current) => ({
                  ...current,
                  period: event.target.value as 'monthly' | 'once',
                }))
              }
            >
              <NativeSelectOption value="monthly">
                {t('profitTracker.costs.monthly')}
              </NativeSelectOption>
              <NativeSelectOption value="once">{t('profitTracker.costs.once')}</NativeSelectOption>
            </NativeSelect>
          </Field>
          <Field label={t('profitTracker.costs.start')}>
            <Input
              required
              type="date"
              value={costForm.startDate}
              onChange={(event) =>
                setCostForm((current) => ({ ...current, startDate: event.target.value }))
              }
            />
          </Field>
          <Field label={t('profitTracker.costs.end')}>
            <Input
              type="date"
              value={costForm.endDate}
              onChange={(event) =>
                setCostForm((current) => ({ ...current, endDate: event.target.value }))
              }
            />
          </Field>
          <div className="flex gap-2 md:col-span-5">
            <Button type="submit" disabled={costMutation.isPending}>
              {editingCostId ? t('profitTracker.costs.update') : t('profitTracker.costs.save')}
            </Button>
            {editingCostId ? (
              <Button type="button" variant="outline" onClick={resetCostForm}>
                {t('profitTracker.costs.cancel')}
              </Button>
            ) : null}
          </div>
        </form>
        <div className="mt-5 grid gap-2">
          {report.costs.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('profitTracker.empty')}</p>
          ) : (
            report.costs.map((cost) => (
              <div
                key={cost.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/70 bg-muted/20 p-3"
              >
                <div>
                  <p className="font-medium">{cost.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatCurrency(locale, cost.amountDzd)} ·{' '}
                    {t(`profitTracker.costs.${cost.period}`)} · {cost.startDate}
                    {cost.endDate ? ` – ${cost.endDate}` : ''}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => loadCost(cost)}>
                    <Pencil className="size-4" />
                    {t('profitTracker.costs.edit')}
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    aria-label={t('profitTracker.costs.delete', { name: cost.name })}
                    disabled={deleteCostMutation.isPending}
                    onClick={() => {
                      if (
                        cost.id &&
                        window.confirm(t('profitTracker.costs.confirmDelete', { name: cost.name }))
                      )
                        deleteCostMutation.mutate(cost.id);
                    }}
                  >
                    <Trash2 className="size-4" />
                    {t('profitTracker.costs.deleteAction')}
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </SectionCard>
    </div>
  );
}
