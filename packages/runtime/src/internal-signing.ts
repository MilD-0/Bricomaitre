import { createHmac, timingSafeEqual } from 'node:crypto';

const DEFAULT_MAX_AGE_MS = 5 * 60 * 1000;

export function signInternalRequest(payload: string, secret: string, timestamp: string) {
  return createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
}

export function verifyInternalRequestSignature(options: {
  payload: string;
  secret: string;
  timestamp: string | null | undefined;
  signature: string | null | undefined;
  maxAgeMs?: number;
  nowMs?: number;
}) {
  const { payload, secret, signature, timestamp } = options;

  if (!secret.trim()) {
    return { ok: false as const, error: 'Signing secret is not configured' };
  }

  if (!timestamp?.trim()) {
    return { ok: false as const, error: 'Missing timestamp header' };
  }

  if (!signature?.trim()) {
    return { ok: false as const, error: 'Missing signature header' };
  }

  const timestampMs = Number(timestamp);
  if (!Number.isFinite(timestampMs)) {
    return { ok: false as const, error: 'Invalid timestamp header' };
  }

  const ageMs = Math.abs((options.nowMs ?? Date.now()) - timestampMs);
  if (ageMs > (options.maxAgeMs ?? DEFAULT_MAX_AGE_MS)) {
    return { ok: false as const, error: 'Signature timestamp has expired' };
  }

  const expected = signInternalRequest(payload, secret, timestamp);
  const signatureBuffer = Buffer.from(signature, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');

  if (signatureBuffer.length !== expectedBuffer.length) {
    return { ok: false as const, error: 'Invalid signature' };
  }

  if (!timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return { ok: false as const, error: 'Invalid signature' };
  }

  return { ok: true as const };
}
