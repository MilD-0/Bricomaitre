import type { EcotrackBulkActionFailure } from './ecotrack-admin-contracts';

export type EcotrackOperation =
  'refresh' | 'update' | 'delete' | 'dispatch' | 'maj' | 'return' | 'label' | 'detail' | 'recreate';

export type EcotrackActionErrorDetail = {
  orderId: number | null;
  reference: string | null;
  trackingNumber: string | null;
  operation: EcotrackOperation;
  summary: string;
  upstreamPath: string | null;
  statusCode: number | null;
  rawMessage: string;
};

type EcotrackErrorRow = {
  trackingNumber: string | null;
  reference: string | null;
  order: { id: number };
};

function parseEcotrackUpstreamFailure(error: unknown) {
  const rawMessage = error instanceof Error ? error.message : String(error ?? '');
  const requestFailure = rawMessage.match(/^ECOTRACK request failed for ([^:]+): (\d{3})\s*(.*)$/);
  if (requestFailure) {
    const [, upstreamPath, statusCodeText, tail] = requestFailure;
    return {
      rawMessage,
      upstreamPath,
      statusCode: Number(statusCodeText),
      upstreamMessage: extractEcotrackPayloadMessage(tail),
    };
  }

  return {
    rawMessage,
    upstreamPath: null,
    statusCode: null,
    upstreamMessage: rawMessage,
  };
}

function extractEcotrackPayloadMessage(payload: string) {
  const trimmed = payload.trim();
  if (!trimmed) {
    return '';
  }

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const candidates = [
      parsed.message,
      parsed.error,
      parsed.detail,
      typeof parsed.data === 'object' && parsed.data
        ? (parsed.data as Record<string, unknown>).message
        : null,
    ];

    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate.trim();
      }
    }
  } catch {}

  return trimmed;
}

function toEcotrackOperationFailureReason(operation: EcotrackOperation, error: unknown) {
  const parsed = parseEcotrackUpstreamFailure(error);
  const lowered = `${parsed.upstreamMessage} ${parsed.rawMessage}`.toLowerCase();

  if (parsed.statusCode === 429 || lowered.includes('rate limit')) {
    return {
      parsed,
      summary: 'Ecotrack rate-limited the request.',
    };
  }

  if (lowered.includes('invalid json')) {
    return {
      parsed,
      summary: 'Ecotrack returned invalid data.',
    };
  }

  if (
    (parsed.statusCode === 404 && parsed.upstreamPath?.includes('/get/tracking')) ||
    lowered.includes('tracking not found')
  ) {
    return {
      parsed,
      summary:
        operation === 'label'
          ? 'The label is unavailable because the tracking number was not found upstream.'
          : 'The tracking number was not found upstream.',
    };
  }

  if (operation === 'dispatch' && (parsed.statusCode === 400 || parsed.statusCode === 409)) {
    return {
      parsed,
      summary: 'The shipment cannot be dispatched in its current Ecotrack state.',
    };
  }

  if (operation === 'update' && (parsed.statusCode === 400 || parsed.statusCode === 409)) {
    return {
      parsed,
      summary: 'The shipment cannot be updated in its current Ecotrack state.',
    };
  }

  if (operation === 'return' && (parsed.statusCode === 400 || parsed.statusCode === 409)) {
    return {
      parsed,
      summary: 'The return request was rejected by Ecotrack.',
    };
  }

  if (operation === 'maj' && (parsed.statusCode === 400 || parsed.statusCode === 409)) {
    return {
      parsed,
      summary: 'Ecotrack rejected the follow-up update.',
    };
  }

  if (
    operation === 'label' &&
    (parsed.statusCode === 400 || parsed.statusCode === 404 || parsed.statusCode === 409)
  ) {
    return {
      parsed,
      summary: 'The label is unavailable from Ecotrack.',
    };
  }

  if (parsed.upstreamMessage) {
    return {
      parsed,
      summary: parsed.upstreamMessage,
    };
  }

  return {
    parsed,
    summary: 'Ecotrack rejected the request.',
  };
}

export function formatEcotrackActionError(
  operation: EcotrackOperation,
  row: EcotrackErrorRow | null,
  error: unknown,
): EcotrackActionErrorDetail {
  const { parsed, summary } = toEcotrackOperationFailureReason(operation, error);
  const contextParts = [
    row?.order?.id ? `Order #${row.order.id}` : null,
    row?.reference ? `Ref ${row.reference}` : null,
    row?.trackingNumber ? `Tracking ${row.trackingNumber}` : null,
  ].filter(Boolean);

  return {
    orderId: row?.order?.id ?? null,
    reference: row?.reference ?? null,
    trackingNumber: row?.trackingNumber ?? null,
    operation,
    summary: contextParts.length > 0 ? `${contextParts.join(' / ')}: ${summary}` : summary,
    upstreamPath: parsed.upstreamPath,
    statusCode: parsed.statusCode,
    rawMessage: parsed.rawMessage,
  };
}

export function toEcotrackFailureRecord(
  operation: EcotrackOperation,
  row: EcotrackErrorRow | null,
  error: unknown,
  fallbackOrderId?: number,
): EcotrackBulkActionFailure {
  const detail = formatEcotrackActionError(operation, row, error);

  return {
    orderId: detail.orderId ?? fallbackOrderId ?? 0,
    reference: detail.reference,
    trackingNumber: detail.trackingNumber,
    message: detail.summary,
  };
}

export function findLatestDate(values: Array<Date | null | undefined>) {
  return values.reduce<Date | null>((latest, value) => {
    if (!value || Number.isNaN(value.getTime())) {
      return latest;
    }

    if (!latest || value.getTime() > latest.getTime()) {
      return value;
    }

    return latest;
  }, null);
}

function isEcotrackRequestFailure(error: unknown, pathPrefix: string, status: number) {
  const message = error instanceof Error ? error.message : '';
  return (
    message.includes(`ECOTRACK request failed for ${pathPrefix}`) &&
    message.includes(`: ${status} `)
  );
}

export function isEcotrackTrackingInfoUnavailableError(error: unknown) {
  return (
    isEcotrackRequestFailure(error, '/get/trackings/info', 404) ||
    isEcotrackRequestFailure(error, '/get/tracking/info', 404)
  );
}
