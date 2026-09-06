import { z } from 'zod';

export type EcotrackRateLimitSnapshot = {
  path: string;
  limit: number | null;
  remaining: number | null;
  reset: number | null;
};

export type EcotrackExtendedRateLimitSnapshot = EcotrackRateLimitSnapshot & {
  minuteLimit: number | null;
  minuteRemaining: number | null;
  minuteReset: number | null;
  hourLimit: number | null;
  hourRemaining: number | null;
  hourReset: number | null;
  dayLimit: number | null;
  dayRemaining: number | null;
  dayReset: number | null;
  retryAfterSeconds: number | null;
};

export type EcotrackRequestOptions = {
  path: string;
  method?: 'GET' | 'POST' | 'DELETE';
  query?: Record<string, string | number | boolean | null | undefined>;
  json?: unknown;
  fetchImpl?: typeof fetch;
  env?: NodeJS.ProcessEnv;
  deadlineAt?: number;
  accept?: string;
  respectGlobalLimiter?: boolean;
};

export type EcotrackRequestResult = {
  payload: unknown;
  text: string;
  rateLimit: EcotrackExtendedRateLimitSnapshot;
  response: Response;
};

export type EcotrackBinaryResult = {
  body: ArrayBuffer;
  contentType: string | null;
  contentDisposition: string | null;
  rateLimit: EcotrackExtendedRateLimitSnapshot;
  response: Response;
};

export type EcotrackTokenValidationResult = {
  success: boolean;
  message: string | null;
  raw: unknown;
  rateLimit: EcotrackExtendedRateLimitSnapshot;
};

export type EcotrackMutationResult = EcotrackRequestResult & {
  success: boolean;
  message: string | null;
};

type LimiterState = {
  chain: Promise<unknown>;
  lastStartedAt: number;
};

const limiterGlobal = globalThis as typeof globalThis & {
  __ecotrackRequestLimiter?: LimiterState;
};

const ecotrackMajEntrySchema = z
  .object({
    remarque: z.string().trim(),
    station: z.string().trim().optional().nullable(),
    livreur: z.string().trim().optional().nullable(),
    created_at: z.string().trim(),
    tracking: z.string().trim(),
  })
  .passthrough();

const ecotrackTrackingInfoActivitySchema = z
  .object({
    date: z.string().trim().min(1),
    time: z.string().trim().min(1),
    status: z.string().trim().min(1),
    scanLocation: z.string().trim().optional().nullable(),
  })
  .passthrough();

const ecotrackOrderInfoSchema = z
  .object({
    tracking: z.string().trim().min(1),
    reference: z.union([z.string(), z.number()]).optional().nullable(),
    montant: z.union([z.string(), z.number()]).optional().nullable(),
    tarif_prestation: z.union([z.string(), z.number()]).optional().nullable(),
    tarif_retour: z.union([z.string(), z.number()]).optional().nullable(),
    stop_desk: z.union([z.boolean(), z.string(), z.number()]).optional().nullable(),
    payment_id: z.union([z.string(), z.number()]).optional().nullable(),
    status_reason: z.string().trim().optional().nullable(),
    created_at: z.string().trim().optional().nullable(),
    last_updated_at: z.string().trim().optional().nullable(),
    livred_at: z.string().trim().optional().nullable(),
  })
  .passthrough();

const ecotrackTrackingInfoSchema = z
  .object({
    recipientName: z.string().trim().optional().nullable(),
    shippedBy: z.string().trim().optional().nullable(),
    originCity: z.union([z.number(), z.string()]).optional().nullable(),
    destLocationCity: z.union([z.number(), z.string()]).optional().nullable(),
    status: z.string().trim().optional().nullable(),
    OrderInfo: ecotrackOrderInfoSchema.optional().nullable(),
    deliveryAttempts: z.array(z.unknown()).default([]),
    activity: z.array(ecotrackTrackingInfoActivitySchema).default([]),
  })
  .passthrough();

