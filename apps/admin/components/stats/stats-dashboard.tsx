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
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertCircle,
  DollarSign,
  FileText,
  FileSpreadsheet,
  Layers,
  Package,
  RefreshCcw,
  Tag,
  Target,
  Trash2,
  TrendingUp,
  Users,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';

import type { StatsDashboardData } from '../../lib/stats';
import { toast } from '../../lib/toast';
import { requestJson as request } from '../../lib/admin-api';
import {
  MAX_SPREADSHEET_UPLOAD_BYTES,
  MAX_SPREADSHEET_UPLOAD_FILES,
  MAX_SPREADSHEET_UPLOAD_TOTAL_BYTES,
  SPREADSHEET_UPLOAD_EXTENSIONS,
} from '../../lib/upload-limits';
import { cn } from '../../lib/utils';
import type { BulletinAttachment } from '../../lib/bulletin';
import { ManualOrderForm } from './manual-order-form';
import { ManualOrderHistory } from './manual-order-history';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '../ui/chart';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '../ui/empty';
import { FileUploadField } from '../file-upload-field';
import { Input } from '../ui/input';
import { TablePaginationControls } from '../table-pagination-controls';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import {
  formatBucket,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatNumber,
  formatPercent,
  geographyAverageConfig,
  geographyComposedConfig,
  geographyProfitConfig,
  importTrendConfig,
  MetricCard,
  MobileBreakdownCard,
  MobileBreakdownMetric,
  SectionCard,
  segmentConfig,
  StatsPageSkeleton,
  timeOrdersConfig,
  timeRevenueConfig,
  topProductsConfig,
} from './stats-dashboard-primitives';
import { StatsAiSection } from './stats-ai-section';
import { StatsMetaSection } from './stats-meta-section';
import { StatsOverviewSection } from './stats-overview-section';
import { StatsWebsiteSection } from './stats-website-section';

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

export type StatsSection =
  | 'overview'
  | 'website'
  | 'landingPages'
  | 'aiAssistants'
  | 'customers'
  | 'products'
  | 'geography'
  | 'time'
  | 'metaAds'
  | 'manualOrders'
  | 'imports';
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

