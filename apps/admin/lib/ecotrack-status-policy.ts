import { sql, type SQLWrapper } from 'drizzle-orm';

export const ECOTRACK_FAILED_STATUS_MAX_AGE_DAYS = 7;
export const ECOTRACK_FAILED_STATUS_MAX_AGE_MS =
  ECOTRACK_FAILED_STATUS_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

export const CASH_PIPELINE_EXCLUDED_LOCAL_STATUSES = [6, 8, 9, 10] as const;

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

export function effectiveEcotrackStatusSql(input: {
  localStatus: SQLWrapper;
  providerStatus: SQLWrapper;
  latestActivityAt: SQLWrapper;
  fallbackActivityAt: SQLWrapper;
  referenceAt: SQLWrapper;
}) {
  return sql<string>`case
    when ${input.localStatus} = 6 then 'annule'
    when ${input.localStatus} = 8 then 'retour_archive'
    when ${input.localStatus} = 9 then 'failed'
    when ${input.localStatus} = 10 then 'manual_completed'
    when ${input.providerStatus} = 'prete_a_expedier'
      and ${input.referenceAt} - coalesce(
        ${input.latestActivityAt},
        ${input.fallbackActivityAt}
      ) >= ${ECOTRACK_FAILED_STATUS_MAX_AGE_DAYS} * interval '1 day'
      then 'failed'
    else coalesce(${input.providerStatus}, 'untracked')
  end`;
}
