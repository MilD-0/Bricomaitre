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
  const dateText = String(date ?? '').trim();
  const timeText = String(time ?? '').trim();
  const candidate = timeText ? `${dateText}T${timeText}` : dateText;
  const match =
    /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(\.\d{1,9})?)?(Z|[+-]\d{2}:?\d{2})?)?$/i.exec(
      candidate,
    );
  if (!match) return null;
  const [, day, hour = '00', minute = '00', second = '00', fraction = '', offset = '+01:00'] =
    match;
  const calendar = new Date(`${day}T00:00:00Z`);
  if (
    Number.isNaN(calendar.getTime()) ||
    calendar.toISOString().slice(0, 10) !== day ||
    Number(hour) > 23 ||
    Number(minute) > 59 ||
    Number(second) > 59
  )
    return null;
  // ECOTRACK's unzoned civil timestamps belong to Algeria (UTC+01:00).
  // Explicit offsets remain authoritative, independently of the server timezone.
  const parsed = new Date(`${day}T${hour}:${minute}:${second}${fraction}${offset}`);
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
