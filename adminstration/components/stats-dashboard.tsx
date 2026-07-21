'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertCircle,
  Bot,
  Calendar,
  CalendarRange,
  DollarSign,
  FileText,
  Gauge,
  MousePointer,
  FileSpreadsheet,
  Layers,
  MapPin,
  Package,
  RefreshCcw,
  Tag,
  Target,
  Trash2,
  TrendingDown,
  TrendingUp,
  Truck,
  Users,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';

import type { StatsDashboardData } from '../lib/stats';
import { toast } from '../lib/toast';
import { cn } from '../lib/utils';
import type { BulletinAttachment } from '../lib/bulletin';
import { AdCostsManager } from './ad-costs-manager';
import { ManualOrderForm } from './manual-order-form';
import { ManualOrderHistory } from './manual-order-history';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from './ui/chart';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from './ui/empty';
import { FileUploadField } from './file-upload-field';
import { Input } from './ui/input';
import { Skeleton } from './ui/skeleton';
import { TablePaginationControls } from './table-pagination-controls';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';

type StatsDashboardProps = {
  description: string;
  initialData?: StatsDashboardData | null;
  section: StatsSection;
  title: string;
};

export type StatsQueryResponse = {
  data: StatsDashboardData;
};

type StatsImportHistoryResponse = {
  data: {
    items: StatsDashboardData['importHistory'];
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
};

export type StatsSection = 'overview' | 'website' | 'landingPages' | 'aiAssistants' | 'customers' | 'products' | 'geography' | 'time' | 'metaAds' | 'manualOrders' | 'imports';
type TrendMode = 'daily' | 'weekly' | 'monthly';
type BackgroundJob = {
  id: string;
  status: 'queued' | 'running' | 'completed' | 'cancelled' | 'failed';
  fileName: string | null;
  progress: {
    phase: string;
    current: number;
    total: number;
    percentage: number;
  };
  errorMessage: string | null;
  downloadPath: string | null;
  resultSummary?: Record<string, unknown> | null;
};

const TABLE_PAGE_SIZE = 10;

const rangePresets = ['30d', '90d', 'year', 'all', 'custom'] as const;
const assistantIntentKeys = new Set([
  'product_search', 'product_comparison', 'compatibility', 'price',
  'availability', 'how_to', 'recommendation', 'other',
]);

const revenueBreakdownConfig = {
  value: { label: 'Value', color: 'hsl(var(--chart-1))' },
} satisfies ChartConfig;

const feeBreakdownConfig = {
  livraison: { label: 'Delivery', color: 'hsl(var(--chart-1))' },
  commission: { label: 'Commission', color: 'hsl(var(--chart-2))' },
  poids: { label: 'Weight', color: 'hsl(var(--chart-3))' },
  extra: { label: 'Extra', color: 'hsl(var(--chart-4))' },
  sms: { label: 'SMS', color: 'hsl(var(--chart-5))' },
  stockage: { label: 'Storage', color: 'hsl(var(--chart-1))' },
  publicite: { label: 'Ads', color: 'hsl(var(--chart-2))' },
} satisfies ChartConfig;

const topProductsConfig = {
  units: { label: 'Units sold', color: 'hsl(var(--chart-1))' },
} satisfies ChartConfig;

const segmentConfig = {
  revenue: { label: 'Revenue', color: 'hsl(var(--chart-1))' },
  profit: { label: 'Profit', color: 'hsl(var(--chart-2))' },
} satisfies ChartConfig;

const geographyComposedConfig = {
  orders: { label: 'Orders', color: 'hsl(var(--chart-4))' },
  revenue: { label: 'Revenue', color: 'hsl(var(--chart-2))' },
} satisfies ChartConfig;

const geographyProfitConfig = {
  profit: { label: 'Profit', color: 'hsl(var(--chart-2))' },
} satisfies ChartConfig;

const geographyAverageConfig = {
  avgOrder: { label: 'Average order', color: 'hsl(var(--chart-3))' },
} satisfies ChartConfig;

const timeOrdersConfig = {
  orders: { label: 'Orders', color: 'hsl(var(--chart-1))' },
} satisfies ChartConfig;

const timeRevenueConfig = {
  revenue: { label: 'Revenue', color: 'hsl(var(--chart-1))' },
  profit: { label: 'Profit', color: 'hsl(var(--chart-2))' },
  fees: { label: 'Fees', color: 'hsl(var(--chart-4))' },
} satisfies ChartConfig;

const importTrendConfig = {
  revenue: { label: 'Revenue', color: 'hsl(var(--chart-1))' },
  profit: { label: 'Profit', color: 'hsl(var(--chart-2))' },
  fees: { label: 'Fees', color: 'hsl(var(--chart-4))' },
  orders: { label: 'Orders', color: 'hsl(var(--chart-5))' },
} satisfies ChartConfig;

const websiteFunnelConfig = {
  value: { label: 'Value', color: 'hsl(var(--chart-2))' },
} satisfies ChartConfig;

const websiteTrendConfig = {
  sessions: { label: 'Sessions', color: 'hsl(var(--chart-1))' },
  pageViews: { label: 'Page views', color: 'hsl(var(--chart-2))' },
  purchases: { label: 'Purchases', color: 'hsl(var(--chart-3))' },
  errors: { label: 'Errors', color: 'hsl(var(--chart-5))' },
} satisfies ChartConfig;

const aiTrendConfig = {
  runs: { label: 'Runs', color: 'hsl(var(--chart-1))' },
  completed: { label: 'Completed', color: 'hsl(var(--chart-2))' },
  failed: { label: 'Failed', color: 'hsl(var(--chart-5))' },
} satisfies ChartConfig;

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error ?? 'Request failed');
  }

  return response.json() as Promise<T>;
}

function buildStatsUrl(range: string, startDate: string, endDate: string) {
  const params = new URLSearchParams();
  params.set('range', range);

  if (range === 'custom') {
    if (startDate) {
      params.set('startDate', startDate);
    }

    if (endDate) {
      params.set('endDate', endDate);
    }
  }

  return `/api/stats?${params.toString()}`;
}

function formatCurrency(locale: string, value: number) {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'DZD',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatNumber(locale: string, value: number) {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value);
}

function formatPercent(locale: string, value: number) {
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value)}%`;
}

function formatUsd(locale: string, value: number | null) {
  if (value == null) return '—';
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD', maximumFractionDigits: 4 }).format(value);
}

function formatMilliseconds(locale: string, value: number) {
  if (value < 1_000) return `${formatNumber(locale, value)} ms`;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value / 1_000)} s`;
}