const ecotrackStatusActivitySchema = z
  .object({
    reason: z.string().trim().optional().nullable(),
    details: z.string().trim().optional().nullable(),
    station: z.string().trim().optional().nullable(),
    driver: z.string().trim().optional().nullable(),
    date: z.string().trim().optional().nullable(),
    time: z.string().trim().optional().nullable(),
    postponed_to: z.union([z.string(), z.null()]).optional(),
  })
  .passthrough();

const ecotrackStatusItemSchema = z
  .object({
    status: z.string().trim().min(1),
    order_id: z.union([z.string(), z.number()]).optional().nullable(),
    desk_phone: z.string().trim().optional().nullable(),
    desk_commune: z.string().trim().optional().nullable(),
    desk_map_link: z.string().trim().optional().nullable(),
    desk_address: z.string().trim().optional().nullable(),
    driver_phone: z.string().trim().optional().nullable(),
    estimated_fee: z.union([z.string(), z.number()]).optional().nullable(),
    activity: z.array(ecotrackStatusActivitySchema).default([]),
  })
  .passthrough();

const ecotrackOrderSummarySchema = ecotrackOrderInfoSchema.extend({
  status: z.string().trim().min(1),
});

const ecotrackOrdersPageSchema = z
  .object({
    current_page: z.union([z.string(), z.number()]).optional(),
    last_page: z.union([z.string(), z.number()]).optional(),
    next_page_url: z.string().nullable().optional(),
    data: z.array(ecotrackOrderSummarySchema).default([]),
  })
  .passthrough();

export type EcotrackMajEntry = z.infer<typeof ecotrackMajEntrySchema>;
export type EcotrackTrackingInfo = z.infer<typeof ecotrackTrackingInfoSchema>;
export type EcotrackStatusItem = z.infer<typeof ecotrackStatusItemSchema>;
export type EcotrackOrderInfo = z.infer<typeof ecotrackOrderInfoSchema>;
export type EcotrackOrderSummary = z.infer<typeof ecotrackOrderSummarySchema>;
export type EcotrackOrdersPage = z.infer<typeof ecotrackOrdersPageSchema>;