export function StatsDashboard({ initialData = null, section, title }: StatsDashboardProps) {
  const locale = useLocale();
  const t = useTranslations('statsDashboard');
  const queryClient = useQueryClient();
  const [range, setRange] = useState<(typeof rangePresets)[number]>('90d');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [trendMode, setTrendMode] = useState<TrendMode>('daily');
  const [uploadedFiles, setUploadedFiles] = useState<BulletinAttachment[]>([]);
  const [selectedUnmatchedReference, setSelectedUnmatchedReference] = useState<
    StatsDashboardData['latestUnmatchedDetails'][number] | null
  >(null);
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
    initialData:
      initialData && range === '90d' && startDate === '' && endDate === ''
        ? { data: initialData }
        : undefined,
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
    queryFn: () =>
      request<StatsImportHistoryResponse>(
        `/api/stats?history=true&page=${historyPage}&pageSize=${TABLE_PAGE_SIZE}`,
      ),
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
    mutationFn: (batchId: string) =>
      request(`/api/stats?batchId=${encodeURIComponent(batchId)}`, { method: 'DELETE' }),
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
    const body = payload as
      | {
          import?: { batchId: string; newOrders: number; duplicateOrders: number };
          job?: BackgroundJob;
        }
      | undefined;
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
      const created =
        typeof job.resultSummary?.newOrders === 'number' ? job.resultSummary.newOrders : 0;
      const duplicates =
        typeof job.resultSummary?.duplicateOrders === 'number'
          ? job.resultSummary.duplicateOrders
          : 0;
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
    () =>
      section === 'imports'
        ? (importHistoryPageData?.items ?? stats?.importHistory ?? [])
        : (stats?.importHistory ?? []),
    [importHistoryPageData?.items, section, stats],
  );
  const productsPageItems = useMemo(
    () =>
      paginatedProducts.slice((productsPage - 1) * TABLE_PAGE_SIZE, productsPage * TABLE_PAGE_SIZE),
    [paginatedProducts, productsPage],
  );
  const wilayasPageItems = useMemo(
    () =>
      paginatedWilayas.slice((wilayasPage - 1) * TABLE_PAGE_SIZE, wilayasPage * TABLE_PAGE_SIZE),
    [paginatedWilayas, wilayasPage],
  );
  const importsTrendPageItems = useMemo(
    () =>
      importTrendRows.slice(
        (importsTrendPage - 1) * TABLE_PAGE_SIZE,
        importsTrendPage * TABLE_PAGE_SIZE,
      ),
    [importTrendRows, importsTrendPage],
  );
  const historyPageItems = importHistoryRows;
  const historyTotalPages =
    section === 'imports'
      ? (importHistoryPageData?.totalPages ??
        Math.max(1, Math.ceil((stats?.importHistory ?? []).length / TABLE_PAGE_SIZE)))
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
  const isRefreshing =
    (needsDashboardStats && (statsQuery.isFetching || refreshStatsMutation.isPending)) ||
    (section === 'imports' && importHistoryQuery.isFetching);
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
    if (
      section === 'imports' &&
      !importHistoryQuery.isPlaceholderData &&
      importHistoryPageData?.page &&
      importHistoryPageData.page !== historyPage
    ) {
      queueMicrotask(() => setHistoryPage(importHistoryPageData.page));
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
        <AlertDescription>
          {statsQuery.error instanceof Error ? statsQuery.error.message : t('errorDescription')}
        </AlertDescription>
      </Alert>
    );
  }
  const ensuredStats = stats as StatsDashboardData;

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div
        className={cn(
          'grid gap-4',
          section === 'imports' ? 'xl:grid-cols-[1.1fr_0.9fr]' : 'xl:grid-cols-1',
        )}
      >
        <Card className="rounded-[2rem] border-border/60 bg-card p-5 sm:p-6">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {title}
              </p>
              <Button
                type="button"
                variant="outline"
                disabled={isRefreshing}
                onClick={handleRefresh}
              >
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
                <Input
                  type="date"
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                  aria-label={t('customStart')}
                />
                <Input
                  type="date"
                  value={endDate}
                  onChange={(event) => setEndDate(event.target.value)}
                  aria-label={t('customEnd')}
                />
              </div>
            ) : null}

            {isRefreshing && stats ? (
              <div className="rounded-[1.4rem] border border-border/70 bg-muted/20 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-foreground">
                    {t('loading.refreshingTitle')}
                  </p>
                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                    {t('loading.refreshingBadge')}
                  </p>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full w-2/5 animate-pulse rounded-full bg-primary/70" />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {t('loading.refreshingDescription')}
                </p>
              </div>
            ) : null}

            {stats?.snapshot ? (
              <Alert
                variant={
                  stats.snapshot.isStale || stats.snapshot.financialDataIsLagging
                    ? 'destructive'
                    : 'default'
                }
              >
                <AlertCircle />
                <AlertTitle>
                  {stats.snapshot.isStale
                    ? t('snapshotMeta.staleTitle')
                    : stats.snapshot.financialDataIsLagging
                      ? t('snapshotMeta.financialLagTitle')
                      : t('snapshotMeta.title')}
                </AlertTitle>
                <AlertDescription>
                  {stats.snapshot.financialDataIsLagging
                    ? t('snapshotMeta.financialLagDescription', {
                        reportThroughDate: formatDate(locale, stats.snapshot.reportThroughDate),
                      })
                    : t('snapshotMeta.description', {
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
                        {importStage === 'uploading'
                          ? t('imports.progress.uploadingTitle')
                          : t('imports.progress.processingTitle')}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {importStage === 'uploading'
                          ? t('imports.progress.uploadingDescription')
                          : t('imports.progress.processingDescription')}
                      </p>
                    </div>
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                      {importStage === 'uploading'
                        ? t('imports.progress.uploadingBadge')
                        : t('imports.progress.processingBadge')}
                    </p>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn(
                        'h-full rounded-full bg-primary transition-all duration-500',
                        importStage === 'uploading' ? 'w-1/2 animate-pulse' : 'w-4/5 animate-pulse',
                      )}
                    />
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
                maxNumberOfFiles={MAX_SPREADSHEET_UPLOAD_FILES}
                maxFileSize={MAX_SPREADSHEET_UPLOAD_BYTES}
                maxTotalFileSize={MAX_SPREADSHEET_UPLOAD_TOTAL_BYTES}
                allowedFileTypes={SPREADSHEET_UPLOAD_EXTENSIONS}
              />
            </div>
          </Card>
        ) : null}
      </div>

      {section === 'overview' ? <StatsOverviewSection stats={ensuredStats} /> : null}

      {section === 'website' ? <StatsWebsiteSection stats={ensuredStats} /> : null}
      {section === 'landingPages' ? (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
            <MetricCard
              accent="bg-primary"
              icon={FileText}
              title={t('landingPages.cards.published')}
              value={formatNumber(locale, ensuredStats.landingPages.summary.published)}
            />
            <MetricCard
              accent="bg-[hsl(var(--chart-1))]"
              icon={Users}
              title={t('landingPages.cards.sessions')}
              value={formatNumber(locale, ensuredStats.landingPages.summary.sessions)}
            />
            <MetricCard
              accent="bg-[hsl(var(--chart-2))]"
              icon={Target}
              title={t('landingPages.cards.purchases')}
              value={formatNumber(locale, ensuredStats.landingPages.summary.purchases)}
            />
            <MetricCard
              accent="bg-[hsl(var(--chart-3))]"
              icon={TrendingUp}
              title={t('landingPages.cards.conversion')}
              value={formatPercent(locale, ensuredStats.landingPages.summary.conversionRate)}
            />
            <MetricCard
              accent="bg-[hsl(var(--chart-4))]"
              icon={DollarSign}
              title={t('landingPages.cards.revenue')}
              value={formatCurrency(locale, ensuredStats.landingPages.summary.revenue)}
            />
            <MetricCard
              accent="bg-[hsl(var(--chart-5))]"
              icon={Package}
              title={t('landingPages.cards.drafts')}
              value={formatNumber(locale, ensuredStats.landingPages.summary.drafts)}
            />
          </div>

          <SectionCard title={t('landingPages.performanceTitle')}>
            <div className="space-y-2 md:hidden">
              {ensuredStats.landingPages.pages.map((item) => (
                <MobileBreakdownCard
                  key={item.id}
                  title={item.slug}
                  subtitle={`${item.product} · ${item.locale.toUpperCase()} · v${item.revision ?? '—'} · ${item.status}`}
                >
                  <dl className="mt-3 grid grid-cols-3 gap-3">
                    <MobileBreakdownMetric
                      label={t('landingPages.columns.sessions')}
                      value={formatNumber(locale, item.sessions)}
                    />
                    <MobileBreakdownMetric
                      label={t('landingPages.columns.views')}
                      value={formatNumber(locale, item.productViews)}
                    />
                    <MobileBreakdownMetric
                      label={t('landingPages.columns.adds')}
                      value={formatNumber(locale, item.addToCarts)}
                    />
                    <MobileBreakdownMetric
                      label={t('landingPages.columns.checkouts')}
                      value={formatNumber(locale, item.checkoutStarts)}
                    />
                    <MobileBreakdownMetric
                      label={t('landingPages.columns.purchases')}
                      value={formatNumber(locale, item.purchases)}
                    />
                    <MobileBreakdownMetric
                      label={t('landingPages.columns.conversion')}
                      value={formatPercent(locale, item.conversionRate)}
                    />
                  </dl>
                  <p className="mt-3 break-words text-sm font-semibold text-foreground">
                    {formatCurrency(locale, item.revenue)}
                  </p>
                </MobileBreakdownCard>
              ))}
              {ensuredStats.landingPages.pages.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('landingPages.empty')}</p>
              ) : null}
            </div>
            <div className="hidden max-w-full overflow-x-auto overscroll-x-contain rounded-[1.5rem] border border-border/70 md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('landingPages.columns.page')}</TableHead>
                    <TableHead>{t('landingPages.columns.status')}</TableHead>
                    <TableHead>{t('landingPages.columns.sessions')}</TableHead>
                    <TableHead>{t('landingPages.columns.views')}</TableHead>
                    <TableHead>{t('landingPages.columns.adds')}</TableHead>
                    <TableHead>{t('landingPages.columns.checkouts')}</TableHead>
                    <TableHead>{t('landingPages.columns.purchases')}</TableHead>
                    <TableHead>{t('landingPages.columns.revenue')}</TableHead>
                    <TableHead>{t('landingPages.columns.conversion')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ensuredStats.landingPages.pages.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">
                        <div className="flex flex-col">
                          <span>{item.slug}</span>
                          <span className="text-xs text-muted-foreground">
                            {item.product} · {item.locale.toUpperCase()} · v{item.revision ?? '—'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>{item.status}</TableCell>
                      <TableCell>{formatNumber(locale, item.sessions)}</TableCell>
                      <TableCell>{formatNumber(locale, item.productViews)}</TableCell>
                      <TableCell>{formatNumber(locale, item.addToCarts)}</TableCell>
                      <TableCell>{formatNumber(locale, item.checkoutStarts)}</TableCell>
                      <TableCell>{formatNumber(locale, item.purchases)}</TableCell>
                      <TableCell>{formatCurrency(locale, item.revenue)}</TableCell>
                      <TableCell>{formatPercent(locale, item.conversionRate)}</TableCell>
                    </TableRow>
                  ))}
                  {ensuredStats.landingPages.pages.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-muted-foreground">
                        {t('landingPages.empty')}
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </SectionCard>

          <SectionCard title={t('landingPages.blocksTitle')}>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {ensuredStats.landingPages.blocks.map((item) => (
                <div
                  key={item.name}
                  className="rounded-[1.25rem] border border-border/70 bg-muted/20 p-4"
                >
                  <p className="font-medium">{item.name}</p>
                  <p className="mt-2 text-2xl font-semibold">
                    {formatNumber(locale, item.interactions)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('landingPages.blockMeta', {
                      adds: item.addToCarts,
                      checkouts: item.checkouts,
                    })}
                  </p>
                </div>
              ))}
              {ensuredStats.landingPages.blocks.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('landingPages.empty')}</p>
              ) : null}
            </div>
          </SectionCard>
        </div>
      ) : null}

      {section === 'aiAssistants' ? <StatsAiSection stats={ensuredStats} /> : null}
      {section === 'customers' ? (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
            <MetricCard
              accent="bg-primary"
              icon={Users}
              title={t('customers.cards.customers')}
              value={formatNumber(locale, ensuredStats.customers.summary.customers)}
            />
            <MetricCard
              accent="bg-[hsl(var(--chart-2))]"
              icon={TrendingUp}
              title={t('customers.cards.repeat')}
              value={formatNumber(locale, ensuredStats.customers.summary.repeatCustomers)}
            />
            <MetricCard
              accent="bg-[hsl(var(--chart-3))]"
              icon={Target}
              title={t('customers.cards.repeatRate')}
              value={formatPercent(locale, ensuredStats.customers.summary.repeatRate)}
            />
            <MetricCard
              accent="bg-[hsl(var(--chart-4))]"
              icon={Package}
              title={t('customers.cards.averageOrders')}
              value={new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(
                ensuredStats.customers.summary.averageOrders,
              )}
            />
            <MetricCard
              accent="bg-[hsl(var(--chart-1))]"
              icon={DollarSign}
              title={t('customers.cards.averageValue')}
              value={formatCurrency(locale, ensuredStats.customers.summary.averageOrderValue)}
            />
            <MetricCard
              accent="bg-emerald-500"
              icon={Package}
              title={t('customers.cards.successfulOrders')}
              value={formatNumber(locale, ensuredStats.customers.summary.successfulOrders)}
            />
          </div>
          <SectionCard title={t('customers.rankingTitle')}>
            <div className="space-y-2 md:hidden">
              {ensuredStats.customers.customers.map((item) => (
                <MobileBreakdownCard
                  key={item.phone}
                  title={item.name}
                  subtitle={`${item.city} · ${item.phone}`}
                >
                  <dl className="mt-3 grid grid-cols-2 gap-3">
                    <MobileBreakdownMetric
                      label={t('customers.columns.orders')}
                      value={formatNumber(locale, item.orders)}
                    />
                    <MobileBreakdownMetric
                      label={t('customers.columns.confirmed')}
                      value={formatNumber(locale, item.confirmedOrders)}
                    />
                    <MobileBreakdownMetric
                      label={t('customers.columns.totalValue')}
                      value={formatCurrency(locale, item.totalValue)}
                    />
                    <MobileBreakdownMetric
                      label={t('customers.columns.averageValue')}
                      value={formatCurrency(locale, item.averageOrderValue)}
                    />
                    <MobileBreakdownMetric
                      label={t('customers.columns.lastOrder')}
                      value={formatDate(locale, item.lastOrderAt)}
                    />
                  </dl>
                  <p className="mt-3 break-words text-xs leading-5 text-muted-foreground">
                    {item.products
                      .map((product) => `${product.name} ×${product.count}`)
                      .join(', ') || '—'}
                  </p>
                </MobileBreakdownCard>
              ))}
              {ensuredStats.customers.customers.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('customers.empty')}</p>
              ) : null}
            </div>
            <div className="hidden max-w-full overflow-x-auto overscroll-x-contain rounded-[1.5rem] border border-border/70 md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('customers.columns.customer')}</TableHead>
                    <TableHead>{t('customers.columns.phone')}</TableHead>
                    <TableHead>{t('customers.columns.orders')}</TableHead>
                    <TableHead>{t('customers.columns.confirmed')}</TableHead>
                    <TableHead>{t('customers.columns.totalValue')}</TableHead>
                    <TableHead>{t('customers.columns.averageValue')}</TableHead>
                    <TableHead>{t('customers.columns.products')}</TableHead>
                    <TableHead>{t('customers.columns.lastOrder')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ensuredStats.customers.customers.map((item) => (
                    <TableRow key={item.phone}>
                      <TableCell className="font-medium">
                        <div className="flex flex-col">
                          <span>{item.name}</span>
                          <span className="text-xs text-muted-foreground">{item.city}</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{item.phone}</TableCell>
                      <TableCell>{formatNumber(locale, item.orders)}</TableCell>
                      <TableCell>{formatNumber(locale, item.confirmedOrders)}</TableCell>
                      <TableCell>{formatCurrency(locale, item.totalValue)}</TableCell>
                      <TableCell>{formatCurrency(locale, item.averageOrderValue)}</TableCell>
                      <TableCell className="min-w-56">
                        {item.products
                          .map((product) => `${product.name} ×${product.count}`)
                          .join(', ') || '—'}
                      </TableCell>
                      <TableCell>{formatDate(locale, item.lastOrderAt)}</TableCell>
                    </TableRow>
                  ))}
                  {ensuredStats.customers.customers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground">
                        {t('customers.empty')}
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </SectionCard>
        </div>
      ) : null}

      {section === 'metaAds' ? <StatsMetaSection stats={ensuredStats} /> : null}
      {section === 'products' ? (
        <div className="flex flex-col gap-6">
          <SectionCard title={t('products.topUnits.title')}>
            {productUnitsData.length > 0 ? (
              <ChartContainer config={topProductsConfig} className="h-[420px]">
                <BarChart data={productUnitsData} layout="vertical" margin={{ left: 28, right: 8 }}>
                  <CartesianGrid horizontal={false} strokeDasharray="4 6" />
                  <XAxis type="number" tickLine={false} axisLine={false} />
                  <YAxis
                    dataKey="name"
                    type="category"
                    width={170}
                    tickLine={false}
                    axisLine={false}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        formatter={(value) => formatNumber(locale, Number(value))}
                      />
                    }
                  />
                  <Bar
                    dataKey="units"
                    fill="var(--color-units)"
                    radius={12}
                    animationDuration={900}
                  />
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
                    <XAxis
                      dataKey="name"
                      tickLine={false}
                      axisLine={false}
                      interval={0}
                      angle={-18}
                      textAnchor="end"
                      height={60}
                    />
                    <YAxis hide />
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          formatter={(value) => formatCurrency(locale, Number(value))}
                        />
                      }
                    />
                    <Bar
                      dataKey="revenue"
                      fill="var(--color-revenue)"
                      radius={10}
                      animationDuration={800}
                    />
                    <Bar
                      dataKey="profit"
                      fill="var(--color-profit)"
                      radius={10}
                      animationDuration={1000}
                    />
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
                    <XAxis
                      dataKey="name"
                      tickLine={false}
                      axisLine={false}
                      interval={0}
                      angle={-18}
                      textAnchor="end"
                      height={60}
                    />
                    <YAxis hide />
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          formatter={(value) => formatCurrency(locale, Number(value))}
                        />
                      }
                    />
                    <Bar
                      dataKey="revenue"
                      fill="var(--color-revenue)"
                      radius={10}
                      animationDuration={800}
                    />
                    <Bar
                      dataKey="profit"
                      fill="var(--color-profit)"
                      radius={10}
                      animationDuration={1000}
                    />
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
            <div className="space-y-2 md:hidden">
              {productsPageItems.map((product) => (
                <MobileBreakdownCard
                  key={product.id}
                  title={product.title}
                  subtitle={`${product.sku || '—'} · ${product.categoryName || '—'}`}
                >
                  <dl className="mt-3 grid grid-cols-3 gap-3">
                    <MobileBreakdownMetric
                      label={t('products.table.columns.units')}
                      value={formatNumber(locale, product.unitsSold)}
                    />
                    <MobileBreakdownMetric
                      label={t('products.table.columns.revenue')}
                      value={formatCurrency(locale, product.revenue)}
                    />
                    <MobileBreakdownMetric
                      label={t('products.table.columns.profit')}
                      value={formatCurrency(locale, product.profit)}
                    />
                    <MobileBreakdownMetric
                      label={t('products.table.columns.margin')}
                      value={formatPercent(locale, product.margin)}
                    />
                    <MobileBreakdownMetric
                      label={t('products.table.columns.confirmation')}
                      value={
                        product.totalOrderCount &&
                        product.totalOrderCount > 10 &&
                        product.confirmationRate != null
                          ? formatPercent(locale, product.confirmationRate)
                          : t('products.table.lowSample', {
                              count: String(product.totalOrderCount ?? 0),
                            })
                      }
                    />
                    <MobileBreakdownMetric
                      label={t('products.table.columns.views')}
                      value={formatNumber(locale, product.viewCount ?? 0)}
                    />
                    <MobileBreakdownMetric
                      label={t('products.table.columns.adds')}
                      value={formatNumber(locale, product.addToCartCount ?? 0)}
                    />
                    <MobileBreakdownMetric
                      label={t('products.table.columns.webPurchases')}
                      value={formatNumber(locale, product.websitePurchaseCount ?? 0)}
                    />
                    <MobileBreakdownMetric
                      label={t('products.table.columns.webConversion')}
                      value={formatPercent(locale, product.websiteConversionRate ?? 0)}
                    />
                  </dl>
                </MobileBreakdownCard>
              ))}
            </div>
            <div className="hidden max-w-full overflow-x-auto overscroll-x-contain rounded-[1.5rem] border border-border/70 md:block">
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
                      <TableCell
                        className={cn(product.profit >= 0 ? 'text-emerald-600' : 'text-rose-600')}
                      >
                        {formatCurrency(locale, product.profit)}
                      </TableCell>
                      <TableCell
                        className={cn(product.margin >= 0 ? 'text-emerald-600' : 'text-rose-600')}
                      >
                        {formatPercent(locale, product.margin)}
                      </TableCell>
                      <TableCell>
                        {product.totalOrderCount &&
                        product.totalOrderCount > 10 &&
                        product.confirmationRate != null ? (
                          <span
                            className={cn(
                              product.confirmationRate >= 50 ? 'text-emerald-600' : 'text-rose-600',
                            )}
                          >
                            {formatPercent(locale, product.confirmationRate)}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {t('products.table.lowSample', {
                              count: String(product.totalOrderCount ?? 0),
                            })}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>{formatNumber(locale, product.viewCount ?? 0)}</TableCell>
                      <TableCell>{formatNumber(locale, product.addToCartCount ?? 0)}</TableCell>
                      <TableCell>
                        {formatNumber(locale, product.websitePurchaseCount ?? 0)}
                      </TableCell>
                      <TableCell>{formatNumber(locale, product.popularityScore ?? 0)}</TableCell>
                      <TableCell>
                        {formatPercent(locale, product.websiteConversionRate ?? 0)}
                      </TableCell>
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
                <ChartTooltip
                  content={
                    <ChartTooltipContent formatter={(value) => Number(value).toLocaleString()} />
                  }
                />
                <Bar
                  yAxisId="left"
                  dataKey="orders"
                  fill="var(--color-orders)"
                  radius={10}
                  animationDuration={800}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="revenue"
                  stroke="var(--color-revenue)"
                  strokeWidth={3}
                  dot={{ fill: 'var(--color-revenue)' }}
                  animationDuration={1000}
                />
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
                  <YAxis
                    dataKey="name"
                    type="category"
                    width={110}
                    tickLine={false}
                    axisLine={false}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        formatter={(value) => formatCurrency(locale, Number(value))}
                      />
                    }
                  />
                  <Bar dataKey="profit" radius={12} animationDuration={900}>
                    {topWilayas.map((item) => (
                      <Cell
                        key={item.name}
                        fill={item.profit >= 0 ? 'hsl(var(--chart-2))' : 'hsl(var(--chart-5))'}
                      />
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
                  <YAxis
                    dataKey="name"
                    type="category"
                    width={110}
                    tickLine={false}
                    axisLine={false}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        formatter={(value) => formatCurrency(locale, Number(value))}
                      />
                    }
                  />
                  <Bar
                    dataKey="avgOrder"
                    fill="var(--color-avgOrder)"
                    radius={12}
                    animationDuration={900}
                  />
                </BarChart>
              </ChartContainer>
            </SectionCard>
          </div>

          <SectionCard title={t('geography.table.title')}>
            <div className="space-y-2 md:hidden">
              {wilayasPageItems.map((item) => (
                <MobileBreakdownCard key={item.name} title={item.name}>
                  <dl className="mt-3 grid grid-cols-2 gap-3">
                    <MobileBreakdownMetric
                      label={t('geography.table.columns.orders')}
                      value={formatNumber(locale, item.orders)}
                    />
                    <MobileBreakdownMetric
                      label={t('geography.table.columns.collected')}
                      value={formatCurrency(locale, item.collected ?? 0)}
                    />
                    <MobileBreakdownMetric
                      label={t('geography.table.columns.fees')}
                      value={formatCurrency(locale, item.fees ?? 0)}
                    />
                    <MobileBreakdownMetric
                      label={t('geography.table.columns.netRevenue')}
                      value={formatCurrency(locale, item.revenue)}
                    />
                    <MobileBreakdownMetric
                      label={t('geography.table.columns.profit')}
                      value={formatCurrency(locale, item.profit)}
                    />
                    <MobileBreakdownMetric
                      label={t('geography.table.columns.averageOrder')}
                      value={formatCurrency(locale, item.avgOrder ?? 0)}
                    />
                  </dl>
                </MobileBreakdownCard>
              ))}
            </div>
            <div className="hidden max-w-full overflow-x-auto overscroll-x-contain rounded-[1.5rem] border border-border/70 md:block">
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
                      <TableCell
                        className={cn(item.profit >= 0 ? 'text-emerald-600' : 'text-rose-600')}
                      >
                        {formatCurrency(locale, item.profit)}
                      </TableCell>
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
              <Button
                key={mode}
                type="button"
                variant={trendMode === mode ? 'default' : 'outline'}
                onClick={() => setTrendMode(mode)}
              >
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
                <XAxis
                  dataKey="bucket"
                  tickFormatter={(value) => formatBucket(locale, String(value))}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={18}
                />
                <YAxis hide />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value) => formatNumber(locale, Number(value))}
                      labelFormatter={(value) => formatBucket(locale, String(value))}
                    />
                  }
                />
                <Area
                  type="monotone"
                  dataKey="orders"
                  stroke="var(--color-orders)"
                  fill="url(#stats-orders-fill)"
                  strokeWidth={2.5}
                  animationDuration={900}
                />
              </AreaChart>
            </ChartContainer>
          </SectionCard>

          <SectionCard title={t('time.revenue.title')}>
            <ChartContainer config={timeRevenueConfig} className="h-[360px]">
              <LineChart data={trendData}>
                <CartesianGrid vertical={false} strokeDasharray="4 6" />
                <XAxis
                  dataKey="bucket"
                  tickFormatter={(value) => formatBucket(locale, String(value))}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={18}
                />
                <YAxis hide />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value) => formatCurrency(locale, Number(value))}
                      labelFormatter={(value) => formatBucket(locale, String(value))}
                    />
                  }
                />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  stroke="var(--color-revenue)"
                  strokeWidth={3}
                  dot={false}
                  animationDuration={800}
                />
                <Line
                  type="monotone"
                  dataKey="profit"
                  stroke="var(--color-profit)"
                  strokeWidth={3}
                  dot={false}
                  animationDuration={1000}
                />
                <Line
                  type="monotone"
                  dataKey="fees"
                  stroke="var(--color-fees)"
                  strokeWidth={3}
                  dot={false}
                  animationDuration={1200}
                />
                <ChartLegend content={<ChartLegendContent />} />
              </LineChart>
            </ChartContainer>
          </SectionCard>

          {importTrendData.length > 0 ? (
            <SectionCard title={t('time.imports.title')}>
              <ChartContainer config={importTrendConfig} className="h-[420px]">
                <ComposedChart data={importTrendData}>
                  <CartesianGrid vertical={false} strokeDasharray="4 6" />
                  <XAxis
                    dataKey="bucket"
                    tickFormatter={(value) => formatBucket(locale, String(value))}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis yAxisId="left" hide />
                  <YAxis yAxisId="right" orientation="right" hide />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        formatter={(value) => Number(value).toLocaleString()}
                        labelFormatter={(value) => formatBucket(locale, String(value))}
                      />
                    }
                  />
                  <Bar
                    yAxisId="right"
                    dataKey="orders"
                    fill="var(--color-orders)"
                    radius={10}
                    animationDuration={700}
                  />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="revenue"
                    stroke="var(--color-revenue)"
                    strokeWidth={3}
                    dot={{ r: 3 }}
                    animationDuration={850}
                  />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="profit"
                    stroke="var(--color-profit)"
                    strokeWidth={3}
                    dot={{ r: 3 }}
                    animationDuration={1000}
                  />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="fees"
                    stroke="var(--color-fees)"
                    strokeWidth={3}
                    dot={{ r: 3 }}
                    animationDuration={1150}
                  />
                  <ChartLegend content={<ChartLegendContent />} />
                </ComposedChart>
              </ChartContainer>

              <div className="mt-5 space-y-2 md:hidden">
                {importsTrendPageItems.map((item) => (
                  <MobileBreakdownCard key={item.bucket} title={formatDate(locale, item.bucket)}>
                    <dl className="mt-3 grid grid-cols-2 gap-3">
                      <MobileBreakdownMetric
                        label={t('time.imports.table.orders')}
                        value={formatNumber(locale, item.orders)}
                      />
                      <MobileBreakdownMetric
                        label={t('time.imports.table.revenue')}
                        value={formatCurrency(locale, item.revenue)}
                      />
                      <MobileBreakdownMetric
                        label={t('time.imports.table.fees')}
                        value={formatCurrency(locale, item.fees)}
                      />
                      <MobileBreakdownMetric
                        label={t('time.imports.table.profit')}
                        value={formatCurrency(locale, item.profit)}
                      />
                      <MobileBreakdownMetric
                        label={t('time.imports.table.margin')}
                        value={formatPercent(locale, item.margin)}
                      />
                    </dl>
                  </MobileBreakdownCard>
                ))}
              </div>
              <div className="mt-5 hidden max-w-full overflow-x-auto overscroll-x-contain rounded-[1.5rem] border border-border/70 md:block">
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
                        <TableCell className="font-medium">
                          {formatDate(locale, item.bucket)}
                        </TableCell>
                        <TableCell>{formatNumber(locale, item.orders)}</TableCell>
                        <TableCell>{formatCurrency(locale, item.revenue)}</TableCell>
                        <TableCell>{formatCurrency(locale, item.fees)}</TableCell>
                        <TableCell
                          className={cn(item.profit >= 0 ? 'text-emerald-600' : 'text-rose-600')}
                        >
                          {formatCurrency(locale, item.profit)}
                        </TableCell>
                        <TableCell
                          className={cn(item.margin >= 0 ? 'text-emerald-600' : 'text-rose-600')}
                        >
                          {formatPercent(locale, item.margin)}
                        </TableCell>
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
                  <div
                    key={batch.batchId}
                    className="rounded-[1.5rem] border border-border/70 bg-muted/20 p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-foreground">{batch.fileName}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {t('imports.meta', {
                            importedAt: formatDate(locale, batch.importedAt),
                            totalRows: String(batch.totalRows),
                            matchedOrders: String(batch.matchedOrders),
                            unmatchedCount: String(batch.unmatchedCount),
                            skippedRows: String(
                              batch.skippedRows ??
                                Math.max(
                                  0,
                                  batch.totalRows - batch.matchedOrders - batch.unmatchedCount,
                                ),
                            ),
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

      <Dialog
        open={selectedUnmatchedReference !== null}
        onOpenChange={(open) => !open && setSelectedUnmatchedReference(null)}
      >
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
                  <p className="font-medium">
                    {formatCurrency(locale, selectedUnmatchedReference.amountCollected || 0)}
                  </p>
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
            <Button
              type="button"
              variant="outline"
              onClick={() => setSelectedUnmatchedReference(null)}
            >
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
                    reference:
                      selectedUnmatchedReference.reference || selectedUnmatchedReference.tracking,
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