function formatBytes(locale: string, value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) {
    return '—';
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let normalized = value;
  let unitIndex = 0;

  while (normalized >= 1024 && unitIndex < units.length - 1) {
    normalized /= 1024;
    unitIndex += 1;
  }

  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: normalized >= 10 ? 0 : 1 }).format(normalized)} ${units[unitIndex]}`;
}

function formatDate(locale: string, value: string | null) {
  if (!value) {
    return '—';
  }

  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(value));
}

function formatDateTime(locale: string, value: string | null) {
  if (!value) {
    return '—';
  }

  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function formatDuration(locale: string, totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];

  if (days > 0) {
    parts.push(`${new Intl.NumberFormat(locale).format(days)}d`);
  }

  if (hours > 0 || parts.length > 0) {
    parts.push(`${new Intl.NumberFormat(locale).format(hours)}h`);
  }

  parts.push(`${new Intl.NumberFormat(locale).format(minutes)}m`);

  return parts.join(' ');
}

function formatBucket(locale: string, value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(new Date(`${value}T00:00:00Z`));
  }

  if (/^\d{4}-\d{2}$/.test(value)) {
    return new Intl.DateTimeFormat(locale, { month: 'short', year: '2-digit' }).format(new Date(`${value}-01T00:00:00Z`));
  }

  return value;
}

function MetricCard({
  accent,
  icon: Icon,
  title,
  value,
}: {
  accent: string;
  icon: typeof Package;
  title: string;
  value: string;
}) {
  return (
    <Card className="group relative overflow-hidden rounded-[1.6rem] border-border/60 bg-linear-to-br from-card via-card to-muted/30 p-0 transition-transform duration-300 hover:-translate-y-0.5">
      <div className={cn('absolute inset-x-0 top-0 h-1.5', accent)} />
      <div className="flex items-start gap-3 p-5">
        <div className="rounded-2xl bg-background/80 p-3 shadow-sm">
          <Icon className="size-5 text-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{title}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{value}</p>
        </div>
      </div>
    </Card>
  );
}

function StatBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.35rem] border border-border/70 bg-muted/20 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-xl font-semibold text-foreground">{value}</p>
    </div>
  );
}

function CostRow({
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
        <p className={cn('text-sm text-foreground', bold && 'font-semibold', highlight && 'text-rose-600')}>{label}</p>
        <div className="mt-2 h-2 rounded-full bg-muted">
          <div
            className={cn('h-2 rounded-full bg-[hsl(var(--chart-1))]', bold && 'bg-foreground', highlight && 'bg-rose-500')}
            style={{ width: `${Math.min(percentage, 100)}%` }}
          />
        </div>
      </div>
      <p className={cn('text-right text-sm tabular-nums text-foreground', bold && 'font-semibold', highlight && 'text-rose-600')}>
        {value.toLocaleString()}
      </p>
      <p className="text-right text-xs tabular-nums text-muted-foreground">{percentage.toFixed(1)}%</p>
    </div>
  );
}

function SectionCard({
  action,
  children,
  title,
}: {
  action?: React.ReactNode;
  children: React.ReactNode;
  title: string;
}) {
  return (
    <Card className="rounded-[2rem] border-border/60 bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-foreground">{title}</h2>
        </div>
        {action}
      </div>
      <div className="mt-5">{children}</div>
    </Card>
  );
}

function StatsPageSkeleton() {
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

export function StatsDashboard({ description: _description, initialData = null, section, title }: StatsDashboardProps) {
  const locale = useLocale();
  const t = useTranslations('statsDashboard');
  const queryClient = useQueryClient();
  const [range, setRange] = useState<(typeof rangePresets)[number]>('90d');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [trendMode, setTrendMode] = useState<TrendMode>('daily');
  const [uploadedFiles, setUploadedFiles] = useState<BulletinAttachment[]>([]);
  const [selectedUnmatchedReference, setSelectedUnmatchedReference] = useState<StatsDashboardData['latestUnmatchedDetails'][number] | null>(null);
  const [productsPage, setProductsPage] = useState(1);
  const [wilayasPage, setWilayasPage] = useState(1);
  const [importsTrendPage, setImportsTrendPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);
  const [importStage, setImportStage] = useState<'idle' | 'uploading' | 'processing'>('idle');
  const importStatusInitializedRef = useRef(false);
  const lastImportStatusKeyRef = useRef<string | null>(null);
  const [initialStatsUpdatedAt] = useState(() => (initialData ? Date.now() : 0));
  const needsDashboardStats = section !== 'imports' && section !== 'manualOrders';

  const statsQuery = useQuery({
    queryKey: ['stats-dashboard', section, range, startDate, endDate],
    queryFn: () => request<StatsQueryResponse>(buildStatsUrl(range, startDate, endDate)),
    initialData: initialData && range === '90d' && startDate === '' && endDate === '' ? { data: initialData } : undefined,
    initialDataUpdatedAt: initialStatsUpdatedAt,
    placeholderData: keepPreviousData,
    staleTime: section === 'aiAssistants' ? 0 : 60_000,
    refetchOnMount: section === 'aiAssistants' ? 'always' : true,
    refetchInterval: section === 'aiAssistants' ? 15_000 : false,
    enabled: needsDashboardStats,
  });
  const importJobQuery = useQuery({
    queryKey: ['stats-import-job'],
    queryFn: () => request<{ job: BackgroundJob | null }>('/api/uploads/stats'),
    initialData: { job: null },
    initialDataUpdatedAt: 0,
    refetchInterval: (query) => {
      const status = query.state.data?.job?.status;
      return status === 'queued' || status === 'running' ? 1_000 : false;
    },
    refetchIntervalInBackground: true,
    staleTime: 0,
    enabled: section === 'imports',
  });
  const importHistoryQuery = useQuery({
    queryKey: ['stats-import-history', historyPage, TABLE_PAGE_SIZE],
    queryFn: () => request<StatsImportHistoryResponse>(`/api/stats?history=true&page=${historyPage}&pageSize=${TABLE_PAGE_SIZE}`),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    enabled: section === 'imports',
  });
  const refreshStatsMutation = useMutation({
    mutationFn: () =>
      request<StatsQueryResponse>('/api/stats', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          range,
          startDate: range === 'custom' ? startDate || undefined : undefined,
          endDate: range === 'custom' ? endDate || undefined : undefined,
        }),
      }),
    onSuccess: async (response) => {
      queryClient.setQueryData(['stats-dashboard', section, range, startDate, endDate], response);
      await queryClient.invalidateQueries({ queryKey: ['stats-dashboard'] });
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const deleteBatchMutation = useMutation({
    mutationFn: (batchId: string) => request(`/api/stats?batchId=${encodeURIComponent(batchId)}`, { method: 'DELETE' }),
    onMutate: () => {
      const toastId = toast.loading(t('notifications.delete.loading'));
      return { toastId };
    },
    onSuccess: async (_, batchId, context) => {
      toast.success(t('notifications.delete.success', { batchId }), { id: context?.toastId });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['stats-dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['stats-import-history'] }),
      ]);
    },
    onError: (error, _batchId, context) => {
      toast.error(error.message, { id: context?.toastId });
    },
  });

  const dismissWarningMutation = useMutation({
    mutationFn: (payload: { batchId: string; reference: string }) =>
      request<{ data: { removed: boolean } }>('/api/stats', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    onMutate: () => {
      const toastId = toast.loading(t('notifications.unmatched.loading'));
      return { toastId };
    },
    onSuccess: async (_, _payload, context) => {
      toast.success(t('notifications.unmatched.success'), { id: context?.toastId });
      setSelectedUnmatchedReference(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['stats-dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['stats-import-history'] }),
      ]);
    },
    onError: (error, _payload, context) => {
      toast.error(error.message, { id: context?.toastId });
    },
  });

  const handleUploadStarted = () => {
    setImportStage('uploading');
    toast.loading(t('notifications.upload.loading'));
  };

  const handleUploadCompleted = async (payload: unknown) => {
    setImportStage('processing');
    const body = payload as { import?: { batchId: string; newOrders: number; duplicateOrders: number }; job?: BackgroundJob } | undefined;
    const result = body?.import;

    if (body?.job) {
      await queryClient.invalidateQueries({ queryKey: ['stats-import-job'] });
      return;
    }

    if (!result) {
      setImportStage('idle');
      toast.error(t('notifications.upload.error'), { id: 'stats-upload' });
      setUploadedFiles([]);
      return;
    }

    toast.success(
      t('notifications.upload.success', {
        created: String(result.newOrders),
        duplicates: String(result.duplicateOrders),
      }),
      { id: 'stats-upload' },
    );
    setUploadedFiles([]);
    setHistoryPage(1);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['stats-dashboard'] }),
      queryClient.invalidateQueries({ queryKey: ['stats-import-history'] }),
    ]);
    setImportStage('idle');
  };

  useEffect(() => {
    const job = importJobQuery.data.job;
    const statusKey = job ? `${job.id}:${job.status}` : null;

    if (!importStatusInitializedRef.current) {
      importStatusInitializedRef.current = true;
      lastImportStatusKeyRef.current = statusKey;
      return;
    }

    if (!statusKey || statusKey === lastImportStatusKeyRef.current) {
      return;
    }

    lastImportStatusKeyRef.current = statusKey;
    if (!job) {
      return;
    }

    if (job.status === 'completed') {
      const created = typeof job.resultSummary?.newOrders === 'number' ? job.resultSummary.newOrders : 0;
      const duplicates = typeof job.resultSummary?.duplicateOrders === 'number' ? job.resultSummary.duplicateOrders : 0;
      toast.success(
        t('notifications.upload.success', {
          created: String(created),
          duplicates: String(duplicates),
        }),
        { id: 'stats-upload' },
      );
      queueMicrotask(() => {
        setUploadedFiles([]);
        setImportStage('idle');
        setHistoryPage(1);
      });
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ['stats-dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['stats-import-history'] }),
      ]);
    } else if (job.status === 'failed') {
      toast.error(job.errorMessage || t('notifications.upload.error'), { id: 'stats-upload' });
      queueMicrotask(() => {
        setImportStage('idle');
        setUploadedFiles([]);
      });
    } else if (job.status === 'cancelled') {
      toast.error(t('notifications.upload.error'), { id: 'stats-upload' });
      queueMicrotask(() => {
        setImportStage('idle');
        setUploadedFiles([]);
      });
    }
  }, [importJobQuery.data.job, queryClient, t]);

  const stats = statsQuery.data?.data;

  const topWilayas = useMemo(() => stats?.wilayaDetails?.slice(0, 10) ?? [], [stats]);
  const paginatedProducts = useMemo(
    () => (stats?.allProducts ?? []).filter((product) => product.unitsSold >= 1),
    [stats],
  );
  const paginatedWilayas = useMemo(
    () => (stats?.wilayaDetails ?? []).filter((wilaya) => wilaya.orders >= 10),
    [stats],
  );
  const revenueBreakdown = useMemo(
    () =>
      stats
        ? [
            { name: t('overview.revenueBreakdown.collected'), value: stats.summary.totalAmountCollected },
            { name: t('overview.revenueBreakdown.productCost'), value: stats.summary.totalProductCost },
            { name: t('overview.revenueBreakdown.fees'), value: stats.summary.totalFees },
            { name: t('overview.revenueBreakdown.netRevenue'), value: stats.summary.totalNetRevenue },
            { name: t('overview.revenueBreakdown.grossProfit'), value: stats.summary.totalGrossProfit },
            { name: t('overview.revenueBreakdown.ads'), value: stats.adCosts.totalSpend },
            { name: t('overview.revenueBreakdown.netAfterAds'), value: stats.summary.netProfitAfterAds },
          ]
        : [],
    [stats, t],
  );
  const feeData = useMemo(
    () =>
      stats
        ? [
            { key: 'livraison', name: t('overview.fees.delivery'), value: stats.feeBreakdown.livraison, fill: 'var(--color-livraison)' },
            { key: 'commission', name: t('overview.fees.commission'), value: stats.feeBreakdown.commission, fill: 'var(--color-commission)' },
            { key: 'poids', name: t('overview.fees.weight'), value: stats.feeBreakdown.poids, fill: 'var(--color-poids)' },
            { key: 'extra', name: t('overview.fees.extra'), value: stats.feeBreakdown.extra, fill: 'var(--color-extra)' },
            { key: 'sms', name: t('overview.fees.sms'), value: stats.feeBreakdown.sms, fill: 'var(--color-sms)' },
            { key: 'stockage', name: t('overview.fees.storage'), value: stats.feeBreakdown.stockage, fill: 'var(--color-stockage)' },
            { key: 'publicite', name: t('overview.fees.ads'), value: stats.adCosts.totalSpend, fill: 'var(--color-publicite)' },
          ].filter((item) => item.value > 0)
        : [],
    [stats, t],
  );
  const overviewCards = useMemo(() => {
    if (!stats) {
      return [];
    }

    return [
      {
        title: t('overview.cards.totalOrders'),
        value: formatNumber(locale, stats.summary.totalOrders),
        accent: 'bg-primary',
        icon: Package,
      },
      {
        title: t('overview.cards.totalCollected'),
        value: formatCurrency(locale, stats.summary.totalAmountCollected),
        accent: 'bg-[hsl(var(--chart-2))]',
        icon: DollarSign,
      },
      {
        title: t('overview.cards.netRevenue'),
        value: formatCurrency(locale, stats.summary.totalNetRevenue),
        accent: 'bg-[hsl(var(--chart-3))]',
        icon: TrendingUp,
      },
      {
        title: t('overview.cards.deliveryFees'),
        value: formatCurrency(locale, stats.feeBreakdown.livraison),
        accent: 'bg-[hsl(var(--chart-4))]',
        icon: Truck,
      },
      {
        title: t('overview.cards.productCost'),
        value: formatCurrency(locale, stats.summary.totalProductCost),
        accent: 'bg-[hsl(var(--chart-5))]',
        icon: Package,
      },
      {
        title: t('overview.cards.grossProfit'),
        value: formatCurrency(locale, stats.summary.totalGrossProfit),
        accent: 'bg-[hsl(var(--chart-2)/0.82)]',
        icon: stats.summary.totalGrossProfit >= 0 ? TrendingUp : TrendingDown,
      },
      {
        title: t('overview.cards.afterAds'),
        value: formatCurrency(locale, stats.summary.netProfitAfterAds),
        accent: 'bg-[hsl(var(--chart-5)/0.86)]',
        icon: stats.summary.netProfitAfterAds >= 0 ? TrendingUp : TrendingDown,
      },
      {
        title: t('overview.cards.averageOrder'),
        value: formatCurrency(locale, stats.summary.averageOrderValue),
        accent: 'bg-[hsl(var(--chart-3)/0.78)]',
        icon: CalendarRange,
      },
      {
        title: t('overview.cards.margin'),
        value: formatPercent(locale, stats.summary.profitMargin),
        accent: 'bg-[hsl(var(--chart-4)/0.78)]',
        icon: TrendingUp,
      },
    ];
  }, [locale, stats, t]);
  const trendData = stats ? stats.trends[trendMode] : [];
  const importTrendData = useMemo(
    () =>
      (stats?.trends.imports ?? []).map((item) => ({
        ...item,
        margin: item.revenue > 0 ? (item.profit / item.revenue) * 100 : 0,
      })),
    [stats],
  );
  const importTrendRows = useMemo(() => [...importTrendData].reverse(), [importTrendData]);
  const importHistoryPageData = importHistoryQuery.data?.data;
  const importHistoryRows = useMemo(
    () => (section === 'imports' ? importHistoryPageData?.items ?? stats?.importHistory ?? [] : stats?.importHistory ?? []),
    [importHistoryPageData?.items, section, stats],
  );
  const productsPageItems = useMemo(
    () => paginatedProducts.slice((productsPage - 1) * TABLE_PAGE_SIZE, productsPage * TABLE_PAGE_SIZE),
    [paginatedProducts, productsPage],
  );
  const wilayasPageItems = useMemo(
    () => paginatedWilayas.slice((wilayasPage - 1) * TABLE_PAGE_SIZE, wilayasPage * TABLE_PAGE_SIZE),
    [paginatedWilayas, wilayasPage],
  );
  const importsTrendPageItems = useMemo(
    () => importTrendRows.slice((importsTrendPage - 1) * TABLE_PAGE_SIZE, importsTrendPage * TABLE_PAGE_SIZE),
    [importTrendRows, importsTrendPage],
  );
  const historyPageItems = importHistoryRows;
  const historyTotalPages =
    section === 'imports'
      ? importHistoryPageData?.totalPages ?? Math.max(1, Math.ceil((stats?.importHistory ?? []).length / TABLE_PAGE_SIZE))
      : Math.max(1, Math.ceil(importHistoryRows.length / TABLE_PAGE_SIZE));
  const latestUnmatchedDetails = useMemo(
    () =>
      stats?.latestUnmatchedDetails ??
      (importHistoryRows[0]?.unmatchedDetails ?? []).slice(0, 8).map((item) => ({
        ...item,
        batchId: importHistoryRows[0]!.batchId,
      })),
    [importHistoryRows, stats?.latestUnmatchedDetails],
  );
  const productUnitsData = useMemo(
    () =>
      (stats?.topProducts ?? []).map((product) => ({
        name: product.title.length > 24 ? `${product.title.slice(0, 24)}...` : product.title,
        fullName: product.title,
        units: product.unitsSold,
        revenue: product.revenue,
        profit: product.profit,
      })),
    [stats],
  );
  const topCategoryData = useMemo(
    () =>
      (stats?.topCategories ?? []).map((item) => ({
        name: item.title,
        revenue: item.revenue,
        profit: item.profit,
      })),
    [stats],
  );
  const topBrandData = useMemo(
    () =>
      (stats?.topBrands ?? []).map((item) => ({
        name: item.title,
        revenue: item.revenue,
        profit: item.profit,
      })),
    [stats],
  );
  const websiteCards = useMemo(() => {
    if (!stats) {
      return [];
    }

    return [
      {
        title: t('website.cards.sessions'),
        value: formatNumber(locale, stats.website.sessions),
        accent: 'bg-[hsl(var(--chart-1))]',
        icon: Calendar,
      },
      {
        title: t('website.cards.pageViews'),
        value: formatNumber(locale, stats.website.pageViews),
        accent: 'bg-[hsl(var(--chart-2))]',
        icon: Layers,
      },
      {
        title: t('website.cards.engagementRate'),
        value: formatPercent(locale, stats.website.engagementRate),
        accent: 'bg-[hsl(var(--chart-3))]',
        icon: MousePointer,
      },
      {
        title: t('website.cards.purchaseRate'),
        value: formatPercent(locale, stats.website.sessionConversionRate),
        accent: 'bg-[hsl(var(--chart-4))]',
        icon: Target,
      },
      {
        title: t('website.cards.returningJourneys'),
        value: formatNumber(locale, stats.website.returningJourneys),
        accent: 'bg-[hsl(var(--chart-2))]',
        icon: Users,
      },
      {
        title: t('website.cards.errorRate'),
        value: formatPercent(locale, stats.website.errorRate),
        accent: 'bg-[hsl(var(--chart-5))]',
        icon: AlertCircle,
      },
    ];
  }, [locale, stats, t]);
  const websiteFunnelData = useMemo(
    () =>
      (stats?.website.funnel ?? []).map((item) => ({
        name: t(`website.funnel.${item.name}`),
        value: item.value,
      })),
    [stats, t],
  );
  const websiteConversionRows = useMemo(() => {
    if (!stats) {
      return [];
    }

    return [
      {
        label: t('website.conversion.sessionsToPurchase'),
        numerator: stats.website.purchases,
        denominator: stats.website.sessions,
        value: stats.website.sessionConversionRate,
      },
      {
        label: t('website.conversion.viewToCart'),
        numerator: stats.website.addToCarts,
        denominator: stats.website.productViews,
        value: stats.website.viewToCartRate,
      },
      {
        label: t('website.conversion.cartToPurchase'),
        numerator: stats.website.purchases,
        denominator: stats.website.addToCarts,
        value: stats.website.cartToPurchaseRate,
      },
      {
        label: t('website.conversion.checkoutToPurchase'),
        numerator: stats.website.purchases,
        denominator: stats.website.checkoutStarts,
        value: stats.website.checkoutToPurchaseRate,
      },
      {
        label: t('website.conversion.searchZeroResultRate'),
        numerator: stats.website.zeroResultSearches,
        denominator: stats.website.searches,
        value: stats.website.searches > 0 ? (stats.website.zeroResultSearches / stats.website.searches) * 100 : 0,
      },
    ];
  }, [stats, t]);
  const websiteDiagnostics = useMemo(() => {
    if (!stats) {
      return [];
    }

    return [
      {
        label: t('website.diagnostics.journeys'),
        value: formatNumber(locale, stats.website.journeys),
      },
      {
        label: t('website.diagnostics.productViews'),
        value: formatNumber(locale, stats.website.productViews),
      },
      {
        label: t('website.diagnostics.checkoutStarts'),
        value: formatNumber(locale, stats.website.checkoutStarts),
      },
      {
        label: t('website.diagnostics.searches'),
        value: formatNumber(locale, stats.website.searches),
      },
      {
        label: t('website.diagnostics.zeroResults'),
        value: formatNumber(locale, stats.website.zeroResultSearches),
      },
      {
        label: t('website.diagnostics.avgPagesPerSession'),
        value: stats.website.sessions > 0 ? new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(stats.website.pageViews / stats.website.sessions) : '0',
      },
    ];
  }, [locale, stats, t]);

  const isRefreshing = (needsDashboardStats && (statsQuery.isFetching || refreshStatsMutation.isPending)) || (section === 'imports' && importHistoryQuery.isFetching);
  const handleRefresh = () => {
    if (needsDashboardStats) {
      refreshStatsMutation.mutate();
    }

    if (section === 'imports') {
      void importHistoryQuery.refetch();
    }
  };

  useEffect(() => {
    queueMicrotask(() => {
      setProductsPage(1);
      setWilayasPage(1);
      setImportsTrendPage(1);
    });
  }, [stats]);

  useEffect(() => {
    if (section === 'imports' && !importHistoryQuery.isPlaceholderData && importHistoryPageData?.page && importHistoryPageData.page !== historyPage) {
      setHistoryPage(importHistoryPageData.page);
    }
  }, [historyPage, importHistoryPageData?.page, importHistoryQuery.isPlaceholderData, section]);

  if (needsDashboardStats && statsQuery.isLoading && !stats) {
    return <StatsPageSkeleton />;
  }

  if (needsDashboardStats && (statsQuery.isError || !stats)) {
    return (
      <Alert variant="destructive">
        <AlertCircle />
        <AlertTitle>{t('errorTitle')}</AlertTitle>
        <AlertDescription>{statsQuery.error instanceof Error ? statsQuery.error.message : t('errorDescription')}</AlertDescription>
      </Alert>
    );
  }
  const ensuredStats = stats as StatsDashboardData;
  const metaHealth = stats?.metaAds?.health ?? {
    pending: 0,
    retryable: 0,
    delivered: 0,
    failed: 0,
    skipped: 0,
    oldestPendingAt: null,
    eligibleOrders: 0,
    confirmedOrders: 0,
    orderConfirmedOrders: 0,
    purchaseOrders: 0,
    negativeOutcomePurchases: 0,
    workerLastHeartbeatAt: null,
  };
  const purchaseCoverage = metaHealth.eligibleOrders > 0
    ? (metaHealth.purchaseOrders / metaHealth.eligibleOrders) * 100
    : 0;
  const orderConfirmedCoverage = metaHealth.confirmedOrders > 0
    ? (metaHealth.orderConfirmedOrders / metaHealth.confirmedOrders) * 100
    : 0;

  return (
    <div className="flex flex-col gap-6">
      <div className={cn('grid gap-4', section === 'imports' ? 'xl:grid-cols-[1.1fr_0.9fr]' : 'xl:grid-cols-1')}>
        <Card className="rounded-[2rem] border-border/60 bg-card p-5 sm:p-6">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{title}</p>
              <Button type="button" variant="outline" disabled={isRefreshing} onClick={handleRefresh}>
                <RefreshCcw data-icon="inline-start" />
                {t('refresh')}
              </Button>
            </div>

            <div className="flex flex-wrap gap-2">
              {rangePresets.map((preset) => (
                <Button
                  key={preset}
                  type="button"
                  variant={range === preset ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setRange(preset)}
                >
                  {t(`ranges.${preset}`)}
                </Button>
              ))}
            </div>

            {range === 'custom' ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} aria-label={t('customStart')} />
                <Input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} aria-label={t('customEnd')} />
              </div>
            ) : null}

            {isRefreshing && stats ? (
              <div className="rounded-[1.4rem] border border-border/70 bg-muted/20 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-foreground">{t('loading.refreshingTitle')}</p>
                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{t('loading.refreshingBadge')}</p>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full w-2/5 animate-pulse rounded-full bg-primary/70" />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{t('loading.refreshingDescription')}</p>
              </div>
            ) : null}

            {stats?.snapshot ? (
              <Alert variant={stats.snapshot.isStale ? 'destructive' : 'default'}>
                <AlertCircle />
                <AlertTitle>{stats.snapshot.isStale ? t('snapshotMeta.staleTitle') : t('snapshotMeta.title')}</AlertTitle>
                <AlertDescription>
                  {t('snapshotMeta.description', {
                    generatedAt: formatDateTime(locale, stats.snapshot.generatedAt),
                    reportThroughDate: formatDate(locale, stats.snapshot.reportThroughDate),
                  })}
                </AlertDescription>
              </Alert>
            ) : null}
          </div>
        </Card>

        {section === 'imports' ? (
          <Card className="rounded-[2rem] border-border/60 bg-linear-to-br from-card via-card to-muted/35 p-6">
            <div className="flex h-full flex-col gap-5">
              {importStage !== 'idle' ? (
                <div className="rounded-[1.4rem] border border-border/70 bg-background/80 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {importStage === 'uploading' ? t('imports.progress.uploadingTitle') : t('imports.progress.processingTitle')}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {importStage === 'uploading' ? t('imports.progress.uploadingDescription') : t('imports.progress.processingDescription')}
                      </p>
                    </div>
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                      {importStage === 'uploading' ? t('imports.progress.uploadingBadge') : t('imports.progress.processingBadge')}
                    </p>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                    <div className={cn('h-full rounded-full bg-primary transition-all duration-500', importStage === 'uploading' ? 'w-1/2 animate-pulse' : 'w-4/5 animate-pulse')} />
                  </div>
                </div>
              ) : null}
              <FileUploadField
                uploadUrl="/api/uploads/stats"
                label={t('upload.fieldLabel')}
                hint={t('upload.hint')}
                value={uploadedFiles}
                onChange={setUploadedFiles}
                onUploadStart={handleUploadStarted}
                onUploaded={({ body }) => void handleUploadCompleted(body)}
                bundleUploads
                maxNumberOfFiles={100}
              />
            </div>
          </Card>
        ) : null}
      </div>

      {section === 'overview' ? (
        <div className="flex flex-col gap-6">
          <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {overviewCards.map((item) => (
              <MetricCard
                key={item.title}
                accent={item.accent}
                icon={item.icon}
                title={item.title}
                value={item.value}
              />
            ))}
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <SectionCard title={t('overview.costs.title')}>
              <div className="space-y-1">
                <CostRow label={t('overview.costs.productCost')} value={ensuredStats.summary.totalProductCost} total={ensuredStats.summary.totalProductCost + ensuredStats.summary.totalFees + ensuredStats.adCosts.totalSpend} />
                <CostRow label={t('overview.costs.deliveryFees')} value={ensuredStats.feeBreakdown.livraison} total={ensuredStats.summary.totalProductCost + ensuredStats.summary.totalFees + ensuredStats.adCosts.totalSpend} />
                <CostRow
                  label={t('overview.costs.otherFees')}
                  value={ensuredStats.feeBreakdown.total - ensuredStats.feeBreakdown.livraison}
                  total={ensuredStats.summary.totalProductCost + ensuredStats.summary.totalFees + ensuredStats.adCosts.totalSpend}
                />
                {ensuredStats.adCosts.totalSpend > 0 ? (
                  <CostRow
                    label={t('overview.costs.adSpend')}
                    value={ensuredStats.adCosts.totalSpend}
                    total={ensuredStats.summary.totalProductCost + ensuredStats.summary.totalFees + ensuredStats.adCosts.totalSpend}
                    highlight
                  />
                ) : null}
                <div className="border-t border-border/70 pt-2">
                  <CostRow
                    label={t('overview.costs.total')}
                    value={ensuredStats.summary.totalProductCost + ensuredStats.summary.totalFees + ensuredStats.adCosts.totalSpend}
                    total={ensuredStats.summary.totalProductCost + ensuredStats.summary.totalFees + ensuredStats.adCosts.totalSpend}
                    bold
                  />
                </div>
              </div>
            </SectionCard>

            <SectionCard title={t('overview.fees.title')}>
              {feeData.length > 0 ? (
                <ChartContainer config={feeBreakdownConfig} className="h-[320px] sm:h-[360px]">
                  <PieChart>
                    <ChartTooltip content={<ChartTooltipContent formatter={(value) => formatCurrency(locale, Number(value))} />} />
                    <Pie data={feeData} dataKey="value" nameKey="name" innerRadius={70} outerRadius={112} paddingAngle={3} animationDuration={900}>
                      {feeData.map((item) => (
                        <Cell key={item.name} fill={item.fill} />
                      ))}
                    </Pie>
                    <ChartLegend content={<ChartLegendContent />} />
                  </PieChart>
                </ChartContainer>
              ) : (
                <Empty className="border-none">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <Truck />
                    </EmptyMedia>
                    <EmptyTitle>{t('overview.emptyFeesTitle')}</EmptyTitle>
                    <EmptyDescription>{t('overview.emptyFeesDescription')}</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
            </SectionCard>
          </div>

          <SectionCard title={t('overview.revenueChart.title')}>
            <ChartContainer config={revenueBreakdownConfig} className="h-[360px]">
              <BarChart data={revenueBreakdown}>
                <CartesianGrid vertical={false} strokeDasharray="4 6" />
                <XAxis dataKey="name" tickLine={false} axisLine={false} minTickGap={12} interval={0} angle={-18} textAnchor="end" height={64} />
                <YAxis hide />
                <ChartTooltip content={<ChartTooltipContent formatter={(value) => formatCurrency(locale, Number(value))} />} />
                <Bar dataKey="value" radius={14} animationDuration={900}>
                  {revenueBreakdown.map((item, index) => (
                    <Cell key={item.name} fill={`hsl(var(--chart-${(index % 5) + 1}))`} />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          </SectionCard>

          <SectionCard title={t('website.title')}>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {websiteCards.map((item) => (
                <MetricCard
                  key={item.title}
                  accent={item.accent}
                  icon={item.icon}
                  title={item.title}
                  value={item.value}
                />
              ))}
            </div>
          </SectionCard>
        </div>
      ) : null}

      {section === 'website' ? (
        <div className="flex flex-col gap-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {websiteCards.map((item) => (
              <MetricCard
                key={item.title}
                accent={item.accent}
                icon={item.icon}
                title={item.title}
                value={item.value}
              />
            ))}
          </div>

          <SectionCard title={t('website.trendTitle')}>
            <ChartContainer config={websiteTrendConfig} className="h-[360px]">
              <LineChart data={ensuredStats.website.trend}>
                <CartesianGrid vertical={false} strokeDasharray="4 6" />
                <XAxis dataKey="bucket" tickFormatter={(value) => formatBucket(locale, String(value))} tickLine={false} axisLine={false} minTickGap={18} />
                <YAxis hide />
                <ChartTooltip content={<ChartTooltipContent formatter={(value) => formatNumber(locale, Number(value))} labelFormatter={(value) => formatBucket(locale, String(value))} />} />
                <Line type="monotone" dataKey="sessions" stroke="var(--color-sessions)" strokeWidth={3} dot={false} />
                <Line type="monotone" dataKey="pageViews" stroke="var(--color-pageViews)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="purchases" stroke="var(--color-purchases)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="errors" stroke="var(--color-errors)" strokeWidth={2} dot={false} />
                <ChartLegend content={<ChartLegendContent />} />
              </LineChart>
            </ChartContainer>
          </SectionCard>

          <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
            <SectionCard title={t('website.funnelTitle')}>
              {websiteFunnelData.length > 0 ? (
                <ChartContainer config={websiteFunnelConfig} className="h-[320px]">
                  <BarChart data={websiteFunnelData}>
                    <CartesianGrid vertical={false} strokeDasharray="4 6" />
                    <XAxis dataKey="name" tickLine={false} axisLine={false} interval={0} angle={-14} textAnchor="end" height={58} />
                    <YAxis hide />
                    <ChartTooltip content={<ChartTooltipContent formatter={(value) => formatNumber(locale, Number(value))} />} />
                    <Bar dataKey="value" fill="var(--color-value)" radius={12} animationDuration={900} />
                  </BarChart>
                </ChartContainer>
              ) : (
                <p className="text-sm text-muted-foreground">{t('website.empty')}</p>
              )}
            </SectionCard>

            <SectionCard title={t('website.quickStatsTitle')}>
              <div className="grid gap-3 sm:grid-cols-2">
                {websiteDiagnostics.map((item) => (
                  <StatBlock key={item.label} label={item.label} value={item.value} />
                ))}
              </div>
            </SectionCard>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <SectionCard title={t('website.conversion.title')}>
              <div className="space-y-1">
                {websiteConversionRows.map((item) => (
                  <CostRow
                    key={item.label}
                    label={`${item.label} (${formatNumber(locale, item.numerator)}/${formatNumber(locale, item.denominator)})`}
                    value={item.numerator}
                    total={item.denominator || 1}
                  />
                ))}
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {websiteConversionRows.map((item) => (
                  <StatBlock key={`${item.label}-rate`} label={item.label} value={formatPercent(locale, item.value)} />
                ))}
              </div>
            </SectionCard>

            <SectionCard title={t('website.searchInsightsTitle')}>
              <div className="grid gap-3 sm:grid-cols-2">
                <StatBlock label={t('website.stats.searches')} value={formatNumber(locale, ensuredStats.website.searches)} />
                <StatBlock label={t('website.stats.zeroResults')} value={formatNumber(locale, ensuredStats.website.zeroResultSearches)} />
                <StatBlock label={t('website.stats.checkoutRate')} value={formatPercent(locale, ensuredStats.website.checkoutToPurchaseRate)} />
                <StatBlock label={t('website.stats.cartRate')} value={formatPercent(locale, ensuredStats.website.cartToPurchaseRate)} />
              </div>
              <div className="mt-5 overflow-hidden rounded-[1.5rem] border border-border/70">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('website.search.columns.term')}</TableHead>
                      <TableHead>{t('website.search.columns.searches')}</TableHead>
                      <TableHead>{t('website.search.columns.zeroResults')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ensuredStats.website.topSearches.length > 0 ? ensuredStats.website.topSearches.map((item) => (
                      <TableRow key={item.term}>
                        <TableCell className="font-medium">{item.term}</TableCell>
                        <TableCell>{formatNumber(locale, item.searches)}</TableCell>
                        <TableCell>{formatNumber(locale, item.zeroResults)}</TableCell>
                      </TableRow>
                    )) : (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-muted-foreground">{t('website.empty')}</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </SectionCard>
          </div>

          <SectionCard title={t('website.pageTypesTitle')}>
            <div className="overflow-hidden rounded-[1.5rem] border border-border/70">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('website.experience.columns.dimension')}</TableHead>
                    <TableHead>{t('website.experience.columns.sessions')}</TableHead>
                    <TableHead>{t('website.experience.columns.pageViews')}</TableHead>
                    <TableHead>{t('website.experience.columns.interactions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ensuredStats.website.pageTypes.length > 0 ? ensuredStats.website.pageTypes.map((item) => (
                    <TableRow key={item.name}>
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell>{formatNumber(locale, item.sessions)}</TableCell>
                      <TableCell>{formatNumber(locale, item.pageViews)}</TableCell>
                      <TableCell>{formatNumber(locale, item.interactions)}</TableCell>
                    </TableRow>
                  )) : (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground">{t('website.empty')}</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </SectionCard>

          <div className="grid gap-4 xl:grid-cols-2">
            <SectionCard title={t('website.audienceTitle')}>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{t('website.devices')}</p>
                  <div className="space-y-2">{ensuredStats.website.devices.map((item) => <StatBlock key={item.name} label={item.name} value={formatNumber(locale, item.sessions)} />)}</div>
                </div>
                <div>
                  <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{t('website.locales')}</p>
                  <div className="space-y-2">{ensuredStats.website.locales.map((item) => <StatBlock key={item.name} label={item.name} value={formatNumber(locale, item.sessions)} />)}</div>
                </div>
              </div>
            </SectionCard>

            <SectionCard title={t('website.topProductsTitle')}>
              <div className="overflow-hidden rounded-[1.5rem] border border-border/70">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('website.products.columns.product')}</TableHead>
                      <TableHead>{t('website.products.columns.views')}</TableHead>
                      <TableHead>{t('website.products.columns.adds')}</TableHead>
                      <TableHead>{t('website.products.columns.purchases')}</TableHead>
                      <TableHead>{t('website.products.columns.conversion')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ensuredStats.website.topProducts.length > 0 ? ensuredStats.website.topProducts.map((product) => (
                      <TableRow key={product.id}>
                        <TableCell className="font-medium">
                          <div className="flex flex-col">
                            <span>{product.title}</span>
                            <span className="text-xs text-muted-foreground">{product.sku || product.categoryName || '—'}</span>
                          </div>
                        </TableCell>
                        <TableCell>{formatNumber(locale, product.viewCount ?? 0)}</TableCell>
                        <TableCell>{formatNumber(locale, product.addToCartCount ?? 0)}</TableCell>
                        <TableCell>{formatNumber(locale, product.websitePurchaseCount ?? 0)}</TableCell>
                        <TableCell>{formatPercent(locale, product.websiteConversionRate ?? 0)}</TableCell>
                      </TableRow>
                    )) : (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground">{t('website.empty')}</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </SectionCard>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <SectionCard title={t('website.vitalsTitle')}>
              <p className="mb-4 text-sm text-muted-foreground">{t('website.recentDiagnosticsHint')}</p>
              <div className="grid gap-3 sm:grid-cols-3">
                {ensuredStats.website.vitals.map((item) => (
                  <div key={item.name} className="rounded-[1.25rem] border border-border/70 bg-muted/20 p-4">
                    <div className="flex items-center justify-between gap-2"><span className="font-semibold">{item.name}</span><Gauge className="size-4 text-muted-foreground" /></div>
                    <p className="mt-2 text-2xl font-semibold">{item.name === 'CLS' ? item.average.toFixed(3) : `${formatNumber(locale, item.average)} ms`}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{t('website.vitalMeta', { good: item.good, poor: item.poor, samples: item.samples })}</p>
                  </div>
                ))}
                {ensuredStats.website.vitals.length === 0 ? <p className="text-sm text-muted-foreground">{t('website.empty')}</p> : null}
              </div>
            </SectionCard>

            <SectionCard title={t('website.errorsTitle')}>
              <p className="mb-4 text-sm text-muted-foreground">{t('website.recentDiagnosticsHint')}</p>
              <div className="space-y-2">
                {ensuredStats.website.errors.map((item) => <StatBlock key={item.name} label={item.name} value={formatNumber(locale, item.count)} />)}
                {ensuredStats.website.errors.length === 0 ? <p className="text-sm text-muted-foreground">{t('website.empty')}</p> : null}
              </div>
            </SectionCard>
          </div>

          <SectionCard title={t('website.referrersTitle')}>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {ensuredStats.website.referrers.map((item) => <StatBlock key={item.name} label={item.name} value={formatNumber(locale, item.sessions)} />)}
            </div>
          </SectionCard>
        </div>
      ) : null}

      {section === 'landingPages' ? (
        <div className="flex flex-col gap-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <MetricCard accent="bg-primary" icon={FileText} title={t('landingPages.cards.published')} value={formatNumber(locale, ensuredStats.landingPages.summary.published)} />
            <MetricCard accent="bg-[hsl(var(--chart-1))]" icon={Users} title={t('landingPages.cards.sessions')} value={formatNumber(locale, ensuredStats.landingPages.summary.sessions)} />
            <MetricCard accent="bg-[hsl(var(--chart-2))]" icon={Target} title={t('landingPages.cards.purchases')} value={formatNumber(locale, ensuredStats.landingPages.summary.purchases)} />
            <MetricCard accent="bg-[hsl(var(--chart-3))]" icon={TrendingUp} title={t('landingPages.cards.conversion')} value={formatPercent(locale, ensuredStats.landingPages.summary.conversionRate)} />
            <MetricCard accent="bg-[hsl(var(--chart-4))]" icon={DollarSign} title={t('landingPages.cards.revenue')} value={formatCurrency(locale, ensuredStats.landingPages.summary.revenue)} />
            <MetricCard accent="bg-[hsl(var(--chart-5))]" icon={Package} title={t('landingPages.cards.drafts')} value={formatNumber(locale, ensuredStats.landingPages.summary.drafts)} />
          </div>

          <SectionCard title={t('landingPages.performanceTitle')}>
            <div className="overflow-x-auto rounded-[1.5rem] border border-border/70">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>{t('landingPages.columns.page')}</TableHead><TableHead>{t('landingPages.columns.status')}</TableHead><TableHead>{t('landingPages.columns.sessions')}</TableHead><TableHead>{t('landingPages.columns.views')}</TableHead><TableHead>{t('landingPages.columns.adds')}</TableHead><TableHead>{t('landingPages.columns.checkouts')}</TableHead><TableHead>{t('landingPages.columns.purchases')}</TableHead><TableHead>{t('landingPages.columns.revenue')}</TableHead><TableHead>{t('landingPages.columns.conversion')}</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {ensuredStats.landingPages.pages.map((item) => <TableRow key={item.id}>
                    <TableCell className="font-medium"><div className="flex flex-col"><span>{item.slug}</span><span className="text-xs text-muted-foreground">{item.product} · {item.locale.toUpperCase()} · v{item.revision ?? '—'}</span></div></TableCell>
                    <TableCell>{item.status}</TableCell><TableCell>{formatNumber(locale, item.sessions)}</TableCell><TableCell>{formatNumber(locale, item.productViews)}</TableCell><TableCell>{formatNumber(locale, item.addToCarts)}</TableCell><TableCell>{formatNumber(locale, item.checkoutStarts)}</TableCell><TableCell>{formatNumber(locale, item.purchases)}</TableCell><TableCell>{formatCurrency(locale, item.revenue)}</TableCell><TableCell>{formatPercent(locale, item.conversionRate)}</TableCell>
                  </TableRow>)}
                  {ensuredStats.landingPages.pages.length === 0 ? <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">{t('landingPages.empty')}</TableCell></TableRow> : null}
                </TableBody>
              </Table>
            </div>
          </SectionCard>

          <SectionCard title={t('landingPages.blocksTitle')}>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {ensuredStats.landingPages.blocks.map((item) => <div key={item.name} className="rounded-[1.25rem] border border-border/70 bg-muted/20 p-4"><p className="font-medium">{item.name}</p><p className="mt-2 text-2xl font-semibold">{formatNumber(locale, item.interactions)}</p><p className="mt-1 text-xs text-muted-foreground">{t('landingPages.blockMeta', { adds: item.addToCarts, checkouts: item.checkouts })}</p></div>)}
              {ensuredStats.landingPages.blocks.length === 0 ? <p className="text-sm text-muted-foreground">{t('landingPages.empty')}</p> : null}
            </div>
          </SectionCard>
        </div>
      ) : null}

      {section === 'aiAssistants' ? (
        <div className="flex flex-col gap-6">
          <SectionCard title={t('aiAssistants.admin.title')}>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard accent="bg-primary" icon={Bot} title={t('aiAssistants.cards.runs')} value={formatNumber(locale, ensuredStats.aiAssistants.admin.runs)} />
              <MetricCard accent="bg-emerald-500" icon={Target} title={t('aiAssistants.cards.successRate')} value={formatPercent(locale, ensuredStats.aiAssistants.admin.successRate)} />
              <MetricCard accent="bg-violet-500" icon={Gauge} title={t('aiAssistants.cards.tokens')} value={formatNumber(locale, ensuredStats.aiAssistants.admin.totalTokens)} />
              <MetricCard accent="bg-blue-500" icon={DollarSign} title={t('aiAssistants.cards.estimatedCost')} value={formatUsd(locale, ensuredStats.aiAssistants.admin.estimatedCostUsd)} />
              <MetricCard accent="bg-amber-500" icon={Calendar} title={t('aiAssistants.cards.latency')} value={formatMilliseconds(locale, ensuredStats.aiAssistants.admin.averageDurationMs)} />
              <MetricCard accent="bg-[hsl(var(--chart-2))]" icon={MousePointer} title={t('aiAssistants.cards.toolCalls')} value={formatNumber(locale, ensuredStats.aiAssistants.admin.toolCalls)} />
              <MetricCard accent="bg-[hsl(var(--chart-3))]" icon={FileText} title={t('aiAssistants.cards.proposals')} value={formatNumber(locale, ensuredStats.aiAssistants.admin.proposals)} />
              <MetricCard accent="bg-[hsl(var(--chart-4))]" icon={TrendingUp} title={t('aiAssistants.cards.applied')} value={formatNumber(locale, ensuredStats.aiAssistants.admin.appliedProposals)} />
            </div>
            <p className="mt-4 text-sm text-muted-foreground">{t('aiAssistants.costHint')}</p>
            <div className="mt-5 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
              <ChartContainer config={aiTrendConfig} className="h-[300px]"><LineChart data={ensuredStats.aiAssistants.admin.trend}><CartesianGrid vertical={false} strokeDasharray="4 6" /><XAxis dataKey="bucket" tickFormatter={(value) => formatBucket(locale, String(value))} tickLine={false} axisLine={false} /><YAxis hide /><ChartTooltip content={<ChartTooltipContent />} /><Line dataKey="runs" stroke="var(--color-runs)" strokeWidth={3} dot={false} /><Line dataKey="completed" stroke="var(--color-completed)" strokeWidth={2} dot={false} /><Line dataKey="failed" stroke="var(--color-failed)" strokeWidth={2} dot={false} /></LineChart></ChartContainer>
              <div className="space-y-2">{ensuredStats.aiAssistants.admin.topTasks.map((item) => <StatBlock key={item.name} label={`${item.name} · ${formatPercent(locale, item.successRate)}`} value={formatNumber(locale, item.runs)} />)}</div>
            </div>
          </SectionCard>

          <SectionCard title={t('aiAssistants.storefront.title')}>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard accent="bg-primary" icon={Bot} title={t('aiAssistants.cards.opens')} value={formatNumber(locale, ensuredStats.aiAssistants.storefront.opens)} />
              <MetricCard accent="bg-blue-500" icon={MousePointer} title={t('aiAssistants.cards.messages')} value={formatNumber(locale, ensuredStats.aiAssistants.storefront.messages)} />
              <MetricCard accent="bg-emerald-500" icon={Target} title={t('aiAssistants.cards.resultClicks')} value={formatNumber(locale, ensuredStats.aiAssistants.storefront.resultClicks)} />
              <MetricCard accent="bg-violet-500" icon={TrendingUp} title={t('aiAssistants.cards.clickThrough')} value={formatPercent(locale, ensuredStats.aiAssistants.storefront.clickThroughRate)} />
              <MetricCard accent="bg-[hsl(var(--chart-3))]" icon={Gauge} title={t('aiAssistants.cards.tokens')} value={formatNumber(locale, ensuredStats.aiAssistants.storefront.totalTokens)} />
              <MetricCard accent="bg-[hsl(var(--chart-4))]" icon={DollarSign} title={t('aiAssistants.cards.estimatedCost')} value={formatUsd(locale, ensuredStats.aiAssistants.storefront.estimatedCostUsd)} />
              <MetricCard accent="bg-amber-500" icon={Calendar} title={t('aiAssistants.cards.latency')} value={formatMilliseconds(locale, ensuredStats.aiAssistants.storefront.averageDurationMs)} />
              <MetricCard accent="bg-red-500" icon={AlertCircle} title={t('aiAssistants.cards.errors')} value={formatNumber(locale, ensuredStats.aiAssistants.storefront.errors)} />
            </div>
            <div className="mt-5 grid gap-4 xl:grid-cols-2">
              <SectionCard title={t('aiAssistants.storefront.intentsTitle')}>
                <div className="space-y-2">{ensuredStats.aiAssistants.storefront.topIntents.map((item) => <StatBlock key={item.name} label={assistantIntentKeys.has(item.name) ? t(`aiAssistants.intents.${item.name}`) : item.name} value={formatNumber(locale, item.messages)} />)}{ensuredStats.aiAssistants.storefront.topIntents.length === 0 ? <p className="text-sm text-muted-foreground">{t('aiAssistants.empty')}</p> : null}</div>
              </SectionCard>
              <SectionCard title={t('aiAssistants.storefront.modelsTitle')}>
                <div className="space-y-2">{ensuredStats.aiAssistants.storefront.models.map((item) => <StatBlock key={item.name} label={`${item.name} · ${formatNumber(locale, item.tokens)} ${t('aiAssistants.tokensShort')}`} value={formatNumber(locale, item.runs)} />)}{ensuredStats.aiAssistants.storefront.models.length === 0 ? <p className="text-sm text-muted-foreground">{t('aiAssistants.empty')}</p> : null}</div>
              </SectionCard>
            </div>
          </SectionCard>
        </div>
      ) : null}

      {section === 'customers' ? (
        <div className="flex flex-col gap-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <MetricCard accent="bg-primary" icon={Users} title={t('customers.cards.customers')} value={formatNumber(locale, ensuredStats.customers.summary.customers)} />
            <MetricCard accent="bg-[hsl(var(--chart-2))]" icon={TrendingUp} title={t('customers.cards.repeat')} value={formatNumber(locale, ensuredStats.customers.summary.repeatCustomers)} />
            <MetricCard accent="bg-[hsl(var(--chart-3))]" icon={Target} title={t('customers.cards.repeatRate')} value={formatPercent(locale, ensuredStats.customers.summary.repeatRate)} />
            <MetricCard accent="bg-[hsl(var(--chart-4))]" icon={Package} title={t('customers.cards.averageOrders')} value={new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(ensuredStats.customers.summary.averageOrders)} />
            <MetricCard accent="bg-[hsl(var(--chart-1))]" icon={DollarSign} title={t('customers.cards.averageValue')} value={formatCurrency(locale, ensuredStats.customers.summary.averageOrderValue)} />
            <MetricCard accent="bg-emerald-500" icon={Package} title={t('customers.cards.successfulOrders')} value={formatNumber(locale, ensuredStats.customers.summary.successfulOrders)} />
          </div>
          <SectionCard title={t('customers.rankingTitle')}>
            <div className="overflow-x-auto rounded-[1.5rem] border border-border/70">
              <Table><TableHeader><TableRow><TableHead>{t('customers.columns.customer')}</TableHead><TableHead>{t('customers.columns.phone')}</TableHead><TableHead>{t('customers.columns.orders')}</TableHead><TableHead>{t('customers.columns.confirmed')}</TableHead><TableHead>{t('customers.columns.totalValue')}</TableHead><TableHead>{t('customers.columns.averageValue')}</TableHead><TableHead>{t('customers.columns.products')}</TableHead><TableHead>{t('customers.columns.lastOrder')}</TableHead></TableRow></TableHeader>
                <TableBody>{ensuredStats.customers.customers.map((item) => <TableRow key={item.phone}><TableCell className="font-medium"><div className="flex flex-col"><span>{item.name}</span><span className="text-xs text-muted-foreground">{item.city}</span></div></TableCell><TableCell className="font-mono text-xs">{item.phone}</TableCell><TableCell>{formatNumber(locale, item.orders)}</TableCell><TableCell>{formatNumber(locale, item.confirmedOrders)}</TableCell><TableCell>{formatCurrency(locale, item.totalValue)}</TableCell><TableCell>{formatCurrency(locale, item.averageOrderValue)}</TableCell><TableCell className="min-w-56">{item.products.map((product) => `${product.name} ×${product.count}`).join(', ') || '—'}</TableCell><TableCell>{formatDate(locale, item.lastOrderAt)}</TableCell></TableRow>)}{ensuredStats.customers.customers.length === 0 ? <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">{t('customers.empty')}</TableCell></TableRow> : null}</TableBody>
              </Table>
            </div>
          </SectionCard>
        </div>
      ) : null}

      {section === 'metaAds' ? (
        <div className="flex flex-col gap-6">
          <SectionCard title={t('metaAds.performanceTitle')}>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <MetricCard accent="bg-primary" icon={DollarSign} title={t('overview.adPerformance.totalSpend')} value={formatCurrency(locale, ensuredStats.adCosts.totalSpend)} />
              <MetricCard accent="bg-[hsl(var(--chart-3))]" icon={TrendingUp} title={t('overview.adPerformance.roas')} value={`${ensuredStats.adCosts.roas.toFixed(2)}x`} />
              <MetricCard accent="bg-[hsl(var(--chart-4))]" icon={Target} title={t('overview.adPerformance.cpa')} value={formatCurrency(locale, ensuredStats.adCosts.cpa)} />
              <MetricCard accent="bg-[hsl(var(--chart-3)/0.82)]" icon={MousePointer} title={t('overview.adPerformance.cpc')} value={formatCurrency(locale, ensuredStats.adCosts.cpc)} />
              <MetricCard accent="bg-[hsl(var(--chart-2))]" icon={TrendingUp} title={t('metaAds.conversionRate')} value={formatPercent(locale, ensuredStats.adCosts.conversionRate)} />
            </div>
          </SectionCard>

          <SectionCard title={t('metaAds.paidAttribution.title')}>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <MetricCard accent="bg-blue-500" icon={MousePointer} title={t('metaAds.paidAttribution.visits')} value={formatNumber(locale, ensuredStats.metaAds.paidAttribution.visits)} />
              <MetricCard accent="bg-violet-500" icon={FileText} title={t('metaAds.paidAttribution.orders')} value={formatNumber(locale, ensuredStats.metaAds.paidAttribution.createdOrders)} />
              <MetricCard accent="bg-emerald-500" icon={Target} title={t('metaAds.paidAttribution.purchases')} value={formatNumber(locale, ensuredStats.metaAds.paidAttribution.purchases)} />
              <MetricCard accent="bg-amber-500" icon={AlertCircle} title={t('metaAds.paidAttribution.landedOnly')} value={formatNumber(locale, ensuredStats.metaAds.paidAttribution.landedOnly)} />
              <MetricCard accent="bg-[hsl(var(--chart-2))]" icon={TrendingUp} title={t('metaAds.paidAttribution.conversion')} value={formatPercent(locale, ensuredStats.metaAds.paidAttribution.conversionRate)} />
            </div>
            {ensuredStats.metaAds.paidAttribution.topCampaigns.length > 0 ? (
              <div className="mt-5 overflow-hidden rounded-[1.5rem] border border-border/70">
                <Table>
                  <TableHeader><TableRow><TableHead>{t('metaAds.paidAttribution.campaign')}</TableHead><TableHead>{t('metaAds.paidAttribution.visits')}</TableHead><TableHead>{t('metaAds.paidAttribution.orders')}</TableHead><TableHead>{t('metaAds.paidAttribution.purchases')}</TableHead></TableRow></TableHeader>
                  <TableBody>{ensuredStats.metaAds.paidAttribution.topCampaigns.map((item) => <TableRow key={item.name}><TableCell className="font-medium">{item.name}</TableCell><TableCell>{formatNumber(locale, item.visits)}</TableCell><TableCell>{formatNumber(locale, item.orders)}</TableCell><TableCell>{formatNumber(locale, item.purchases)}</TableCell></TableRow>)}</TableBody>
                </Table>
              </div>
            ) : null}
          </SectionCard>

          <SectionCard title={t('metaAds.managerTitle')}>
            <AdCostsManager range={range} startDate={startDate} endDate={endDate} />
          </SectionCard>

          <SectionCard title={t('metaAds.health.title')}>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <MetricCard accent="bg-amber-500" icon={RefreshCcw} title={t('metaAds.health.pending')} value={formatNumber(locale, metaHealth.pending + metaHealth.retryable)} />
              <MetricCard accent="bg-emerald-500" icon={Target} title={t('metaAds.health.delivered')} value={formatNumber(locale, metaHealth.delivered)} />
              <MetricCard accent="bg-red-500" icon={AlertCircle} title={t('metaAds.health.failed')} value={formatNumber(locale, metaHealth.failed + metaHealth.skipped)} />
              <MetricCard accent="bg-blue-500" icon={MousePointer} title={t('metaAds.health.purchaseCoverage')} value={formatPercent(locale, purchaseCoverage)} />
              <MetricCard accent="bg-violet-500" icon={TrendingUp} title={t('metaAds.health.orderConfirmedCoverage')} value={formatPercent(locale, orderConfirmedCoverage)} />
            </div>
            <div className="mt-3 text-xs text-muted-foreground">
              {t('metaAds.health.worker', {
                heartbeat: formatDateTime(locale, metaHealth.workerLastHeartbeatAt),
                oldest: formatDateTime(locale, metaHealth.oldestPendingAt),
                negative: metaHealth.negativeOutcomePurchases,
              })}
            </div>
          </SectionCard>

          <SectionCard title={t('metaAds.eventsTitle')}>
            {ensuredStats.metaAds.events.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('metaAds.events.columns.event')}</TableHead>
                      <TableHead>{t('metaAds.events.columns.total')}</TableHead>
                      <TableHead>{t('metaAds.events.columns.pixel')}</TableHead>
                      <TableHead>{t('metaAds.events.columns.capiSent')}</TableHead>
                      <TableHead>{t('metaAds.events.columns.capiDelivered')}</TableHead>
                      <TableHead>{t('metaAds.events.columns.capiFailed')}</TableHead>
                      <TableHead>{t('metaAds.events.columns.lastSeen')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ensuredStats.metaAds.events.map((event) => (
                      <TableRow key={event.name}>
                        <TableCell className="font-medium">{event.name}</TableCell>
                        <TableCell>{formatNumber(locale, event.total)}</TableCell>
                        <TableCell>{formatNumber(locale, event.pixelFired)}</TableCell>
                        <TableCell>{formatNumber(locale, event.capiSent)}</TableCell>
                        <TableCell>{formatNumber(locale, event.capiDelivered)}</TableCell>
                        <TableCell>{formatNumber(locale, event.capiFailed)}</TableCell>
                        <TableCell>{formatDateTime(locale, event.lastOccurredAt)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">{t('metaAds.events.empty')}</div>
            )}
          </SectionCard>

          <SectionCard title={t('metaAds.payloadsTitle')}>
            {ensuredStats.metaAds.recentPayloads.length > 0 ? (
              <div className="grid gap-3">
                {ensuredStats.metaAds.recentPayloads.map((event) => (
                  <Card key={`${event.metaEventName}-${event.eventId}`} className="rounded-xl p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="font-semibold">{event.metaEventName}</div>
                        <div className="text-xs text-muted-foreground">
                          {t('metaAds.payloads.meta', {
                            analyticsEvent: event.analyticsEventName,
                            eventId: event.eventId,
                            occurredAt: formatDateTime(locale, event.occurredAt),
                          })}
                        </div>
                      </div>
                      <div className={cn(
                        'rounded-full px-2 py-1 text-xs font-medium',
                        event.capiOk ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800',
                      )}>
                        {event.capiOk
                          ? t('metaAds.payloads.delivered')
                          : typeof event.capiPayload.status === 'string'
                            ? event.capiPayload.status
                            : t('metaAds.payloads.failed')}
                        {' · '}
                        {event.capiStatus == null
                          ? t('metaAds.payloads.noStatus')
                          : t('metaAds.payloads.status', { status: event.capiStatus })}
                      </div>
                    </div>
                    <pre className="mt-3 max-h-56 overflow-auto rounded-lg bg-muted p-3 text-xs">
                      {JSON.stringify(event.capiPayload, null, 2)}
                    </pre>
                  </Card>
                ))}
              </div>
            ) : (
              <Empty className="border-none">
                <EmptyHeader>
                  <EmptyMedia variant="icon"><Target /></EmptyMedia>
                  <EmptyTitle>{t('metaAds.payloads.emptyTitle')}</EmptyTitle>
                  <EmptyDescription>{t('metaAds.payloads.emptyDescription')}</EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </SectionCard>
        </div>
      ) : null}

      {section === 'products' ? (
        <div className="flex flex-col gap-6">
          <SectionCard title={t('products.topUnits.title')}>
            {productUnitsData.length > 0 ? (
              <ChartContainer config={topProductsConfig} className="h-[420px]">
                <BarChart data={productUnitsData} layout="vertical" margin={{ left: 28, right: 8 }}>
                  <CartesianGrid horizontal={false} strokeDasharray="4 6" />
                  <XAxis type="number" tickLine={false} axisLine={false} />
                  <YAxis dataKey="name" type="category" width={170} tickLine={false} axisLine={false} />
                  <ChartTooltip content={<ChartTooltipContent formatter={(value) => formatNumber(locale, Number(value))} />} />
                  <Bar dataKey="units" fill="var(--color-units)" radius={12} animationDuration={900} />
                </BarChart>
              </ChartContainer>
            ) : (
              <Empty className="border-none">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Package />
                  </EmptyMedia>
                  <EmptyTitle>{t('products.emptyTitle')}</EmptyTitle>
                  <EmptyDescription>{t('products.emptyDescription')}</EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </SectionCard>

          <div className="grid gap-4 xl:grid-cols-2">
            <SectionCard title={t('products.categories.title')}>
              {topCategoryData.length > 0 ? (
                <ChartContainer config={segmentConfig}>
                  <BarChart data={topCategoryData}>
                    <CartesianGrid vertical={false} strokeDasharray="4 6" />
                    <XAxis dataKey="name" tickLine={false} axisLine={false} interval={0} angle={-18} textAnchor="end" height={60} />
                    <YAxis hide />
                    <ChartTooltip content={<ChartTooltipContent formatter={(value) => formatCurrency(locale, Number(value))} />} />
                    <Bar dataKey="revenue" fill="var(--color-revenue)" radius={10} animationDuration={800} />
                    <Bar dataKey="profit" fill="var(--color-profit)" radius={10} animationDuration={1000} />
                    <ChartLegend content={<ChartLegendContent />} />
                  </BarChart>
                </ChartContainer>
              ) : (
                <Empty className="border-none">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <Layers />
                    </EmptyMedia>
                    <EmptyTitle>{t('products.emptyCategoriesTitle')}</EmptyTitle>
                    <EmptyDescription>{t('products.emptyCategoriesDescription')}</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
            </SectionCard>

            <SectionCard title={t('products.brands.title')}>
              {topBrandData.length > 0 ? (
                <ChartContainer config={segmentConfig}>
                  <BarChart data={topBrandData}>
                    <CartesianGrid vertical={false} strokeDasharray="4 6" />
                    <XAxis dataKey="name" tickLine={false} axisLine={false} interval={0} angle={-18} textAnchor="end" height={60} />
                    <YAxis hide />
                    <ChartTooltip content={<ChartTooltipContent formatter={(value) => formatCurrency(locale, Number(value))} />} />
                    <Bar dataKey="revenue" fill="var(--color-revenue)" radius={10} animationDuration={800} />
                    <Bar dataKey="profit" fill="var(--color-profit)" radius={10} animationDuration={1000} />
                    <ChartLegend content={<ChartLegendContent />} />
                  </BarChart>
                </ChartContainer>
              ) : (
                <Empty className="border-none">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <Tag />
                    </EmptyMedia>
                    <EmptyTitle>{t('products.emptyBrandsTitle')}</EmptyTitle>
                    <EmptyDescription>{t('products.emptyBrandsDescription')}</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
            </SectionCard>
          </div>

          <SectionCard title={t('products.table.title')}>
            <div className="overflow-hidden rounded-[1.5rem] border border-border/70">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('products.table.columns.product')}</TableHead>
                    <TableHead>{t('products.table.columns.sku')}</TableHead>
                    <TableHead>{t('products.table.columns.category')}</TableHead>
                    <TableHead>{t('products.table.columns.units')}</TableHead>
                    <TableHead>{t('products.table.columns.revenue')}</TableHead>
                    <TableHead>{t('products.table.columns.cost')}</TableHead>
                    <TableHead>{t('products.table.columns.profit')}</TableHead>
                    <TableHead>{t('products.table.columns.margin')}</TableHead>
                    <TableHead>{t('products.table.columns.confirmation')}</TableHead>
                    <TableHead>{t('products.table.columns.views')}</TableHead>
                    <TableHead>{t('products.table.columns.adds')}</TableHead>
                    <TableHead>{t('products.table.columns.webPurchases')}</TableHead>
                    <TableHead>{t('products.table.columns.popularity')}</TableHead>
                    <TableHead>{t('products.table.columns.webConversion')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {productsPageItems.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell className="font-medium">{product.title}</TableCell>
                      <TableCell>{product.sku || '—'}</TableCell>
                      <TableCell>{product.categoryName || '—'}</TableCell>
                      <TableCell>{formatNumber(locale, product.unitsSold)}</TableCell>
                      <TableCell>{formatCurrency(locale, product.revenue)}</TableCell>
                      <TableCell>{formatCurrency(locale, product.cost)}</TableCell>
                      <TableCell className={cn(product.profit >= 0 ? 'text-emerald-600' : 'text-rose-600')}>{formatCurrency(locale, product.profit)}</TableCell>
                      <TableCell className={cn(product.margin >= 0 ? 'text-emerald-600' : 'text-rose-600')}>{formatPercent(locale, product.margin)}</TableCell>
                      <TableCell>
                        {product.totalOrderCount && product.totalOrderCount > 10 && product.confirmationRate != null ? (
                          <span className={cn(product.confirmationRate >= 50 ? 'text-emerald-600' : 'text-rose-600')}>
                            {formatPercent(locale, product.confirmationRate)}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {t('products.table.lowSample', { count: String(product.totalOrderCount ?? 0) })}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>{formatNumber(locale, product.viewCount ?? 0)}</TableCell>
                      <TableCell>{formatNumber(locale, product.addToCartCount ?? 0)}</TableCell>
                      <TableCell>{formatNumber(locale, product.websitePurchaseCount ?? 0)}</TableCell>
                      <TableCell>{formatNumber(locale, product.popularityScore ?? 0)}</TableCell>
                      <TableCell>{formatPercent(locale, product.websiteConversionRate ?? 0)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <TablePaginationControls
              className="mt-4 rounded-[1.5rem] border"
              currentPage={productsPage}
              totalPages={Math.max(1, Math.ceil(paginatedProducts.length / TABLE_PAGE_SIZE))}
              onPageChange={setProductsPage}
            />
          </SectionCard>
        </div>
      ) : null}

      {section === 'geography' ? (
        <div className="flex flex-col gap-6">
          <SectionCard title={t('geography.topWilayas.title')}>
            <ChartContainer config={geographyComposedConfig} className="h-[420px]">
              <ComposedChart data={topWilayas}>
                <CartesianGrid vertical={false} strokeDasharray="4 6" />
                <XAxis dataKey="name" tickLine={false} axisLine={false} />
                <YAxis yAxisId="left" tickLine={false} axisLine={false} />
                <YAxis yAxisId="right" orientation="right" hide />
                <ChartTooltip content={<ChartTooltipContent formatter={(value) => Number(value).toLocaleString()} />} />
                <Bar yAxisId="left" dataKey="orders" fill="var(--color-orders)" radius={10} animationDuration={800} />
                <Line yAxisId="right" type="monotone" dataKey="revenue" stroke="var(--color-revenue)" strokeWidth={3} dot={{ fill: 'var(--color-revenue)' }} animationDuration={1000} />
                <ChartLegend content={<ChartLegendContent />} />
              </ComposedChart>
            </ChartContainer>
          </SectionCard>

          <div className="grid gap-4 xl:grid-cols-2">
            <SectionCard title={t('geography.profit.title')}>
              <ChartContainer config={geographyProfitConfig}>
                <BarChart data={topWilayas} layout="vertical" margin={{ left: 12 }}>
                  <CartesianGrid horizontal={false} strokeDasharray="4 6" />
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" width={110} tickLine={false} axisLine={false} />
                  <ChartTooltip content={<ChartTooltipContent formatter={(value) => formatCurrency(locale, Number(value))} />} />
                  <Bar dataKey="profit" radius={12} animationDuration={900}>
                    {topWilayas.map((item) => (
                      <Cell key={item.name} fill={item.profit >= 0 ? 'hsl(var(--chart-2))' : 'hsl(var(--chart-5))'} />
                    ))}
                  </Bar>
                </BarChart>
              </ChartContainer>
            </SectionCard>

            <SectionCard title={t('geography.averageOrder.title')}>
              <ChartContainer config={geographyAverageConfig}>
                <BarChart data={topWilayas} layout="vertical" margin={{ left: 12 }}>
                  <CartesianGrid horizontal={false} strokeDasharray="4 6" />
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" width={110} tickLine={false} axisLine={false} />
                  <ChartTooltip content={<ChartTooltipContent formatter={(value) => formatCurrency(locale, Number(value))} />} />
                  <Bar dataKey="avgOrder" fill="var(--color-avgOrder)" radius={12} animationDuration={900} />
                </BarChart>
              </ChartContainer>
            </SectionCard>
          </div>

          <SectionCard title={t('geography.table.title')}>
            <div className="overflow-hidden rounded-[1.5rem] border border-border/70">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('geography.table.columns.wilaya')}</TableHead>
                    <TableHead>{t('geography.table.columns.orders')}</TableHead>
                    <TableHead>{t('geography.table.columns.collected')}</TableHead>
                    <TableHead>{t('geography.table.columns.fees')}</TableHead>
                    <TableHead>{t('geography.table.columns.netRevenue')}</TableHead>
                    <TableHead>{t('geography.table.columns.profit')}</TableHead>
                    <TableHead>{t('geography.table.columns.averageOrder')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {wilayasPageItems.map((item) => (
                    <TableRow key={item.name}>
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell>{formatNumber(locale, item.orders)}</TableCell>
                      <TableCell>{formatCurrency(locale, item.collected ?? 0)}</TableCell>
                      <TableCell>{formatCurrency(locale, item.fees ?? 0)}</TableCell>
                      <TableCell>{formatCurrency(locale, item.revenue)}</TableCell>
                      <TableCell className={cn(item.profit >= 0 ? 'text-emerald-600' : 'text-rose-600')}>{formatCurrency(locale, item.profit)}</TableCell>
                      <TableCell>{formatCurrency(locale, item.avgOrder ?? 0)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <TablePaginationControls
              className="mt-4 rounded-[1.5rem] border"
              currentPage={wilayasPage}
              totalPages={Math.max(1, Math.ceil(paginatedWilayas.length / TABLE_PAGE_SIZE))}
              onPageChange={setWilayasPage}
            />
          </SectionCard>
        </div>
      ) : null}

      {section === 'time' ? (
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap gap-2">
            {(['daily', 'weekly', 'monthly'] as TrendMode[]).map((mode) => (
              <Button key={mode} type="button" variant={trendMode === mode ? 'default' : 'outline'} onClick={() => setTrendMode(mode)}>
                {t(`time.granularity.${mode}`)}
              </Button>
            ))}
          </div>

          <SectionCard title={t('time.orders.title')}>
            <ChartContainer config={timeOrdersConfig} className="h-[360px]">
              <AreaChart data={trendData}>
                <defs>
                  <linearGradient id="stats-orders-fill" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-orders)" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="var(--color-orders)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="4 6" />
                <XAxis dataKey="bucket" tickFormatter={(value) => formatBucket(locale, String(value))} tickLine={false} axisLine={false} minTickGap={18} />
                <YAxis hide />
                <ChartTooltip content={<ChartTooltipContent formatter={(value) => formatNumber(locale, Number(value))} labelFormatter={(value) => formatBucket(locale, String(value))} />} />
                <Area type="monotone" dataKey="orders" stroke="var(--color-orders)" fill="url(#stats-orders-fill)" strokeWidth={2.5} animationDuration={900} />
              </AreaChart>
            </ChartContainer>
          </SectionCard>

          <SectionCard title={t('time.revenue.title')}>
            <ChartContainer config={timeRevenueConfig} className="h-[360px]">
              <LineChart data={trendData}>
                <CartesianGrid vertical={false} strokeDasharray="4 6" />
                <XAxis dataKey="bucket" tickFormatter={(value) => formatBucket(locale, String(value))} tickLine={false} axisLine={false} minTickGap={18} />
                <YAxis hide />
                <ChartTooltip content={<ChartTooltipContent formatter={(value) => formatCurrency(locale, Number(value))} labelFormatter={(value) => formatBucket(locale, String(value))} />} />
                <Line type="monotone" dataKey="revenue" stroke="var(--color-revenue)" strokeWidth={3} dot={false} animationDuration={800} />
                <Line type="monotone" dataKey="profit" stroke="var(--color-profit)" strokeWidth={3} dot={false} animationDuration={1000} />
                <Line type="monotone" dataKey="fees" stroke="var(--color-fees)" strokeWidth={3} dot={false} animationDuration={1200} />
                <ChartLegend content={<ChartLegendContent />} />
              </LineChart>
            </ChartContainer>
          </SectionCard>

          {importTrendData.length > 0 ? (
            <SectionCard title={t('time.imports.title')}>
              <ChartContainer config={importTrendConfig} className="h-[420px]">
                <ComposedChart data={importTrendData}>
                  <CartesianGrid vertical={false} strokeDasharray="4 6" />
                  <XAxis dataKey="bucket" tickFormatter={(value) => formatBucket(locale, String(value))} tickLine={false} axisLine={false} />
                  <YAxis yAxisId="left" hide />
                  <YAxis yAxisId="right" orientation="right" hide />
                  <ChartTooltip content={<ChartTooltipContent formatter={(value) => Number(value).toLocaleString()} labelFormatter={(value) => formatBucket(locale, String(value))} />} />
                  <Bar yAxisId="right" dataKey="orders" fill="var(--color-orders)" radius={10} animationDuration={700} />
                  <Line yAxisId="left" type="monotone" dataKey="revenue" stroke="var(--color-revenue)" strokeWidth={3} dot={{ r: 3 }} animationDuration={850} />
                  <Line yAxisId="left" type="monotone" dataKey="profit" stroke="var(--color-profit)" strokeWidth={3} dot={{ r: 3 }} animationDuration={1000} />
                  <Line yAxisId="left" type="monotone" dataKey="fees" stroke="var(--color-fees)" strokeWidth={3} dot={{ r: 3 }} animationDuration={1150} />
                  <ChartLegend content={<ChartLegendContent />} />
                </ComposedChart>
              </ChartContainer>

              <div className="mt-5 overflow-hidden rounded-[1.5rem] border border-border/70">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('time.imports.table.date')}</TableHead>
                      <TableHead>{t('time.imports.table.orders')}</TableHead>
                      <TableHead>{t('time.imports.table.revenue')}</TableHead>
                      <TableHead>{t('time.imports.table.fees')}</TableHead>
                      <TableHead>{t('time.imports.table.profit')}</TableHead>
                      <TableHead>{t('time.imports.table.margin')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {importsTrendPageItems.map((item) => (
                      <TableRow key={item.bucket}>
                        <TableCell className="font-medium">{formatDate(locale, item.bucket)}</TableCell>
                        <TableCell>{formatNumber(locale, item.orders)}</TableCell>
                        <TableCell>{formatCurrency(locale, item.revenue)}</TableCell>
                        <TableCell>{formatCurrency(locale, item.fees)}</TableCell>
                        <TableCell className={cn(item.profit >= 0 ? 'text-emerald-600' : 'text-rose-600')}>{formatCurrency(locale, item.profit)}</TableCell>
                        <TableCell className={cn(item.margin >= 0 ? 'text-emerald-600' : 'text-rose-600')}>{formatPercent(locale, item.margin)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <TablePaginationControls
                className="mt-4 rounded-[1.5rem] border"
                currentPage={importsTrendPage}
                totalPages={Math.max(1, Math.ceil(importTrendRows.length / TABLE_PAGE_SIZE))}
                onPageChange={setImportsTrendPage}
              />
            </SectionCard>
          ) : null}
        </div>
      ) : null}

      {section === 'imports' ? (
        <SectionCard title={t('imports.title')}>
          <>
            <div className="grid gap-3">
              {historyPageItems.length > 0 ? (
                historyPageItems.map((batch) => (
                  <div key={batch.batchId} className="rounded-[1.5rem] border border-border/70 bg-muted/20 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-foreground">{batch.fileName}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {t('imports.meta', {
                            importedAt: formatDate(locale, batch.importedAt),
                            totalRows: String(batch.totalRows),
                            matchedOrders: String(batch.matchedOrders),
                            unmatchedCount: String(batch.unmatchedCount),
                            skippedRows: String(batch.skippedRows ?? Math.max(0, batch.totalRows - batch.matchedOrders - batch.unmatchedCount)),
                          })}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {t('imports.range', {
                            start: formatDate(locale, batch.dateRangeStart),
                            end: formatDate(locale, batch.dateRangeEnd),
                          })}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={deleteBatchMutation.isPending}
                        onClick={() => deleteBatchMutation.mutate(batch.batchId)}
                      >
                        <Trash2 data-icon="inline-start" />
                        {t('imports.delete')}
                      </Button>
                    </div>
                  </div>
                ))
              ) : (
                <Empty className="border-none">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <FileSpreadsheet />
                    </EmptyMedia>
                    <EmptyTitle>{t('imports.emptyTitle')}</EmptyTitle>
                    <EmptyDescription>{t('imports.emptyDescription')}</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
            </div>
            <TablePaginationControls
              className="mt-4 rounded-[1.5rem] border"
              currentPage={historyPage}
              totalPages={historyTotalPages}
              onPageChange={setHistoryPage}
            />
          </>
        </SectionCard>
      ) : null}

      {section === 'imports' && latestUnmatchedDetails.length > 0 ? (
        <Alert>
          <AlertCircle />
          <AlertTitle>{t('unmatched.title')}</AlertTitle>
          <AlertDescription>
            <div className="flex flex-wrap gap-2 pt-3">
              {latestUnmatchedDetails.map((item) => (
                <button
                  key={`${item.batchId}-${item.reference}-${item.tracking}`}
                  type="button"
                  className="rounded-full border border-border/70 bg-background px-3 py-1 text-xs font-medium text-foreground transition hover:bg-muted"
                  onClick={() => setSelectedUnmatchedReference(item)}
                >
                  {item.reference || item.tracking}
                </button>
              ))}
            </div>
          </AlertDescription>
        </Alert>
      ) : null}

      {section === 'manualOrders' ? (
        <div className="flex flex-col gap-6">
          <ManualOrderForm mode="inline" />
          <SectionCard title={t('manualOrders.sectionTitle')}>
            <ManualOrderHistory />
          </SectionCard>
        </div>
      ) : null}

      <Dialog open={selectedUnmatchedReference !== null} onOpenChange={(open) => !open && setSelectedUnmatchedReference(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('unmatched.dialog.title')}</DialogTitle>
            <DialogDescription>{t('unmatched.dialog.description')}</DialogDescription>
          </DialogHeader>
          {selectedUnmatchedReference ? (
            <div className="grid gap-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">{t('unmatched.fields.reference')}</p>
                  <p className="font-medium">{selectedUnmatchedReference.reference || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t('unmatched.fields.tracking')}</p>
                  <p className="font-medium">{selectedUnmatchedReference.tracking || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t('unmatched.fields.customer')}</p>
                  <p className="font-medium">{selectedUnmatchedReference.customerName || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t('unmatched.fields.phone')}</p>
                  <p className="font-medium">{selectedUnmatchedReference.phone || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t('unmatched.fields.wilaya')}</p>
                  <p className="font-medium">{selectedUnmatchedReference.wilaya || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t('unmatched.fields.commune')}</p>
                  <p className="font-medium">{selectedUnmatchedReference.commune || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t('unmatched.fields.amount')}</p>
                  <p className="font-medium">{formatCurrency(locale, selectedUnmatchedReference.amountCollected || 0)}</p>
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t('unmatched.fields.products')}</p>
                <p className="font-medium">{selectedUnmatchedReference.products || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t('unmatched.fields.note')}</p>
                <p className="font-medium">{selectedUnmatchedReference.note || '—'}</p>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setSelectedUnmatchedReference(null)}>
              {t('manualOrders.actions.cancel')}
            </Button>
            {selectedUnmatchedReference ? (
              <Button
                type="button"
                variant="destructive"
                disabled={dismissWarningMutation.isPending}
                onClick={() =>
                  dismissWarningMutation.mutate({
                    batchId: selectedUnmatchedReference.batchId,
                    reference: selectedUnmatchedReference.reference || selectedUnmatchedReference.tracking,
                  })
                }
              >
                {t('unmatched.dismiss')}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
