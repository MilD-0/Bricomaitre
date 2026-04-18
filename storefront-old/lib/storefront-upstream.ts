const DEFAULT_STOREFRONT_API_BASE_URL = "http://localhost:3001";
const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_READ_TIMEOUT_MS = 15_000;

export class StorefrontUpstreamError extends Error {
  status: number | null;
  pathname: string;

  constructor(message: string, options: { pathname: string; status?: number | null }) {
    super(message);
    this.name = "StorefrontUpstreamError";
    this.pathname = options.pathname;
    this.status = options.status ?? null;
  }
}

function normalizeBaseUrl(value: string) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

export function getStorefrontApiBaseUrl() {
  return normalizeBaseUrl(
    process.env.STOREFRONT_API_BASE_URL ?? DEFAULT_STOREFRONT_API_BASE_URL,
  );
}

export function isUsingDefaultStorefrontApiBaseUrl() {
  return !process.env.STOREFRONT_API_BASE_URL?.trim();
}

export function buildStorefrontApiUrl(pathname: string) {
  return `${getStorefrontApiBaseUrl()}${pathname}`;
}

function readConfiguredReadTimeoutMs() {
  const rawValue = process.env.STOREFRONT_API_TIMEOUT_MS?.trim();

  if (!rawValue) {
    return DEFAULT_READ_TIMEOUT_MS;
  }

  const parsed = Number(rawValue);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_READ_TIMEOUT_MS;
}

export async function fetchStorefrontUpstream(
  pathname: string,
  init?: RequestInit & { timeoutMs?: number },
) {
  const controller = new AbortController();
  const timeoutMs = init?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(buildStorefrontApiUrl(pathname), {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? `Storefront API request timed out: ${pathname}`
        : `Storefront API is unavailable: ${pathname}`;
    throw new StorefrontUpstreamError(message, { pathname });
  } finally {
    clearTimeout(timeout);
  }
}

export function isStorefrontUpstreamTimeoutError(error: unknown) {
  return error instanceof StorefrontUpstreamError
    && error.message.startsWith("Storefront API request timed out:");
}

export async function fetchStorefrontJson<T>(
  pathname: string,
  init?: RequestInit & { next?: { revalidate?: number; tags?: string[] }; timeoutMs?: number },
): Promise<T> {
  const response = await fetchStorefrontUpstream(pathname, {
    ...init,
    timeoutMs: init?.timeoutMs ?? readConfiguredReadTimeoutMs(),
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new StorefrontUpstreamError(
      `Storefront API request failed: ${response.status} ${pathname}`,
      { pathname, status: response.status },
    );
  }

  return (await response.json()) as T;
}
