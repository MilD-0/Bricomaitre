import {
  type EcotrackExtendedRateLimitSnapshot,
  type EcotrackMutationResult,
  type EcotrackRequestResult,
} from './contract';

export function readEcotrackRejected(payload: unknown) {
  if (typeof payload !== 'object' || payload === null) return false;
  const value = (payload as Record<string, unknown>).success;
  return value === false || value === 0 || value === '0';
}

export function readEcotrackSuccess(payload: unknown) {
  if (typeof payload !== 'object' || payload === null) {
    return false;
  }

  const value = (payload as Record<string, unknown>).success;
  return value === true || value === 1 || value === '1';
}

export function readEcotrackMessage(payload: unknown) {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }

  const value = (payload as Record<string, unknown>).message;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readEcotrackErrors(payload: unknown) {
  if (typeof payload !== 'object' || payload === null) {
    return [];
  }

  const value = (payload as Record<string, unknown>).errors;
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.map((entry) => (typeof entry === 'string' ? entry.trim() : '')).filter(Boolean);
  }

  if (typeof value === 'object') {
    return Object.values(value)
      .flatMap((entry) => (Array.isArray(entry) ? entry : [entry]))
      .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
      .filter(Boolean);
  }

  return [];
}

export function buildEcotrackResultMessage(payload: unknown, fallback: string) {
  const explicitMessage = readEcotrackMessage(payload);
  if (explicitMessage) {
    return explicitMessage;
  }

  const errors = readEcotrackErrors(payload);
  if (errors.length > 0) {
    return errors.join('; ');
  }

  if (typeof payload === 'string') {
    const text = payload.trim();
    if (text) {
      return text;
    }
  }

  return fallback;
}

export function assertEcotrackMutationSuccess(
  result: EcotrackRequestResult,
  fallbackMessage: string,
): EcotrackMutationResult {
  const success = readEcotrackSuccess(result.payload);
  const message =
    readEcotrackMessage(result.payload) ??
    (success ? null : buildEcotrackResultMessage(result.payload, fallbackMessage));

  if (!success && !readEcotrackRejected(result.payload))
    throw new Error('ECOTRACK returned an unknown mutation outcome.');
  if (!success) {
    throw new EcotrackMutationRejectedError(message ?? fallbackMessage);
  }

  return {
    ...result,
    success,
    message,
  };
}

export class EcotrackMutationRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EcotrackMutationRejectedError';
  }
}

export class EcotrackRateLimitError extends Error {
  status: number;
  rateLimit: EcotrackExtendedRateLimitSnapshot;

  constructor(message: string, rateLimit: EcotrackExtendedRateLimitSnapshot, status = 429) {
    super(message);
    this.name = 'EcotrackRateLimitError';
    this.status = status;
    this.rateLimit = rateLimit;
  }
}
