'use client';

import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

import type { PaidClickListItem, PaidClickListSummary, PaidClickVisitDetail } from '../lib/paid-clicks';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Input } from './ui/input';
import { NativeSelect } from './ui/native-select';
import { Skeleton } from './ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';

type PaidClicksDashboardProps = {
  title: string;
  description: string;
};

type PaidClickListResponse = {
  items: PaidClickListItem[];
  nextCursor: string | null;
  summary: PaidClickListSummary;
};

async function request<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error ?? 'Request failed');
  }

  return response.json() as Promise<T>;
}

function buildListUrl(filters: Record<string, string>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value.length > 0) {
      params.set(key, value);
    }
  }

  return `/api/stats/paid-clicks?${params.toString()}`;
}

function formatDate(locale: string, value: string) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function formatRelativeAge(locale: string, value: string) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (seconds < 60) return rtf.format(-seconds, 'second');
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return rtf.format(-minutes, 'minute');
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return rtf.format(-hours, 'hour');
  const days = Math.floor(hours / 24);
  return rtf.format(-days, 'day');
}

function maskFbclid(value: string | null) {
  if (!value) {
    return '—';
  }

  if (value.length <= 16) {
    return `${value.slice(0, 4)}…${value.slice(-4)}`;
  }

  return `${value.slice(0, 8)}…${value.slice(-8)}`;
}

function JsonPayloadBlock({ payload }: { payload: Record<string, unknown> }) {
  return (
    <pre className="max-h-72 overflow-auto rounded-xl border border-border/60 bg-muted/20 p-3 text-xs leading-5 text-foreground">
      {JSON.stringify(payload, null, 2)}
    </pre>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card className="rounded-[1.25rem] p-4">
      <div className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-foreground">{value}</div>
    </Card>
  );
}

