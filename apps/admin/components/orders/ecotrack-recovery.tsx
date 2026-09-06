'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { requestJson } from '../../lib/admin-api';
import type { EcotrackRecoveryItem } from '../../lib/ecotrack-recovery';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';

function RecoveryOperation({ item }: { item: EcotrackRecoveryItem }) {
  const t = useTranslations('ordersEcotrackManager.recovery');
  const queryClient = useQueryClient();
  const [evidence, setEvidence] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [expanded, setExpanded] = useState(false);
  const mutation = useMutation({
    mutationFn: (action: 'apply_saved' | 'confirm_applied' | 'confirm_not_applied') =>
      requestJson('/api/orders/ecotrack/recovery', {
        method: 'POST',
        body: JSON.stringify({ operationId: item.id, action, evidence, trackingNumber }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries();
    },
  });
  const canResolve = item.canResolve;
  const needsTracking = item.kind === 'post' || item.kind === 'recreate';
  return (
    <div className="border-t py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p>
          {t('operation', {
            id: item.orderId,
            kind: t(`kinds.${item.kind}`),
            provider: item.provider,
          })}
          {item.trackingNumber ? ` · ${item.trackingNumber}` : ''}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
        >
          {t(expanded ? 'close' : 'review')}
        </Button>
      </div>
      {expanded ? (
        <div className="mt-3 max-w-2xl space-y-3">
          {[item.customer, item.phone, item.destination, item.products, item.content]
            .filter(Boolean)
            .map((value, index) => (
              <p key={index} className="text-sm break-words">
                {value}
              </p>
            ))}
          {item.amount !== null ? (
            <p className="text-sm">{t('amount', { amount: item.amount })}</p>
          ) : null}
          {item.state === 'succeeded' ? (
            <>
              <p className="text-sm text-muted-foreground">{t('saved')}</p>
              <Button disabled={mutation.isPending} onClick={() => mutation.mutate('apply_saved')}>
                {t('applySaved')}
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                {t(canResolve ? 'verify' : 'waiting')}
              </p>
              <label className="block space-y-1 text-sm">
                <span>{t('evidence')}</span>
                <Textarea
                  dir="auto"
                  value={evidence}
                  onChange={(event) => setEvidence(event.target.value)}
                  maxLength={2000}
                  disabled={!canResolve || mutation.isPending}
                />
              </label>
              {needsTracking ? (
                <label className="block space-y-1 text-sm">
                  <span>{t('tracking')}</span>
                  <Input
                    dir="ltr"
                    value={trackingNumber}
                    onChange={(event) => setTrackingNumber(event.target.value)}
                    disabled={!canResolve || mutation.isPending}
                  />
                </label>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={
                    !canResolve ||
                    evidence.trim().length < 8 ||
                    (needsTracking && !trackingNumber.trim()) ||
                    mutation.isPending
                  }
                  className="h-auto min-h-10 max-w-full whitespace-normal"
                  onClick={() => mutation.mutate('confirm_applied')}
                >
                  {t('confirmApplied')}
                </Button>
                <Button
                  variant="outline"
                  disabled={!canResolve || evidence.trim().length < 8 || mutation.isPending}
                  className="h-auto min-h-10 max-w-full whitespace-normal"
                  onClick={() => mutation.mutate('confirm_not_applied')}
                >
                  {t('confirmNotApplied')}
                </Button>
              </div>
            </>
          )}
          {mutation.error ? (
            <p role="alert" className="text-sm text-destructive">
              {mutation.error.message}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function EcotrackRecovery() {
  const t = useTranslations('ordersEcotrackManager.recovery');
  const query = useQuery({
    queryKey: ['ecotrack-recovery'],
    queryFn: () => requestJson<{ items: EcotrackRecoveryItem[] }>('/api/orders/ecotrack/recovery'),
    refetchInterval: 15_000,
  });
  if (query.error)
    return (
      <p role="alert" className="py-3 text-sm text-destructive">
        {t('loadError')}{' '}
        <Button variant="ghost" onClick={() => void query.refetch()}>
          {t('retry')}
        </Button>
      </p>
    );
  if (!query.data?.items.length) return null;
  return (
    <section aria-label={t('title')} className="px-4 py-4 sm:px-5">
      <h2 className="mb-2 font-medium">{t('title')}</h2>
      <p className="mb-3 text-sm text-muted-foreground">{t('description')}</p>
      {query.data.items.map((item) => (
        <RecoveryOperation key={item.id} item={item} />
      ))}
    </section>
  );
}
