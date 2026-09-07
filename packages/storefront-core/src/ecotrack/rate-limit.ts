import { limiterGlobal, type EcotrackExtendedRateLimitSnapshot } from './contract';

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

export async function runWithLimiter<T>(action: () => Promise<T>, minIntervalMs: number) {
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

export function parseRateLimit(headers: Headers, path: string): EcotrackExtendedRateLimitSnapshot {
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
