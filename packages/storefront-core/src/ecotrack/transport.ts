import {
  type EcotrackBinaryResult,
  type EcotrackRequestOptions,
  type EcotrackRequestResult,
} from './contract';
import { EcotrackMutationRejectedError, EcotrackRateLimitError } from './errors';
import { getEcotrackConfig, parseRateLimit, runWithLimiter } from './rate-limit';

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
