import type { EcotrackMajEntry, EcotrackStatusItem, EcotrackTrackingInfo } from './ecotrack-client';

export function parseEcotrackNumericValue(value: string | number | null | undefined) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number.parseFloat(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseEcotrackRemoteDateTime(
  date: string | null | undefined,
  time?: string | null | undefined,
) {
  const normalizedDate = String(date ?? '').trim();
  if (!normalizedDate) {
    return null;
  }

  const normalizedTime = String(time ?? '').trim();
  const hasExplicitOffset = /(?:Z|[+-]\d{2}:\d{2})$/i.test(normalizedDate);
  const isoCandidate = normalizedTime
    ? `${normalizedDate}T${normalizedTime}Z`
    : normalizedDate.includes('T')
      ? hasExplicitOffset
        ? normalizedDate
        : `${normalizedDate}Z`
      : `${normalizedDate}T00:00:00Z`;
  const parsed = new Date(isoCandidate);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function readEcotrackActivityTimestamp(
  entry: EcotrackMajEntry | { date?: string | null; time?: string | null },
) {
  if ('created_at' in entry) {
    return parseEcotrackRemoteDateTime(entry.created_at);
  }

  return parseEcotrackRemoteDateTime(entry.date, entry.time);
}

export function deriveEcotrackDeskFields(statusItem: EcotrackStatusItem) {
  return {
    deskPhone: statusItem.desk_phone?.trim() || null,
    deskCommune: statusItem.desk_commune?.trim() || null,
    deskMapLink: statusItem.desk_map_link?.trim() || null,
    deskAddress: statusItem.desk_address?.trim() || null,
  };
}

export function deriveLatestEcotrackStatusMetadata(statusItem: EcotrackStatusItem) {
  return {
    currentStatus: statusItem.status,
    driverPhone: statusItem.driver_phone?.trim() || null,
    estimatedFee: parseEcotrackNumericValue(statusItem.estimated_fee),
    ...deriveEcotrackDeskFields(statusItem),
  };
}

export function buildEcotrackTrackingPayloadSummary(
  trackingInfo: EcotrackTrackingInfo | null | undefined,
  majEntries: EcotrackMajEntry[] | null | undefined,
  statusItem: EcotrackStatusItem | null | undefined,
) {
  return {
    trackingInfo: trackingInfo ?? null,
    majEntries: majEntries ?? [],
    statusItem: statusItem ?? null,
  };
}