function getLimiterState() {
  if (!limiterGlobal.__ecotrackRequestLimiter) {
    limiterGlobal.__ecotrackRequestLimiter = {
      chain: Promise.resolve(),
      lastStartedAt: 0,
    };
  }

  return limiterGlobal.__ecotrackRequestLimiter;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runWithLimiter<T>(action: () => Promise<T>, minIntervalMs: number) {
  const state = getLimiterState();
  const run = state.chain.then(async () => {
    const elapsed = Date.now() - state.lastStartedAt;
    if (elapsed < minIntervalMs) {
      await sleep(minIntervalMs - elapsed);
    }
    state.lastStartedAt = Date.now();
    return action();
  });

  state.chain = run.catch(() => undefined);
  return run;
}

export function cleanEcotrackEnvValue(value: string | undefined | null) {
  return String(value ?? '')
    .trim()
    .replace(/^['"\s]+/, '')
    .replace(/['",\s]+$/, '');
}

export function getEcotrackConfig(env: NodeJS.ProcessEnv = process.env) {
  const baseUrl = cleanEcotrackEnvValue(env.ECOTRACK_BASE_URL).replace(/\/$/, '');
  const token = cleanEcotrackEnvValue(env.ECOTRACK_TOKEN);

  if (!baseUrl) {
    throw new Error('ECOTRACK_BASE_URL is not configured.');
  }

  if (!token) {
    throw new Error('ECOTRACK_TOKEN is not configured.');
  }

  return { baseUrl, token };
}

function parseRateLimit(headers: Headers, path: string): EcotrackExtendedRateLimitSnapshot {
  const readNumber = (headerName: string) => {
    const value = headers.get(headerName);
    if (!value) return null;
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const minuteLimit = readNumber('x-ratelimit-limit') ?? readNumber('x-ratelimit-limit-minute');
  const minuteRemaining =
    readNumber('x-ratelimit-remaining') ??
    readNumber('x-ratelimit-remaining-minute') ??
    readNumber('x-ratelimit-limit-remaining');
  const minuteReset = readNumber('x-ratelimit-reset') ?? readNumber('x-ratelimit-reset-minute');

  return {
    path,
    limit: minuteLimit,
    remaining: minuteRemaining,
    reset: minuteReset,
    minuteLimit,
    minuteRemaining,
    minuteReset,
    hourLimit: readNumber('x-ratelimit-limit-hour'),
    hourRemaining: readNumber('x-ratelimit-remaining-hour'),
    hourReset: readNumber('x-ratelimit-reset-hour'),
    dayLimit: readNumber('x-ratelimit-limit-day'),
    dayRemaining: readNumber('x-ratelimit-remaining-day'),
    dayReset: readNumber('x-ratelimit-reset-day'),
    retryAfterSeconds: readNumber('retry-after'),
  };
}

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

function assertEcotrackMutationSuccess(
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

export async function requestEcotrack(
  options: EcotrackRequestOptions,
): Promise<EcotrackRequestResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const env = options.env ?? process.env;
  const { baseUrl, token } = getEcotrackConfig(env);
  const url = new URL(`${baseUrl}${options.path}`);
  url.searchParams.set('api_token', token);

  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== null && value !== undefined && String(value).trim() !== '') {
      url.searchParams.set(key, String(value));
    }
  }

  const headers: HeadersInit = {
    Accept: options.accept ?? 'application/json, text/plain;q=0.9',
    Authorization: `Bearer ${token}`,
  };
  let body: string | undefined;

  if (options.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.json);
  }

  const signal = AbortSignal.timeout(
    Math.max(1, (options.deadlineAt ?? Date.now() + 30_000) - Date.now()),
  );
  const runRequest = async () => {
    if (options.deadlineAt !== undefined && Date.now() >= options.deadlineAt)
      throw new EcotrackMutationRejectedError('ECOTRACK request deadline expired before sending.');
    signal.throwIfAborted();
    const response = await fetchImpl(url, {
      method: options.method ?? 'GET',
      headers,
      body,
      signal,
    });
    const text = await response.text();
    const rateLimit = parseRateLimit(response.headers, options.path);

    if (response.status === 429) {
      throw new EcotrackRateLimitError(
        `ECOTRACK rate limit exceeded for ${options.path}.`,
        rateLimit,
        429,
      );
    }

    let payload: unknown = text;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = text;
    }

    if (!response.ok) {
      const message = `ECOTRACK request failed for ${options.path}: ${response.status} ${text.slice(0, 200)}`;
      if (response.status >= 400 && response.status < 500)
        throw new EcotrackMutationRejectedError(message);
      throw new Error(message);
    }

    return { payload, text, rateLimit, response };
  };

  if (options.respectGlobalLimiter === false) {
    return runRequest();
  }

  const minIntervalMs = Math.max(Number(env.ECOTRACK_MIN_REQUEST_INTERVAL_MS ?? 1500), 0);
  return runWithLimiter(runRequest, minIntervalMs);
}

export async function requestEcotrackBinary(
  options: EcotrackRequestOptions,
): Promise<EcotrackBinaryResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const env = options.env ?? process.env;
  const { baseUrl, token } = getEcotrackConfig(env);
  const url = new URL(`${baseUrl}${options.path}`);
  url.searchParams.set('api_token', token);

  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== null && value !== undefined && String(value).trim() !== '') {
      url.searchParams.set(key, String(value));
    }
  }

  const signal = AbortSignal.timeout(
    Math.max(1, (options.deadlineAt ?? Date.now() + 30_000) - Date.now()),
  );
  const runRequest = async () => {
    if (options.deadlineAt !== undefined && Date.now() >= options.deadlineAt)
      throw new EcotrackMutationRejectedError('ECOTRACK request deadline expired before sending.');
    signal.throwIfAborted();
    const response = await fetchImpl(url, {
      method: options.method ?? 'GET',
      headers: {
        Accept: options.accept ?? 'application/pdf, application/octet-stream;q=0.9, */*;q=0.8',
        Authorization: `Bearer ${token}`,
      },
      signal,
    });
    const rateLimit = parseRateLimit(response.headers, options.path);

    if (response.status === 429) {
      throw new EcotrackRateLimitError(
        `ECOTRACK rate limit exceeded for ${options.path}.`,
        rateLimit,
        429,
      );
    }

    if (!response.ok) {
      const text = await response.text();
      const message = `ECOTRACK request failed for ${options.path}: ${response.status} ${text.slice(0, 200)}`;
      if (response.status >= 400 && response.status < 500)
        throw new EcotrackMutationRejectedError(message);
      throw new Error(message);
    }

    return {
      body: await response.arrayBuffer(),
      contentType: response.headers.get('content-type'),
      contentDisposition: response.headers.get('content-disposition'),
      rateLimit,
      response,
    };
  };

  if (options.respectGlobalLimiter === false) {
    return runRequest();
  }

  const minIntervalMs = Math.max(Number(env.ECOTRACK_MIN_REQUEST_INTERVAL_MS ?? 1500), 0);
  return runWithLimiter(runRequest, minIntervalMs);
}

