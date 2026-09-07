import { createSign } from 'node:crypto';
import { z } from 'zod';
import { readSearchConsoleConfig, SearchConsoleSyncError } from './config';
import { type FetchLike, SEARCH_CONSOLE_SCOPE } from './contract';

function base64Url(value: string) {
  return Buffer.from(value).toString('base64url');
}

export async function accessToken(
  config: ReturnType<typeof readSearchConsoleConfig>,
  fetchImpl: FetchLike,
  now: Date,
) {
  const issuedAt = Math.floor(now.getTime() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64Url(
    JSON.stringify({
      iss: config.credentials.client_email,
      scope: SEARCH_CONSOLE_SCOPE,
      aud: config.credentials.token_uri,
      iat: issuedAt,
      exp: issuedAt + 3600,
    }),
  );
  const unsigned = `${header}.${claims}`;
  const signer = createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  const assertion = `${unsigned}.${signer.sign(config.credentials.private_key).toString('base64url')}`;
  const body = await googleRequest(
    config.credentials.token_uri,
    {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
    },
    null,
    fetchImpl,
  );
  const parsed = z.object({ access_token: z.string().min(1) }).safeParse(body);
  if (!parsed.success) {
    throw new SearchConsoleSyncError(
      'Search Console authentication failed.',
      'authentication_failed',
    );
  }
  return parsed.data.access_token;
}

export async function googleRequest(
  url: string,
  init: RequestInit,
  token: string | null,
  fetchImpl: FetchLike,
): Promise<unknown> {
  let lastError = new SearchConsoleSyncError('Search Console request failed.', 'request_failed');
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetchImpl(url, {
        ...init,
        ...(token
          ? { headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' } }
          : {}),
        signal: controller.signal,
      });
      const body: unknown = await response.json();
      if (response.ok) return body;
      const error = z
        .object({
          error: z
            .union([
              z.string(),
              z.object({ message: z.string().optional(), status: z.string().optional() }),
            ])
            .optional(),
        })
        .safeParse(body);
      const detail = error.success ? error.data.error : undefined;
      lastError = new SearchConsoleSyncError(
        typeof detail === 'object'
          ? detail.message?.slice(0, 500) || 'Search Console request failed.'
          : 'Search Console request failed.',
        typeof detail === 'string' ? detail : detail?.status || 'request_failed',
        response.status,
      );
      if (response.status !== 429 && response.status < 500) throw lastError;
    } catch (error) {
      if (error instanceof SearchConsoleSyncError) throw error;
      lastError = new SearchConsoleSyncError(
        controller.signal.aborted
          ? 'Search Console request timed out.'
          : 'Search Console returned an unreadable response.',
        controller.signal.aborted ? 'request_timeout' : 'invalid_response',
      );
    } finally {
      clearTimeout(timeout);
    }
    if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
  }
  throw lastError;
}
