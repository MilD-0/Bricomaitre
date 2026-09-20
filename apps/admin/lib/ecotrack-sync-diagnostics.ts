/** Bounded, payload-free diagnostics suitable for job history, logs and Sentry. */
export type EcotrackSyncFailure = {
  stage: 'status' | 'tracking' | 'fallback' | 'maj' | 'persist';
  provider: string;
  batch: number;
  candidateCount: number;
  orderIds: number[];
  endpoint: string | null;
  kind: string;
  errorName: string;
  status: number | null;
  code: string | null;
  retryAfterSeconds: number | null;
  sourceFrames: string[];
};

const endpoints = {
  status: '/get/orders/status',
  tracking: '/get/trackings/info',
  fallback: '/get/orders',
  maj: '/get/maj',
  persist: null,
};

export function describeEcotrackSyncFailure(
  error: unknown,
  context: Pick<
    EcotrackSyncFailure,
    'stage' | 'provider' | 'batch' | 'candidateCount' | 'orderIds'
  >,
): EcotrackSyncFailure {
  const chain: Record<string, unknown>[] = [];
  let current = error;
  for (let depth = 0; depth < 5 && current && typeof current === 'object'; depth += 1) {
    const entry = current as Record<string, unknown>;
    chain.push(entry);
    current = entry.cause;
  }
  // Never persist error.message: fetch errors can contain token-bearing URLs,
  // and database wrappers include SQL parameters and customer information.
  const message = error instanceof Error ? error.message : '';
  const httpStatus = message.match(/^ECOTRACK request failed for .*?: (\d{3})\b/);
  const status =
    typeof chain[0]?.status === 'number'
      ? chain[0].status
      : httpStatus
        ? Number(httpStatus[1])
        : null;
  const code =
    chain
      .map((entry) => entry.code)
      .find(
        (value): value is string =>
          typeof value === 'string' && /^(?:[0-9A-Z]{5}|E[A-Z_]+|UND_ERR_[A-Z_]+)$/.test(value),
      ) ?? null;
  const names = chain.map((entry) => entry.name);
  const knownErrorNames = new Set([
    'Error',
    'TypeError',
    'RangeError',
    'SyntaxError',
    'ZodError',
    'TimeoutError',
    'AbortError',
    'DrizzleQueryError',
    'EcotrackRateLimitError',
    'EcotrackMutationRejectedError',
  ]);
  const errorName =
    typeof names[0] === 'string' && knownErrorNames.has(names[0]) ? names[0] : 'Error';
  let kind = 'unknown';
  if (status === 429) kind = 'rate_limit';
  else if (status !== null) kind = 'http';
  else if (names.includes('TimeoutError') || code === 'ETIMEDOUT' || code?.includes('TIMEOUT'))
    kind = 'timeout';
  else if (names.includes('AbortError')) kind = 'aborted';
  else if (names.includes('ZodError') || names.includes('SyntaxError')) kind = 'invalid_response';
  else if (code && /^[0-9A-Z]{5}$/.test(code) && /^\d/.test(code)) kind = 'database';
  else if (code || message === 'fetch failed') kind = 'network';
  else if (message === 'ECOTRACK rejected the shipment lookup.') kind = 'provider_rejected';
  else if (message.includes('is not configured.')) kind = 'configuration';
  const sourceFrames = chain
    .flatMap((entry) =>
      typeof entry.stack === 'string'
        ? entry.stack
            .split('\n')
            .slice(1)
            .flatMap((line) => {
              const frame = line.match(/^\s+at .*[/\\]([\w.-]+\.(?:c?js|mjs|tsx?):\d+:\d+)\)?$/);
              return frame ? [frame[1]] : [];
            })
        : [],
    )
    .slice(0, 5);
  const rateLimit = chain[0]?.rateLimit as Record<string, unknown> | undefined;
  return {
    ...context,
    sourceFrames,
    orderIds: context.orderIds.slice(0, 10),
    endpoint: endpoints[context.stage],
    kind,
    errorName,
    status,
    code,
    retryAfterSeconds:
      typeof rateLimit?.retryAfterSeconds === 'number' ? rateLimit.retryAfterSeconds : null,
  };
}

export function createEcotrackSyncDiagnostics() {
  let failureCount = 0;
  const failures: EcotrackSyncFailure[] = [];
  return {
    record(error: unknown, context: Parameters<typeof describeEcotrackSyncFailure>[1]) {
      failureCount += 1;
      if (failures.length < 20) failures.push(describeEcotrackSyncFailure(error, context));
    },
    summary() {
      return failureCount > 0
        ? { failureCount, failures, failuresTruncated: failureCount - failures.length }
        : {};
    },
  };
}
