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

export const limiterGlobal = globalThis as typeof globalThis & {
  __ecotrackRequestLimiter?: LimiterState;
};