export async function validateEcotrackToken(
  options: {
    fetchImpl?: typeof fetch;
    env?: NodeJS.ProcessEnv;
    deadlineAt?: number;
  } = {},
): Promise<EcotrackTokenValidationResult> {
  const result = await requestEcotrack({
    path: '/validate/token',
    method: 'GET',
    fetchImpl: options.fetchImpl,
    env: options.env,
    deadlineAt: options.deadlineAt,
  });

  return {
    success: readEcotrackSuccess(result.payload),
    message: readEcotrackMessage(result.payload),
    raw: result.payload,
    rateLimit: result.rateLimit,
  };
}

export async function fetchEcotrackOrderLabel(
  tracking: string,
  options: {
    fetchImpl?: typeof fetch;
    env?: NodeJS.ProcessEnv;
    deadlineAt?: number;
  } = {},
) {
  return requestEcotrackBinary({
    path: '/get/order/label',
    method: 'GET',
    query: { tracking },
    fetchImpl: options.fetchImpl,
    env: options.env,
    deadlineAt: options.deadlineAt,
  });
}

export async function updateEcotrackOrder(
  payload: Record<string, string | number | null | undefined>,
  options: {
    fetchImpl?: typeof fetch;
    env?: NodeJS.ProcessEnv;
    deadlineAt?: number;
  } = {},
) {
  const result = await requestEcotrack({
    path: '/update/order',
    method: 'POST',
    query: payload,
    fetchImpl: options.fetchImpl,
    env: options.env,
    deadlineAt: options.deadlineAt,
  });

  return assertEcotrackMutationSuccess(result, 'ECOTRACK rejected the order update.');
}

export async function deleteEcotrackOrder(
  tracking: string,
  options: {
    fetchImpl?: typeof fetch;
    env?: NodeJS.ProcessEnv;
    deadlineAt?: number;
  } = {},
) {
  const result = await requestEcotrack({
    path: '/delete/order',
    method: 'DELETE',
    query: { tracking },
    fetchImpl: options.fetchImpl,
    env: options.env,
    deadlineAt: options.deadlineAt,
  });

  return assertEcotrackMutationSuccess(result, 'ECOTRACK rejected the order deletion.');
}

export async function dispatchEcotrackOrder(
  tracking: string,
  askCollection = false,
  options: {
    fetchImpl?: typeof fetch;
    env?: NodeJS.ProcessEnv;
    deadlineAt?: number;
  } = {},
) {
  const result = await requestEcotrack({
    path: '/valid/order',
    method: 'POST',
    query: { tracking, ask_collection: askCollection ? 1 : 0 },
    fetchImpl: options.fetchImpl,
    env: options.env,
    deadlineAt: options.deadlineAt,
  });

  return assertEcotrackMutationSuccess(result, 'ECOTRACK rejected the dispatch request.');
}

