'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronDown,
  ChevronRight,
  Eye,
  FileSpreadsheet,
  MousePointer,
  Target,
  Trash2,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';

import type { BulletinAttachment } from '../../lib/bulletin';
import { requestJson as request } from '../../lib/admin-api';
import { toast } from '../../lib/toast';
import {
  MAX_SPREADSHEET_UPLOAD_BYTES,
  SPREADSHEET_UPLOAD_EXTENSIONS,
} from '../../lib/upload-limits';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { FileUploadField } from '../file-upload-field';
import { Input } from '../ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '../ui/empty';

type AdCostRow = {
  id: string;
  date: string;
  platform: string;
  campaignName?: string | null;
  spend: number;
  impressions?: number;
  clicks?: number;
  conversions?: number;
};
type BackgroundJob = {
  id: string;
  status: 'queued' | 'running' | 'completed' | 'cancelled' | 'failed';
  errorMessage: string | null;
  resultSummary?: Record<string, unknown> | null;
};
type AdSpendImportBatch = {
  batchId: string;
  fileName: string;
  importedAt: string;
  totalRows: number;
  importedRows: number;
  updatedRows: number;
  currentRows: number;
  currentSpend: number;
  dateRangeStart: string | null;
  dateRangeEnd: string | null;
};

export function AdCostsManager({
  range,
  startDate,
  endDate,
}: {
  range: '30d' | '90d' | 'year' | 'all' | 'custom';
  startDate?: string;
  endDate?: string;
}) {
  const t = useTranslations('statsDashboard.metaAds');
  const queryClient = useQueryClient();
  const [eurRate, setEurRate] = useState('230');
  const [showForm, setShowForm] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<BulletinAttachment[]>([]);
  const [expandedCampaigns, setExpandedCampaigns] = useState<string[]>([]);
  const initializedImportStatusRef = useRef(false);
  const lastImportStatusKeyRef = useRef<string | null>(null);
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    platform: 'facebook',
    campaignName: '',
    spend: '',
    impressions: '',
    clicks: '',
    conversions: '',
  });

  const queryString = new URLSearchParams();
  queryString.set('range', range);
  if (range === 'custom') {
    if (startDate) queryString.set('startDate', startDate);
    if (endDate) queryString.set('endDate', endDate);
  }

  const adQuery = useQuery({
    queryKey: ['ad-costs', range, startDate, endDate],
    queryFn: () => request<{ data: AdCostRow[] }>(`/api/stats/ad-costs?${queryString.toString()}`),
  });
  const importJobQuery = useQuery({
    queryKey: ['ad-costs-import-job'],
    queryFn: () => request<{ job: BackgroundJob | null }>('/api/stats/ad-costs/import'),
    initialData: { job: null },
    initialDataUpdatedAt: 0,
    refetchInterval: (query) => {
      const status = query.state.data?.job?.status;
      return status === 'queued' || status === 'running' ? 1_000 : false;
    },
    refetchIntervalInBackground: true,
    staleTime: 0,
  });
  const batchesQuery = useQuery({
    queryKey: ['ad-spend-import-batches'],
    queryFn: () => request<{ data: AdSpendImportBatch[] }>('/api/stats/ad-costs?batches=true'),
  });

  const grouped = useMemo(() => {
    const groups = new Map<
      string,
      {
        key: string;
        campaignName: string;
        platform: string;
        totalSpend: number;
        totalImpressions: number;
        totalClicks: number;
        totalConversions: number;
        startDate: string;
        endDate: string;
        entries: AdCostRow[];
      }
    >();

    for (const row of adQuery.data?.data ?? []) {
      const key = `${row.platform}:${row.campaignName || 'unknown'}`;
      const current = groups.get(key) ?? {
        key,
        campaignName: row.campaignName || t('unknownCampaign'),
        platform: row.platform,
        totalSpend: 0,
        totalImpressions: 0,
        totalClicks: 0,
        totalConversions: 0,
        startDate: row.date,
        endDate: row.date,
        entries: [],
      };
      current.totalSpend += row.spend;
      current.totalImpressions += row.impressions ?? 0;
      current.totalClicks += row.clicks ?? 0;
      current.totalConversions += row.conversions ?? 0;
      current.startDate = current.startDate < row.date ? current.startDate : row.date;
      current.endDate = current.endDate > row.date ? current.endDate : row.date;
      current.entries.push(row);
      groups.set(key, current);
    }

    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        entries: [...group.entries].sort((left, right) => right.date.localeCompare(left.date)),
      }))
      .sort((left, right) => right.totalSpend - left.totalSpend);
  }, [adQuery.data?.data, t]);

  const totals = useMemo(
    () => ({
      spend: grouped.reduce((sum, group) => sum + group.totalSpend, 0),
      impressions: grouped.reduce((sum, group) => sum + group.totalImpressions, 0),
      clicks: grouped.reduce((sum, group) => sum + group.totalClicks, 0),
      conversions: grouped.reduce((sum, group) => sum + group.totalConversions, 0),
    }),
    [grouped],
  );

  const addMutation = useMutation({
    mutationFn: () =>
      request('/api/stats/ad-costs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: form.date,
          platform: form.platform,
          campaignName: form.campaignName || null,
          spend: Number(form.spend || 0),
          impressions: form.impressions ? Number(form.impressions) : undefined,
          clicks: form.clicks ? Number(form.clicks) : undefined,
          conversions: form.conversions ? Number(form.conversions) : undefined,
        }),
      }),
    onSuccess: async () => {
      toast.success(t('notifications.addSuccess'));
      setShowForm(false);
      await queryClient.invalidateQueries({ queryKey: ['ad-costs'] });
      await queryClient.invalidateQueries({ queryKey: ['stats-dashboard'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => request(`/api/stats/ad-costs?id=${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      toast.success(t('notifications.deleteSuccess'));
      await queryClient.invalidateQueries({ queryKey: ['ad-costs'] });
      await queryClient.invalidateQueries({ queryKey: ['stats-dashboard'] });
    },
  });

  const deleteCampaignMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(
        ids.map((id) => request(`/api/stats/ad-costs?id=${id}`, { method: 'DELETE' })),
      );
    },
    onSuccess: async () => {
      toast.success(t('notifications.deleteCampaignSuccess'));
      await queryClient.invalidateQueries({ queryKey: ['ad-costs'] });
      await queryClient.invalidateQueries({ queryKey: ['stats-dashboard'] });
    },
  });

  const deleteBatchMutation = useMutation({
    mutationFn: (batchId: string) =>
      request(`/api/stats/ad-costs?batchId=${encodeURIComponent(batchId)}`, { method: 'DELETE' }),
    onSuccess: async () => {
      toast.success(t('notifications.deleteBatchSuccess'));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['ad-costs'] }),
        queryClient.invalidateQueries({ queryKey: ['ad-spend-import-batches'] }),
        queryClient.invalidateQueries({ queryKey: ['stats-dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['action-history'] }),
      ]);
    },
  });

  const toggleCampaign = (key: string) => {
    setExpandedCampaigns((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    );
  };

  const formatNumber = (value: number) => new Intl.NumberFormat().format(Math.round(value));

  const formatDate = (value: string) =>
    new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(
      new Date(`${value}T00:00:00Z`),
    );

  const formatDateTime = (value: string) =>
    new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
      new Date(value),
    );

  const handleImportStarted = () => {
    toast.loading(t('notifications.importLoading'));
  };

  const handleImportUploaded = async () => {
    await queryClient.invalidateQueries({ queryKey: ['ad-costs-import-job'] });
  };

  useEffect(() => {
    const job = importJobQuery.data.job;
    const statusKey = job ? `${job.id}:${job.status}` : null;

    if (!initializedImportStatusRef.current) {
      initializedImportStatusRef.current = true;
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
      toast.success(t('notifications.importSuccess'));
      queueMicrotask(() => setUploadedFiles([]));
      void queryClient.invalidateQueries({ queryKey: ['ad-costs'] });
      void queryClient.invalidateQueries({ queryKey: ['ad-spend-import-batches'] });
      void queryClient.invalidateQueries({ queryKey: ['stats-dashboard'] });
      void queryClient.invalidateQueries({ queryKey: ['action-history'] });
    } else if (job.status === 'failed') {
      toast.error(job.errorMessage || 'Import failed.');
      queueMicrotask(() => setUploadedFiles([]));
    }
  }, [importJobQuery.data.job, queryClient, t]);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-[1.6rem] border border-border/70 bg-linear-to-br from-card via-card to-muted/20 p-4">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {t('managerTitle')}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{t('fields.importHint')}</p>
          </div>
          <Button
            type="button"
            variant={showForm ? 'default' : 'outline'}
            onClick={() => setShowForm((value) => !value)}
          >
            {t('actions.add')}
          </Button>
        </div>

        <div className="grid gap-3 lg:grid-cols-[180px_minmax(0,1fr)] lg:items-end">
          <Input
            type="number"
            value={eurRate}
            onChange={(event) => setEurRate(event.target.value)}
            placeholder={t('fields.rate')}
            className="h-11 bg-background"
          />
          <div className="rounded-2xl border border-border/70 bg-background/60 p-3">
            <FileUploadField
              uploadUrl="/api/stats/ad-costs/import"
              label={t('actions.import')}
              hint={undefined}
              value={uploadedFiles}
              onChange={setUploadedFiles}
              onUploadStart={handleImportStarted}
              onUploaded={() => void handleImportUploaded()}
              extraFields={{ rate: eurRate }}
              maxNumberOfFiles={1}
              maxFileSize={MAX_SPREADSHEET_UPLOAD_BYTES}
              maxTotalFileSize={MAX_SPREADSHEET_UPLOAD_BYTES}
              allowedFileTypes={SPREADSHEET_UPLOAD_EXTENSIONS}
            />
          </div>
        </div>
      </div>

      {showForm ? (
        <div className="rounded-[1.6rem] border border-border/70 bg-muted/20 p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {t('actions.add')}
          </p>
          <div className="grid gap-3 md:grid-cols-3">
            <Input
              className="bg-background"
              type="date"
              value={form.date}
              onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))}
            />
            <Input
              className="bg-background"
              value={form.platform}
              onChange={(event) =>
                setForm((current) => ({ ...current, platform: event.target.value }))
              }
              placeholder={t('fields.platform')}
            />
            <Input
              className="bg-background"
              value={form.campaignName}
              onChange={(event) =>
                setForm((current) => ({ ...current, campaignName: event.target.value }))
              }
              placeholder={t('fields.campaignName')}
            />
            <Input
              className="bg-background"
              type="number"
              value={form.spend}
              onChange={(event) =>
                setForm((current) => ({ ...current, spend: event.target.value }))
              }
              placeholder={t('fields.spend')}
            />
            <Input
              className="bg-background"
              type="number"
              value={form.impressions}
              onChange={(event) =>
                setForm((current) => ({ ...current, impressions: event.target.value }))
              }
              placeholder={t('fields.impressions')}
            />
            <Input
              className="bg-background"
              type="number"
              value={form.clicks}
              onChange={(event) =>
                setForm((current) => ({ ...current, clicks: event.target.value }))
              }
              placeholder={t('fields.clicks')}
            />
            <Input
              className="bg-background"
              type="number"
              value={form.conversions}
              onChange={(event) =>
                setForm((current) => ({ ...current, conversions: event.target.value }))
              }
              placeholder={t('fields.conversions')}
            />
          </div>
          <div className="mt-4">
            <Button
              type="button"
              onClick={() => addMutation.mutate()}
              disabled={addMutation.isPending}
            >
              {t('actions.save')}
            </Button>
          </div>
        </div>
      ) : null}

      <div className="rounded-[1.6rem] border border-border/70 bg-card p-4">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {t('batches.eyebrow')}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">{t('batches.description')}</p>
          </div>
        </div>
        <div className="grid gap-3">
          {(batchesQuery.data?.data ?? []).length > 0 ? (
            batchesQuery.data!.data.map((batch) => (
              <div
                key={batch.batchId}
                className="rounded-[1.35rem] border border-border/70 bg-muted/20 p-3.5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-foreground">{batch.fileName}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {t('batches.meta', {
                        importedAt: formatDateTime(batch.importedAt),
                        currentRows: String(batch.currentRows),
                        totalRows: String(batch.totalRows),
                      })}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {batch.dateRangeStart && batch.dateRangeEnd
                        ? t('batches.range', {
                            start: formatDate(batch.dateRangeStart),
                            end: formatDate(batch.dateRangeEnd),
                          })
                        : t('batches.noRows')}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="text-sm font-semibold">{formatNumber(batch.currentSpend)}</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={deleteBatchMutation.isPending}
                      onClick={() => deleteBatchMutation.mutate(batch.batchId)}
                    >
                      <Trash2 data-icon="inline-start" />
                      {t('batches.delete')}
                    </Button>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <Empty className="border-none">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FileSpreadsheet />
                </EmptyMedia>
                <EmptyTitle>{t('batches.emptyTitle')}</EmptyTitle>
                <EmptyDescription>{t('batches.emptyDescription')}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-[1.35rem] border border-border/70 bg-linear-to-br from-card via-card to-muted/25 p-3.5">
          <p className="text-sm text-muted-foreground">{t('summary.spend')}</p>
          <p className="mt-1 text-xl font-semibold">{formatNumber(totals.spend)}</p>
        </div>
        <div className="rounded-[1.35rem] border border-border/70 bg-linear-to-br from-card via-card to-muted/25 p-3.5">
          <p className="text-sm text-muted-foreground">{t('summary.impressions')}</p>
          <p className="mt-1 text-xl font-semibold">{formatNumber(totals.impressions)}</p>
        </div>
        <div className="rounded-[1.35rem] border border-border/70 bg-linear-to-br from-card via-card to-muted/25 p-3.5">
          <p className="text-sm text-muted-foreground">{t('summary.clicks')}</p>
          <p className="mt-1 text-xl font-semibold">{formatNumber(totals.clicks)}</p>
        </div>
        <div className="rounded-[1.35rem] border border-border/70 bg-linear-to-br from-card via-card to-muted/25 p-3.5">
          <p className="text-sm text-muted-foreground">{t('summary.conversions')}</p>
          <p className="mt-1 text-xl font-semibold">{formatNumber(totals.conversions)}</p>
        </div>
      </div>

      <div className="grid gap-4">
        {grouped.map((group) => (
          <div
            key={`${group.platform}-${group.campaignName}`}
            className="rounded-[1.35rem] border border-border/70 bg-muted/20 p-3.5"
          >
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                className="flex items-center gap-3 text-left"
                onClick={() => toggleCampaign(group.key)}
              >
                {group.entries.length > 1 ? (
                  expandedCampaigns.includes(group.key) ? (
                    <ChevronDown className="size-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="size-4 text-muted-foreground" />
                  )
                ) : (
                  <span className="size-4" />
                )}
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold">{group.campaignName}</p>
                    <Badge variant="secondary">{group.platform}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {group.startDate === group.endDate
                      ? formatDate(group.startDate)
                      : `${formatDate(group.startDate)} - ${formatDate(group.endDate)}`}
                  </p>
                </div>
              </button>
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold">{group.totalSpend.toFixed(0)}</p>
                <Button
                  type="button"
                  size="sm"
                  className="size-9"
                  variant="ghost"
                  onClick={() =>
                    deleteCampaignMutation.mutate(group.entries.map((entry) => entry.id))
                  }
                  disabled={deleteCampaignMutation.isPending}
                >
                  <Trash2 />
                </Button>
              </div>
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-border/70 bg-background/70 px-3 py-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Eye className="size-4" />
                  <span>{t('columns.impressions')}</span>
                </div>
                <p className="mt-1 text-sm font-semibold">{formatNumber(group.totalImpressions)}</p>
              </div>
              <div className="rounded-xl border border-border/70 bg-background/70 px-3 py-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <MousePointer className="size-4" />
                  <span>{t('columns.clicks')}</span>
                </div>
                <p className="mt-1 text-sm font-semibold">{formatNumber(group.totalClicks)}</p>
              </div>
              <div className="rounded-xl border border-border/70 bg-background/70 px-3 py-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Target className="size-4" />
                  <span>{t('columns.conversions')}</span>
                </div>
                <p className="mt-1 text-sm font-semibold">{formatNumber(group.totalConversions)}</p>
              </div>
              <div className="rounded-xl border border-border/70 bg-background/70 px-3 py-2">
                <p className="text-xs text-muted-foreground">{t('columns.cpa')}</p>
                <p className="mt-1 text-sm font-semibold">
                  {group.totalConversions > 0
                    ? `${(group.totalSpend / group.totalConversions).toFixed(0)}`
                    : '—'}
                </p>
              </div>
            </div>

            {expandedCampaigns.includes(group.key) || group.entries.length === 1 ? (
              <div className="mt-3 overflow-hidden rounded-[1rem] border border-border/70">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('columns.date')}</TableHead>
                      <TableHead>{t('columns.spend')}</TableHead>
                      <TableHead>{t('columns.impressions')}</TableHead>
                      <TableHead>{t('columns.clicks')}</TableHead>
                      <TableHead>{t('columns.conversions')}</TableHead>
                      <TableHead>{t('columns.cpc')}</TableHead>
                      <TableHead>{t('columns.cpa')}</TableHead>
                      <TableHead>{t('columns.actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {group.entries.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell>{entry.date}</TableCell>
                        <TableCell>{entry.spend.toFixed(0)}</TableCell>
                        <TableCell>{entry.impressions ?? 0}</TableCell>
                        <TableCell>{entry.clicks ?? 0}</TableCell>
                        <TableCell>{entry.conversions ?? 0}</TableCell>
                        <TableCell>
                          {entry.clicks ? (entry.spend / entry.clicks).toFixed(0) : '—'}
                        </TableCell>
                        <TableCell>
                          {entry.conversions ? (entry.spend / entry.conversions).toFixed(0) : '—'}
                        </TableCell>
                        <TableCell>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => deleteMutation.mutate(entry.id)}
                          >
                            {t('actions.delete')}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
