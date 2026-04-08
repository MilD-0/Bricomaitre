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

const ecotrackMajEntrySchema = z.object({
  remarque: z.string().trim(),
  station: z.string().trim().optional().nullable(),
  livreur: z.string().trim().optional().nullable(),
  created_at: z.string().trim(),
  tracking: z.string().trim(),
});

const ecotrackTrackingInfoActivitySchema = z.object({
  date: z.string().trim().min(1),
  time: z.string().trim().min(1),
  status: z.string().trim().min(1),
  scanLocation: z.string().trim().optional().nullable(),
});

const ecotrackTrackingInfoSchema = z.object({
  recipientName: z.string().trim().optional().nullable(),
  shippedBy: z.string().trim().optional().nullable(),
  originCity: z.union([z.number(), z.string()]).optional().nullable(),
  destLocationCity: z.union([z.number(), z.string()]).optional().nullable(),
  activity: z.array(ecotrackTrackingInfoActivitySchema).default([]),
});

const ecotrackStatusActivitySchema = z.object({
  reason: z.string().trim().optional().nullable(),
  details: z.string().trim().optional().nullable(),
  station: z.string().trim().optional().nullable(),
  driver: z.string().trim().optional().nullable(),
  date: z.string().trim().optional().nullable(),
  time: z.string().trim().optional().nullable(),
  postponed_to: z.union([z.string(), z.null()]).optional(),
});

const ecotrackStatusItemSchema = z.object({
  status: z.string().trim().min(1),
  order_id: z.union([z.string(), z.number()]).optional().nullable(),
  desk_phone: z.string().trim().optional().nullable(),
  desk_commune: z.string().trim().optional().nullable(),
  desk_map_link: z.string().trim().optional().nullable(),
  desk_address: z.string().trim().optional().nullable(),
  driver_phone: z.string().trim().optional().nullable(),
  estimated_fee: z.union([z.string(), z.number()]).optional().nullable(),
  activity: z.array(ecotrackStatusActivitySchema).default([]),
});

export type EcotrackMajEntry = z.infer<typeof ecotrackMajEntrySchema>;
export type EcotrackTrackingInfo = z.infer<typeof ecotrackTrackingInfoSchema>;
export type EcotrackStatusItem = z.infer<typeof ecotrackStatusItemSchema>;

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
  const minuteRemaining = readNumber('x-ratelimit-remaining')
    ?? readNumber('x-ratelimit-remaining-minute')
    ?? readNumber('x-ratelimit-limit-remaining');
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

function readEcotrackSuccess(payload: unknown) {
  if (typeof payload !== 'object' || payload === null) {
    return false;
  }

  const value = (payload as Record<string, unknown>).success;
  return value === true || value === 1 || value === '1';
}

function readEcotrackMessage(payload: unknown) {
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
    return value
      .map((entry) => typeof entry === 'string' ? entry.trim() : '')
      .filter(Boolean);
  }

  if (typeof value === 'object') {
    return Object.values(value)
      .flatMap((entry) => Array.isArray(entry) ? entry : [entry])
      .map((entry) => typeof entry === 'string' ? entry.trim() : '')
      .filter(Boolean);
  }

  return [];
}

