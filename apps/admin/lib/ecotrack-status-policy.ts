import { sql, type SQLWrapper } from 'drizzle-orm';
import { ORDER_STATUS } from '@bric/storefront-core/order-domain';

const ECOTRACK_FAILED_STATUS_MAX_AGE_DAYS = 7;
export const ECOTRACK_FAILED_STATUS_MAX_AGE_MS =
  ECOTRACK_FAILED_STATUS_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

const CASH_PIPELINE_EXCLUDED_LOCAL_STATUSES = [
  ORDER_STATUS.CANCELLED,
  ORDER_STATUS.RETURNED,
  ORDER_STATUS.FAILED,
  ORDER_STATUS.MANUAL_COMPLETED,
] as const;

export function localOrderCanRemainInCashPipeline(status: number) {
  return !CASH_PIPELINE_EXCLUDED_LOCAL_STATUSES.some((terminal) => terminal === status);
}

export const ANALYTICS_RESOLVED_SHIPMENT_STATUSES = [
  'paye_et_archive',
  'payed',
  'retour_archive',
  'annule',
  'failed',
  'manual_completed',
] as const;

export const ANALYTICS_PAID_SHIPMENT_STATUSES = ['paye_et_archive', 'payed'] as const;

export function effectiveEcotrackStatusSql(input: {
  localStatus: SQLWrapper;
  providerStatus: SQLWrapper;
  latestActivityAt: SQLWrapper;
  fallbackActivityAt: SQLWrapper;
  referenceAt: SQLWrapper;
}) {
  return sql<string>`case
    when ${input.localStatus} = ${ORDER_STATUS.CANCELLED} then 'annule'
    when ${input.localStatus} = ${ORDER_STATUS.RETURNED} then 'retour_archive'
    when ${input.localStatus} = ${ORDER_STATUS.FAILED} then 'failed'
    when ${input.localStatus} = ${ORDER_STATUS.MANUAL_COMPLETED} then 'manual_completed'
    when ${input.providerStatus} = 'prete_a_expedier'
      and ${input.referenceAt} - coalesce(
        ${input.latestActivityAt},
        ${input.fallbackActivityAt}
      ) >= ${ECOTRACK_FAILED_STATUS_MAX_AGE_DAYS} * interval '1 day'
      then 'failed'
    else coalesce(${input.providerStatus}, 'untracked')
  end`;
}
