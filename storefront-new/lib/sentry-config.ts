import type { ErrorEvent } from '@sentry/nextjs';

const SENSITIVE_KEY_PATTERN = /(authorization|cookie|access.?token|auth.?token|order.?token|secret|password|passwd|phone|email|address|dsn)/i;

function scrubValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrubValue);
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
    key,
    SENSITIVE_KEY_PATTERN.test(key) ? '[REDACTED]' : scrubValue(entry),
  ]));
}

export function readSampleRate(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : fallback;
}

export function getSentryRelease() {
  return process.env.SENTRY_RELEASE?.trim() || undefined;
}

export function normalizeSentryDsn(value: string | undefined) {
  let candidate = value?.trim();
  if (!candidate) return undefined;

  const first = candidate[0];
  const last = candidate.at(-1);
  if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
    candidate = candidate.slice(1, -1).trim();
  }

  try {
    const url = new URL(candidate);
    const projectId = url.pathname.split('/').filter(Boolean).at(-1);
    if (
      url.protocol !== 'https:'
      || !url.hostname
      || !url.username
      || !projectId
      || !/^\d+$/.test(projectId)
    ) {
      return undefined;
    }
    return candidate;
  } catch {
    return undefined;
  }
}

export function sanitizeSentryEvent(event: ErrorEvent) {
  const sanitized = scrubValue(event) as ErrorEvent;
  if (sanitized.request) sanitized.request.data = undefined;
  return sanitized;
}