export async function addEcotrackMaj(
  tracking: string,
  content: string,
  options: {
    fetchImpl?: typeof fetch;
    env?: NodeJS.ProcessEnv;
    deadlineAt?: number;
  } = {},
) {
  const result = await requestEcotrack({
    path: '/add/maj',
    method: 'POST',
    query: { tracking, content },
    fetchImpl: options.fetchImpl,
    env: options.env,
    deadlineAt: options.deadlineAt,
  });

  return assertEcotrackMutationSuccess(result, 'ECOTRACK rejected the follow-up update.');
}

export async function getEcotrackMaj(
  tracking: string,
  options: {
    fetchImpl?: typeof fetch;
    env?: NodeJS.ProcessEnv;
    deadlineAt?: number;
  } = {},
) {
  const result = await requestEcotrack({
    path: '/get/maj',
    method: 'GET',
    query: { tracking },
    fetchImpl: options.fetchImpl,
    env: options.env,
    deadlineAt: options.deadlineAt,
  });

  return {
    ...result,
    data: z.array(ecotrackMajEntrySchema).parse(result.payload),
  };
}

export async function getEcotrackTrackingInfo(
  tracking: string,
  options: {
    fetchImpl?: typeof fetch;
    env?: NodeJS.ProcessEnv;
    deadlineAt?: number;
  } = {},
) {
  const result = await requestEcotrack({
    path: '/get/tracking/info',
    method: 'GET',
    query: { tracking },
    fetchImpl: options.fetchImpl,
    env: options.env,
    deadlineAt: options.deadlineAt,
  });

  return {
    ...result,
    data: ecotrackTrackingInfoSchema.parse(result.payload),
  };
}

export async function getEcotrackTrackingsInfo(
  trackings: string[],
  options: {
    fetchImpl?: typeof fetch;
    env?: NodeJS.ProcessEnv;
    deadlineAt?: number;
  } = {},
) {
  const queryString = trackings
    .map((tracking) => `trackings[]=${encodeURIComponent(tracking)}`)
    .join('&');
  const result = await requestEcotrack({
    path: queryString ? `/get/trackings/info?${queryString}` : '/get/trackings/info',
    method: 'GET',
    fetchImpl: options.fetchImpl,
    env: options.env,
    deadlineAt: options.deadlineAt,
  });

  const payload =
    typeof result.payload === 'object' && result.payload !== null
      ? (result.payload as Record<string, unknown>)
      : {};
  const normalized = new Map<string, EcotrackTrackingInfo>();
  const rawData = new Map<string, unknown>();
  for (const tracking of trackings) {
    const raw = payload[tracking];
    if (!raw) continue;
    rawData.set(tracking, raw);
    normalized.set(tracking, ecotrackTrackingInfoSchema.parse(raw));
  }

  return {
    ...result,
    data: normalized,
    rawData,
  };
}

export async function getEcotrackOrdersStatus(
  trackings: string[],
  status = 'all',
  options: {
    fetchImpl?: typeof fetch;
    env?: NodeJS.ProcessEnv;
    deadlineAt?: number;
  } = {},
) {
  const result = await requestEcotrack({
    path: '/get/orders/status',
    method: 'GET',
    query: {
      trackings: trackings.join(','),
      status,
    },
    fetchImpl: options.fetchImpl,
    env: options.env,
    deadlineAt: options.deadlineAt,
  });

  const payload =
    typeof result.payload === 'object' && result.payload !== null
      ? (result.payload as Record<string, unknown>)
      : {};
  const rawData =
    typeof payload.data === 'object' && payload.data !== null
      ? (payload.data as Record<string, unknown>)
      : {};
  const normalized = new Map<string, EcotrackStatusItem>();
  const rawItems = new Map<string, unknown>();
  for (const tracking of trackings) {
    const raw = rawData[tracking];
    if (!raw) continue;
    rawItems.set(tracking, raw);
    normalized.set(tracking, ecotrackStatusItemSchema.parse(raw));
  }

  return {
    ...result,
    data: normalized,
    rawData: rawItems,
  };
}