function buildEcotrackResultMessage(payload: unknown, fallback: string) {
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

function assertEcotrackMutationSuccess(result: EcotrackRequestResult, fallbackMessage: string): EcotrackMutationResult {
  const success = readEcotrackSuccess(result.payload);
  const message = readEcotrackMessage(result.payload)
    ?? (success ? null : buildEcotrackResultMessage(result.payload, fallbackMessage));

  if (!success) {
    throw new Error(message ?? fallbackMessage);
  }

  return {
    ...result,
    success,
    message,
  };
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

export async function requestEcotrack(options: EcotrackRequestOptions): Promise<EcotrackRequestResult> {
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

  const runRequest = async () => {
    const response = await fetchImpl(url, {
      method: options.method ?? 'GET',
      headers,
      body,
    });
    const text = await response.text();
    const rateLimit = parseRateLimit(response.headers, options.path);

    if (response.status === 429) {
      throw new EcotrackRateLimitError(`ECOTRACK rate limit exceeded for ${options.path}.`, rateLimit, 429);
    }

    let payload: unknown = text;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = text;
    }

    if (!response.ok) {
      throw new Error(`ECOTRACK request failed for ${options.path}: ${response.status} ${text.slice(0, 200)}`);
    }

    if (rateLimit.dayRemaining !== null && rateLimit.dayRemaining <= 0) {
      throw new EcotrackRateLimitError('ECOTRACK daily rate limit exhausted.', rateLimit);
    }
    if (rateLimit.hourRemaining !== null && rateLimit.hourRemaining <= 0) {
      throw new EcotrackRateLimitError('ECOTRACK hourly rate limit exhausted.', rateLimit);
    }

    return { payload, text, rateLimit, response };
  };

  if (options.respectGlobalLimiter === false) {
    return runRequest();
  }

  const minIntervalMs = Math.max(Number(env.ECOTRACK_MIN_REQUEST_INTERVAL_MS ?? 1500), 0);
  return runWithLimiter(runRequest, minIntervalMs);
}

export async function requestEcotrackBinary(options: EcotrackRequestOptions): Promise<EcotrackBinaryResult> {
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

  const runRequest = async () => {
    const response = await fetchImpl(url, {
      method: options.method ?? 'GET',
      headers: {
        Accept: options.accept ?? 'application/pdf, application/octet-stream;q=0.9, */*;q=0.8',
        Authorization: `Bearer ${token}`,
      },
    });
    const rateLimit = parseRateLimit(response.headers, options.path);

    if (response.status === 429) {
      throw new EcotrackRateLimitError(`ECOTRACK rate limit exceeded for ${options.path}.`, rateLimit, 429);
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`ECOTRACK request failed for ${options.path}: ${response.status} ${text.slice(0, 200)}`);
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

export async function validateEcotrackToken(options: {
  fetchImpl?: typeof fetch;
  env?: NodeJS.ProcessEnv;
} = {}): Promise<EcotrackTokenValidationResult> {
  const result = await requestEcotrack({
    path: '/validate/token',
    method: 'GET',
    fetchImpl: options.fetchImpl,
    env: options.env,
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
  } = {},
) {
  return requestEcotrackBinary({
    path: '/get/order/label',
    method: 'GET',
    query: { tracking },
    fetchImpl: options.fetchImpl,
    env: options.env,
  });
}

export async function updateEcotrackOrder(
  payload: Record<string, string | number | null | undefined>,
  options: {
    fetchImpl?: typeof fetch;
    env?: NodeJS.ProcessEnv;
  } = {},
) {
  const result = await requestEcotrack({
    path: '/update/order',
    method: 'POST',
    query: payload,
    fetchImpl: options.fetchImpl,
    env: options.env,
  });

  return assertEcotrackMutationSuccess(result, 'ECOTRACK rejected the order update.');
}

export async function deleteEcotrackOrder(
  tracking: string,
  options: {
    fetchImpl?: typeof fetch;
    env?: NodeJS.ProcessEnv;
  } = {},
) {
  const result = await requestEcotrack({
    path: '/delete/order',
    method: 'DELETE',
    query: { tracking },
    fetchImpl: options.fetchImpl,
    env: options.env,
  });

  return assertEcotrackMutationSuccess(result, 'ECOTRACK rejected the order deletion.');
}

export async function dispatchEcotrackOrder(
  tracking: string,
  askCollection = false,
  options: {
    fetchImpl?: typeof fetch;
    env?: NodeJS.ProcessEnv;
  } = {},
) {
  const result = await requestEcotrack({
    path: '/valid/order',
    method: 'POST',
    query: { tracking, ask_collection: askCollection ? 1 : 0 },
    fetchImpl: options.fetchImpl,
    env: options.env,
  });

  return assertEcotrackMutationSuccess(result, 'ECOTRACK rejected the dispatch request.');
}

export async function addEcotrackMaj(
  tracking: string,
  content: string,
  options: {
    fetchImpl?: typeof fetch;
    env?: NodeJS.ProcessEnv;
  } = {},
) {
  const result = await requestEcotrack({
    path: '/add/maj',
    method: 'POST',
    query: { tracking, content },
    fetchImpl: options.fetchImpl,
    env: options.env,
  });

  return assertEcotrackMutationSuccess(result, 'ECOTRACK rejected the follow-up update.');
}

export async function getEcotrackMaj(
  tracking: string,
  options: {
    fetchImpl?: typeof fetch;
    env?: NodeJS.ProcessEnv;
  } = {},
) {
  const result = await requestEcotrack({
    path: '/get/maj',
    method: 'GET',
    query: { tracking },
    fetchImpl: options.fetchImpl,
    env: options.env,
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
  } = {},
) {
  const result = await requestEcotrack({
    path: '/get/tracking/info',
    method: 'GET',
    query: { tracking },
    fetchImpl: options.fetchImpl,
    env: options.env,
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
  });

  const payload = typeof result.payload === 'object' && result.payload !== null
    ? result.payload as Record<string, unknown>
    : {};
  const normalized = new Map<string, EcotrackTrackingInfo>();
  for (const tracking of trackings) {
    const raw = payload[tracking];
    if (!raw) continue;
    normalized.set(tracking, ecotrackTrackingInfoSchema.parse(raw));
  }

  return {
    ...result,
    data: normalized,
  };
}

export async function getEcotrackOrdersStatus(
  trackings: string[],
  status = 'all',
  options: {
    fetchImpl?: typeof fetch;
    env?: NodeJS.ProcessEnv;
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
  });

  const payload = typeof result.payload === 'object' && result.payload !== null
    ? result.payload as Record<string, unknown>
    : {};
  const rawData = typeof payload.data === 'object' && payload.data !== null
    ? payload.data as Record<string, unknown>
    : {};
  const normalized = new Map<string, EcotrackStatusItem>();
  for (const tracking of trackings) {
    const raw = rawData[tracking];
    if (!raw) continue;
    normalized.set(tracking, ecotrackStatusItemSchema.parse(raw));
  }

  return {
    ...result,
    data: normalized,
  };
}

export async function requestEcotrackReturn(
  tracking: string,
  options: {
    fetchImpl?: typeof fetch;
    env?: NodeJS.ProcessEnv;
  } = {},
) {
  const result = await requestEcotrack({
    path: '/ask/for/order/return',
    method: 'POST',
    query: { tracking },
    fetchImpl: options.fetchImpl,
    env: options.env,
  });

  return assertEcotrackMutationSuccess(result, 'ECOTRACK rejected the return request.');
}