export function PaidClicksDashboard({ title, description }: PaidClicksDashboardProps) {
  const locale = useLocale();
  const t = useTranslations('statsDashboard.paidClicks');
  const [range, setRange] = useState('24h');
  const [variant, setVariant] = useState('all');
  const [paidSource, setPaidSource] = useState('all');
  const [outcome, setOutcome] = useState('all');
  const [hasOrder, setHasOrder] = useState('all');
  const [search, setSearch] = useState('');
  const [cursorStack, setCursorStack] = useState<string[]>([]);
  const [selectedVisitId, setSelectedVisitId] = useState<string | null>(null);
  const [showRawFbclid, setShowRawFbclid] = useState(false);

  const currentCursor = cursorStack[cursorStack.length - 1] ?? '';
  const filters = useMemo(() => ({
    range,
    variant,
    paidSource,
    outcome,
    hasOrder,
    search,
    limit: '25',
    cursor: currentCursor,
  }), [currentCursor, hasOrder, outcome, paidSource, range, search, variant]);

  const listQuery = useQuery({
    queryKey: ['paid-clicks', filters],
    queryFn: () => request<PaidClickListResponse>(buildListUrl(filters)),
  });

  const detailQuery = useQuery({
    queryKey: ['paid-clicks-detail', selectedVisitId],
    queryFn: () => request<PaidClickVisitDetail>(`/api/stats/paid-clicks/${selectedVisitId}`),
    enabled: selectedVisitId != null,
  });

  const items = listQuery.data?.items ?? [];
  const summary = listQuery.data?.summary;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      </div>

      <Card className="rounded-[1.5rem] p-5">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <NativeSelect value={range} onChange={(event) => { setRange(event.target.value); setCursorStack([]); }}>
            <option value="24h">{t('filters.range24h')}</option>
            <option value="7d">{t('filters.range7d')}</option>
            <option value="30d">{t('filters.range30d')}</option>
          </NativeSelect>
          <NativeSelect value={variant} onChange={(event) => { setVariant(event.target.value); setCursorStack([]); }}>
            <option value="all">{t('filters.variantAll')}</option>
            <option value="control">{t('filters.variantControl')}</option>
            <option value="fast_checkout">{t('filters.variantFastCheckout')}</option>
          </NativeSelect>
          <NativeSelect value={paidSource} onChange={(event) => { setPaidSource(event.target.value); setCursorStack([]); }}>
            <option value="all">{t('filters.sourceAll')}</option>
            <option value="fbclid">fbclid</option>
            <option value="meta_utm">meta_utm</option>
            <option value="unknown">unknown</option>
          </NativeSelect>
          <NativeSelect value={outcome} onChange={(event) => { setOutcome(event.target.value); setCursorStack([]); }}>
            <option value="all">{t('filters.outcomeAll')}</option>
            <option value="landed_only">{t('outcomes.landedOnly')}</option>
            <option value="viewed_product">{t('outcomes.viewedProduct')}</option>
            <option value="added_to_cart">{t('outcomes.addedToCart')}</option>
            <option value="began_checkout">{t('outcomes.beganCheckout')}</option>
            <option value="created_order">{t('outcomes.createdOrder')}</option>
            <option value="purchased">{t('outcomes.purchased')}</option>
            <option value="errored">{t('outcomes.errored')}</option>
          </NativeSelect>
          <NativeSelect value={hasOrder} onChange={(event) => { setHasOrder(event.target.value); setCursorStack([]); }}>
            <option value="all">{t('filters.hasOrderAll')}</option>
            <option value="yes">{t('filters.hasOrderYes')}</option>
            <option value="no">{t('filters.hasOrderNo')}</option>
          </NativeSelect>
          <Input
            value={search}
            onChange={(event) => { setSearch(event.target.value); setCursorStack([]); }}
            placeholder={t('filters.searchPlaceholder')}
          />
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-4 xl:grid-cols-8">
        {summary ? (
          <>
            <StatCard label={t('summary.visits')} value={summary.visits} />
            <StatCard label={t('summary.landedOnly')} value={summary.landedOnly} />
            <StatCard label={t('summary.viewedProduct')} value={summary.viewedProduct} />
            <StatCard label={t('summary.addedToCart')} value={summary.addedToCart} />
            <StatCard label={t('summary.beganCheckout')} value={summary.beganCheckout} />
            <StatCard label={t('summary.createdOrder')} value={summary.createdOrder} />
            <StatCard label={t('summary.purchased')} value={summary.purchased} />
            <StatCard label={t('summary.errored')} value={summary.errored} />
          </>
        ) : Array.from({ length: 8 }).map((_, index) => <Skeleton key={index} className="h-24 rounded-[1.25rem]" />)}
      </div>

      <Card className="overflow-hidden rounded-[1.5rem] p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('table.firstSeen')}</TableHead>
                <TableHead>{t('table.landingPath')}</TableHead>
                <TableHead>{t('table.productSlug')}</TableHead>
                <TableHead>{t('table.variant')}</TableHead>
                <TableHead>{t('table.source')}</TableHead>
                <TableHead>{t('table.lastEvent')}</TableHead>
                <TableHead>{t('table.eventCount')}</TableHead>
                <TableHead>{t('table.orderId')}</TableHead>
                <TableHead>{t('table.age')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {listQuery.isLoading ? (
                Array.from({ length: 6 }).map((_, index) => (
                  <TableRow key={index}>
                    <TableCell colSpan={9}><Skeleton className="h-10 w-full" /></TableCell>
                  </TableRow>
                ))
              ) : items.length > 0 ? items.map((item) => (
                <TableRow
                  key={item.visitId}
                  className="cursor-pointer"
                  onClick={() => {
                    setSelectedVisitId(item.visitId);
                    setShowRawFbclid(false);
                  }}
                >
                  <TableCell>{formatDate(locale, item.firstSeenAt)}</TableCell>
                  <TableCell className="max-w-[360px] truncate">{item.landingPath}</TableCell>
                  <TableCell>{item.landingProductSlug ?? '—'}</TableCell>
                  <TableCell>{item.requestedVariant ?? item.storefrontVariant ?? '—'}</TableCell>
                  <TableCell>{item.paidSource}</TableCell>
                  <TableCell>{item.lastEventName ?? '—'}</TableCell>
                  <TableCell>{item.eventCount}</TableCell>
                  <TableCell>{item.orderId ?? '—'}</TableCell>
                  <TableCell>{formatRelativeAge(locale, item.firstSeenAt)}</TableCell>
                </TableRow>
              )) : (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-sm text-muted-foreground">{t('empty')}</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <div className="flex items-center justify-between border-t border-border/50 px-4 py-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => setCursorStack((current) => current.slice(0, -1))}
            disabled={cursorStack.length === 0}
          >
            {t('actions.previous')}
          </Button>
          <Button
            type="button"
            onClick={() => {
              if (listQuery.data?.nextCursor) {
                setCursorStack((current) => [...current, listQuery.data.nextCursor!]);
              }
            }}
            disabled={!listQuery.data?.nextCursor}
          >
            {t('actions.next')}
          </Button>
        </div>
      </Card>

      <Dialog open={selectedVisitId != null} onOpenChange={(open) => { if (!open) setSelectedVisitId(null); }}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>{t('detail.title')}</DialogTitle>
            <DialogDescription>{t('detail.description')}</DialogDescription>
          </DialogHeader>

          {detailQuery.isLoading || !detailQuery.data ? (
            <div className="space-y-3 py-4">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-48 w-full" />
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <Card className="rounded-[1.25rem] p-4">
                  <div className="space-y-2 text-sm">
                    <div><span className="font-semibold">{t('detail.visitId')}:</span> {detailQuery.data.visit.visitId}</div>
                    <div><span className="font-semibold">{t('detail.landingUrl')}:</span> <span className="break-all">{detailQuery.data.visit.landingUrl}</span></div>
                    <div><span className="font-semibold">{t('detail.variant')}:</span> {detailQuery.data.visit.requestedVariant ?? detailQuery.data.visit.storefrontVariant ?? '—'}</div>
                    <div><span className="font-semibold">{t('detail.requestedVariant')}:</span> {detailQuery.data.visit.requestedVariant ?? '—'}</div>
                    <div><span className="font-semibold">{t('detail.journeyId')}:</span> {detailQuery.data.visit.journeyId ?? '—'}</div>
                    <div><span className="font-semibold">{t('detail.sessionId')}:</span> {detailQuery.data.visit.sessionId ?? '—'}</div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{t('detail.fbclid')}:</span>
                      <span className="break-all">{showRawFbclid ? (detailQuery.data.visit.fbclidRaw ?? '—') : maskFbclid(detailQuery.data.visit.fbclidRaw)}</span>
                      <Button type="button" variant="outline" className="h-8 px-2 text-xs" onClick={() => setShowRawFbclid((current) => !current)}>
                        {showRawFbclid ? t('actions.hide') : t('actions.reveal')}
                      </Button>
                    </div>
                  </div>
                </Card>

                <Card className="rounded-[1.25rem] p-4">
                  <div className="space-y-2 text-sm">
                    <div><span className="font-semibold">{t('detail.utmSource')}:</span> {detailQuery.data.visit.utmSource ?? '—'}</div>
                    <div><span className="font-semibold">{t('detail.utmMedium')}:</span> {detailQuery.data.visit.utmMedium ?? '—'}</div>
                    <div><span className="font-semibold">{t('detail.utmCampaign')}:</span> {detailQuery.data.visit.utmCampaign ?? '—'}</div>
                    <div><span className="font-semibold">{t('detail.orderId')}:</span> {detailQuery.data.visit.orderId ?? '—'}</div>
                    <div><span className="font-semibold">{t('detail.lastEvent')}:</span> {detailQuery.data.visit.lastEventName ?? '—'}</div>
                    <div><span className="font-semibold">{t('detail.firstSeen')}:</span> {formatDate(locale, detailQuery.data.visit.firstSeenAt)}</div>
                    <div><span className="font-semibold">{t('detail.lastSeen')}:</span> {formatDate(locale, detailQuery.data.visit.lastSeenAt)}</div>
                  </div>
                </Card>
              </div>

              {detailQuery.data.order ? (
                <Card className="rounded-[1.25rem] p-4">
                  <div className="text-sm font-semibold">{t('detail.orderSummary')}</div>
                  <div className="mt-2 grid gap-2 text-sm md:grid-cols-3">
                    <div><span className="font-semibold">{t('detail.orderId')}:</span> {detailQuery.data.order.id}</div>
                    <div><span className="font-semibold">{t('detail.orderStatus')}:</span> {detailQuery.data.order.confirmed}</div>
                    <div><span className="font-semibold">{t('detail.orderCity')}:</span> {detailQuery.data.order.city ?? '—'}</div>
                  </div>
                </Card>
              ) : null}

              <Card className="rounded-[1.25rem] p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('detail.timelineTime')}</TableHead>
                        <TableHead>{t('detail.timelineEvent')}</TableHead>
                        <TableHead>{t('detail.timelinePage')}</TableHead>
                        <TableHead>{t('detail.timelineProduct')}</TableHead>
                        <TableHead>{t('detail.timelineOrder')}</TableHead>
                        <TableHead>{t('detail.timelineMeta')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detailQuery.data.timeline.map((event) => (
                        <TableRow key={event.eventId}>
                          <TableCell>{formatDate(locale, event.occurredAt)}</TableCell>
                          <TableCell>{event.eventName}</TableCell>
                          <TableCell className="max-w-[360px] truncate">{event.pagePath ?? '—'}</TableCell>
                          <TableCell>{event.productSlug ?? '—'}</TableCell>
                          <TableCell>{event.orderId ?? '—'}</TableCell>
                          <TableCell>
                            {event.metaTracking
                              ? event.metaTracking.capiAttempted
                                ? (event.metaTracking.capiOk ? t('detail.metaDelivered') : t('detail.metaFailed'))
                                : event.metaTracking.pixelFired
                                  ? t('detail.metaPixelOnly')
                                  : t('detail.metaNoData')
                              : '—'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </Card>

              {detailQuery.data.timeline.some((event) => event.metaTracking) ? (
                <div className="space-y-4">
                  <div className="text-sm font-semibold">{t('detail.metaPayloads')}</div>
                  {detailQuery.data.timeline
                    .filter((event) => event.metaTracking)
                    .map((event) => (
                      <Card key={`${event.eventId}-meta`} className="rounded-[1.25rem] p-4">
                        <div className="space-y-4">
                          <div className="space-y-1 text-sm">
                            <div className="font-semibold">{event.metaTracking?.eventName ?? event.eventName}</div>
                            <div className="text-muted-foreground">{formatDate(locale, event.occurredAt)}</div>
                            <div className="text-muted-foreground">
                              {event.metaTracking?.capiAttempted
                                ? event.metaTracking.capiOk
                                  ? t('detail.metaDelivered')
                                  : t('detail.metaFailed')
                                : event.metaTracking?.pixelFired
                                  ? t('detail.metaPixelOnly')
                                  : t('detail.metaNoData')}
                              {event.metaTracking?.capiStatus != null ? ` • HTTP ${event.metaTracking.capiStatus}` : ''}
                            </div>
                          </div>
                          <div className="grid gap-4 lg:grid-cols-2">
                            <div className="space-y-2">
                              <div className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t('detail.pixelPayload')}</div>
                              <JsonPayloadBlock payload={event.metaTracking?.pixelPayload ?? {}} />
                            </div>
                            <div className="space-y-2">
                              <div className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t('detail.capiPayload')}</div>
                              <JsonPayloadBlock payload={event.metaTracking?.capiPayload ?? {}} />
                            </div>
                          </div>
                        </div>
                      </Card>
                    ))}
                </div>
              ) : null}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