export async function getEcotrackOrdersPage(
  options: {
    page?: number;
    startDate?: string;
    endDate?: string;
    tracking?: string;
    fetchImpl?: typeof fetch;
    env?: NodeJS.ProcessEnv;
    deadlineAt?: number;
  } = {},
) {
  const result = await requestEcotrack({
    path: '/get/orders',
    method: 'GET',
    query: {
      page: options.page,
      start_date: options.startDate,
      end_date: options.endDate,
      tracking: options.tracking,
    },
    fetchImpl: options.fetchImpl,
    env: options.env,
    deadlineAt: options.deadlineAt,
  });
  const rawPage =
    typeof result.payload === 'object' && result.payload !== null
      ? (result.payload as Record<string, unknown>)
      : {};
  const page = ecotrackOrdersPageSchema.parse(rawPage);
  const rawRows = Array.isArray(rawPage.data) ? rawPage.data : [];
  const rawData = new Map<string, unknown>();
  for (const raw of rawRows) {
    if (!raw || typeof raw !== 'object') continue;
    const tracking = (raw as Record<string, unknown>).tracking;
    if (typeof tracking === 'string' && tracking.trim()) rawData.set(tracking, raw);
  }
  return { ...result, data: page.data, page, rawData };
}

export async function listEcotrackOrders(
  options: {
    startDate?: string;
    endDate?: string;
    maxPages?: number;
    fetchImpl?: typeof fetch;
    env?: NodeJS.ProcessEnv;
    deadlineAt?: number;
  } = {},
) {
  const maxPages = Math.min(100, Math.max(1, Math.trunc(options.maxPages ?? 100)));
  const data: EcotrackOrderSummary[] = [];
  const rawData = new Map<string, unknown>();
  const rateLimits: EcotrackExtendedRateLimitSnapshot[] = [];
  let pageNumber = 1;
  let lastPage = 1;

  do {
    const result = await getEcotrackOrdersPage({ ...options, page: pageNumber });
    data.push(...result.data);
    for (const [tracking, raw] of result.rawData) rawData.set(tracking, raw);
    rateLimits.push(result.rateLimit);
    const parsedLastPage = Number(result.page.last_page ?? pageNumber);
    lastPage = Number.isFinite(parsedLastPage) ? Math.max(pageNumber, parsedLastPage) : pageNumber;
    pageNumber += 1;
  } while (pageNumber <= lastPage && pageNumber <= maxPages);

  return {
    data,
    rawData,
    pagesFetched: pageNumber - 1,
    truncated: lastPage >= pageNumber && pageNumber > maxPages,
    rateLimits,
  };
}

export async function getEcotrackOrder(
  tracking: string,
  options: {
    startDate?: string;
    fetchImpl?: typeof fetch;
    env?: NodeJS.ProcessEnv;
    deadlineAt?: number;
  } = {},
) {
  const result = await getEcotrackOrdersPage({
    tracking,
    startDate: options.startDate,
    fetchImpl: options.fetchImpl,
    env: options.env,
    deadlineAt: options.deadlineAt,
  });

  return {
    ...result,
    data: result.data.find((order) => order.tracking === tracking) ?? null,
    raw: result.rawData.get(tracking) ?? null,
  };
}

export async function requestEcotrackReturn(
  tracking: string,
  options: {
    fetchImpl?: typeof fetch;
    env?: NodeJS.ProcessEnv;
    deadlineAt?: number;
  } = {},
) {
  const result = await requestEcotrack({
    path: '/ask/for/order/return',
    method: 'POST',
    query: { tracking },
    fetchImpl: options.fetchImpl,
    env: options.env,
    deadlineAt: options.deadlineAt,
  });

  return assertEcotrackMutationSuccess(result, 'ECOTRACK rejected the return request.');
}
