const DEFAULT_STOREFRONT_API_BASE_URL = 'http://localhost:3001';
const DEFAULT_STOREFRONT_API_TIMEOUT_MS = 5_000;

type StorefrontRuntimeEnv = {
  STOREFRONT_API_BASE_URL?: string;
  STOREFRONT_API_TIMEOUT_MS?: string;
};

export type StorefrontUpstreamErrorCode =
  | 'invalid_token'
  | 'unavailable'
  | 'unexpected_status'
  | 'invalid_response';

export class StorefrontUpstreamError extends Error {
  code: StorefrontUpstreamErrorCode;
  pathname: string;
  status: number | null;

  constructor(
    message: string,
    options: {
      code: StorefrontUpstreamErrorCode;
      pathname: string;
      status?: number | null;
      cause?: unknown;
    },
  ) {
    super(message, { cause: options.cause });
    this.name = 'StorefrontUpstreamError';
    this.code = options.code;
    this.pathname = options.pathname;
    this.status = options.status ?? null;
  }
}

function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, '');
}

export function getStorefrontApiBaseUrl(
  env: StorefrontRuntimeEnv = process.env as unknown as StorefrontRuntimeEnv,
) {
  return normalizeBaseUrl(env.STOREFRONT_API_BASE_URL || DEFAULT_STOREFRONT_API_BASE_URL);
}

export function getStorefrontApiTimeoutMs(
  env: StorefrontRuntimeEnv = process.env as unknown as StorefrontRuntimeEnv,
) {
  const configured = Number(env.STOREFRONT_API_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_STOREFRONT_API_TIMEOUT_MS;
}

export async function fetchStorefrontUpstream(
  pathname: string,
  init: RequestInit & { timeoutMs?: number } = {},
) {
  const controller = new AbortController();
  const timeoutMs = init.timeoutMs ?? getStorefrontApiTimeoutMs();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(`${getStorefrontApiBaseUrl()}${pathname}`, {
      ...init,
      headers: {
        accept: 'application/json',
        ...(init.headers ?? {}),
      },
      signal: controller.signal,
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'AbortError';
    throw new StorefrontUpstreamError(
      timedOut
        ? `Storefront API request timed out: ${pathname}`
        : `Storefront API is unavailable: ${pathname}`,
      {
        code: 'unavailable',
        pathname,
        cause: error,
      },
    );
  } finally {
    clearTimeout(timeout);
  }
}

export function isStorefrontUpstreamError(error: unknown): error is StorefrontUpstreamError {
  return error instanceof StorefrontUpstreamError;
}
