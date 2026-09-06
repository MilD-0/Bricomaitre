const SENSITIVE_KEY_PATTERN =
  /(authorization|cookie|session|access.?token|auth.?token|order.?token|token|secret|password|passwd|phone|email|address|key|dsn)/i;
const URL_KEY_PATTERN = /(?:url|referer|referrer)$/i;
const SAFE_CORRELATION_KEYS = new Set(['requestedToken', 'canonicalToken']);

function stripUrlDetails(value: string) {
  try {
    const absolute = new URL(value, 'https://diagnostic.invalid');
    const path = absolute.pathname;
    return absolute.origin === 'https://diagnostic.invalid' ? path : `${absolute.origin}${path}`;
  } catch {
    return value.split(/[?#]/, 1)[0];
  }
}

export function scrubDiagnosticValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => scrubDiagnosticValue(entry));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => {
      if (!SAFE_CORRELATION_KEYS.has(key) && SENSITIVE_KEY_PATTERN.test(key)) {
        return [key, '[REDACTED]'];
      }
      if (URL_KEY_PATTERN.test(key) && typeof entry === 'string') {
        return [key, stripUrlDetails(entry)];
      }

      return [key, scrubDiagnosticValue(entry)];
    }),
  );
}

type DiagnosticEvent = {
  request?: {
    data?: unknown;
    query_string?: unknown;
  };
};

export function sanitizeDiagnosticEvent<TEvent extends DiagnosticEvent>(event: TEvent) {
  const sanitized = scrubDiagnosticValue(event) as TEvent;
  if (sanitized.request) {
    sanitized.request.data = undefined;
    sanitized.request.query_string = undefined;
  }
  return sanitized;
}

export function readSampleRate(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : fallback;
}

export function normalizeSentryDsn(value: string | undefined) {
  let candidate = value?.trim();
  if (!candidate) {
    return undefined;
  }

  const first = candidate[0];
  const last = candidate.at(-1);
  if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
    candidate = candidate.slice(1, -1).trim();
  }

  try {
    const url = new URL(candidate);
    const projectId = url.pathname.split('/').filter(Boolean).at(-1);
    if (
      url.protocol !== 'https:' ||
      !url.hostname ||
      !url.username ||
      !projectId ||
      !/^\d+$/.test(projectId)
    ) {
      return undefined;
    }
    return candidate;
  } catch {
    return undefined;
  }
}

export function getRequestId(request?: { headers?: { get(name: string): string | null } }) {
  const headerValue = request?.headers?.get('x-request-id')?.trim();
  if (headerValue) {
    return headerValue;
  }

  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export function withRequestIdHeaders(requestId: string, headers: Record<string, string> = {}) {
  return {
    ...headers,
    'x-request-id': requestId,
  };
}
