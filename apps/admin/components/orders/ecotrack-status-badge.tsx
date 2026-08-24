'use client';

import { useTranslations } from 'next-intl';

import type { EcotrackStatusSummary } from '../../lib/ecotrack-admin-contracts';
import { formatOrderPhoneForDisplay } from '../../lib/order-presentation';
import { Badge } from '../ui/badge';
import { formatEcotrackDateTime, formatEcotrackMoney } from './orders-ecotrack-presentation';

export function EcotrackStatusBadge({
  locale,
  status,
  t,
}: {
  locale: string;
  status: EcotrackStatusSummary;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">
          {t(`ordersEcotrackManager.statuses.${status.currentStatus}`)}
        </Badge>
        {status.isStatusStale || status.isTrackingStale || status.isMajStale ? (
          <Badge variant="outline">{t('ordersEcotrackManager.staleBadge')}</Badge>
        ) : null}
      </div>
      {status.driverPhone ? (
        <p className="text-sm text-muted-foreground">
          {t('ordersEcotrackManager.driverPhone')}: {formatOrderPhoneForDisplay(status.driverPhone)}
        </p>
      ) : null}
      {status.estimatedFee !== null ? (
        <p className="text-sm text-muted-foreground">
          {t('ordersEcotrackManager.estimatedFee')}:{' '}
          {formatEcotrackMoney(locale, status.estimatedFee)}
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">
        {t('ordersEcotrackManager.lastSync')}:{' '}
        {formatEcotrackDateTime(locale, status.lastStatusSyncedAt) ??
          t('ordersEcotrackManager.neverSynced')}
      </p>
    </div>
  );
}
