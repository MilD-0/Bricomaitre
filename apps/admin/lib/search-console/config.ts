import { readFileSync } from 'node:fs';
import {
  credentialsSchema,
  DEFAULT_SEARCH_ANALYTICS_ENDPOINT,
  DEFAULT_SEARCH_INSPECTION_ENDPOINT,
  DEFAULT_SITE_ORIGIN,
  DEFAULT_SITE_URL,
} from './contract';

export class SearchConsoleSyncError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number | null = null,
  ) {
    super(message);
    this.name = 'SearchConsoleSyncError';
  }
}

export type SearchConsoleEnvironment = {
  [key: string]: string | undefined;
  GOOGLE_SEARCH_CONSOLE_CREDENTIALS_BASE64?: string;
  GOOGLE_SEARCH_CONSOLE_CREDENTIALS_JSON?: string;
  GOOGLE_APPLICATION_CREDENTIALS?: string;
  SEARCH_CONSOLE_SITE_URL?: string;
  SEARCH_CONSOLE_SITE_ORIGIN?: string;
  SEARCH_CONSOLE_ANALYTICS_ENDPOINT?: string;
  SEARCH_CONSOLE_INSPECTION_ENDPOINT?: string;
};

function decodeCredentials(env: SearchConsoleEnvironment) {
  if (env.GOOGLE_SEARCH_CONSOLE_CREDENTIALS_BASE64?.trim()) {
    return Buffer.from(env.GOOGLE_SEARCH_CONSOLE_CREDENTIALS_BASE64.trim(), 'base64').toString(
      'utf8',
    );
  }
  if (env.GOOGLE_SEARCH_CONSOLE_CREDENTIALS_JSON?.trim()) {
    return env.GOOGLE_SEARCH_CONSOLE_CREDENTIALS_JSON.trim();
  }
  if (env.GOOGLE_APPLICATION_CREDENTIALS?.trim()) {
    return readFileSync(env.GOOGLE_APPLICATION_CREDENTIALS.trim(), 'utf8');
  }
  throw new SearchConsoleSyncError(
    'Search Console service-account credentials are not configured.',
    'unconfigured',
  );
}

export function readSearchConsoleConfig(env: SearchConsoleEnvironment = process.env) {
  let credentialsJson: unknown;
  try {
    credentialsJson = JSON.parse(decodeCredentials(env));
  } catch (error) {
    if (error instanceof SearchConsoleSyncError) throw error;
    throw new SearchConsoleSyncError(
      'Search Console credentials are not valid JSON.',
      'invalid_credentials',
    );
  }
  const parsed = credentialsSchema.safeParse(credentialsJson);
  if (!parsed.success) {
    throw new SearchConsoleSyncError(
      'Search Console credentials are missing the client email or private key.',
      'invalid_credentials',
    );
  }
  const siteUrl = env.SEARCH_CONSOLE_SITE_URL?.trim() || DEFAULT_SITE_URL;
  const siteOrigin = (env.SEARCH_CONSOLE_SITE_ORIGIN?.trim() || DEFAULT_SITE_ORIGIN).replace(
    /\/$/,
    '',
  );
  if (!siteUrl.startsWith('sc-domain:') && !/^https?:\/\//.test(siteUrl)) {
    throw new SearchConsoleSyncError('SEARCH_CONSOLE_SITE_URL is invalid.', 'invalid_site_url');
  }
  let validOrigin = false;
  try {
    const url = new URL(siteOrigin);
    const localDemo =
      env.BRIC_DEMO_MODE?.trim().toLowerCase() === 'true' &&
      url.protocol === 'http:' &&
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    validOrigin = url.origin === siteOrigin && (url.protocol === 'https:' || localDemo);
  } catch {
    // Report malformed URLs through the same configuration error below.
  }
  if (!validOrigin) {
    throw new SearchConsoleSyncError(
      'SEARCH_CONSOLE_SITE_ORIGIN must be an HTTPS origin (HTTP loopback is allowed in demo mode).',
      'invalid_site_origin',
    );
  }
  const analyticsEndpoint = (
    env.SEARCH_CONSOLE_ANALYTICS_ENDPOINT?.trim() || DEFAULT_SEARCH_ANALYTICS_ENDPOINT
  ).replace(/\/+$/, '');
  const inspectionEndpoint =
    env.SEARCH_CONSOLE_INSPECTION_ENDPOINT?.trim() || DEFAULT_SEARCH_INSPECTION_ENDPOINT;
  for (const [name, value] of [
    ['SEARCH_CONSOLE_ANALYTICS_ENDPOINT', analyticsEndpoint],
    ['SEARCH_CONSOLE_INSPECTION_ENDPOINT', inspectionEndpoint],
  ] as const) {
    try {
      const url = new URL(value);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
    } catch {
      throw new SearchConsoleSyncError(`${name} must be an HTTP or HTTPS URL.`, 'invalid_endpoint');
    }
  }
  return { credentials: parsed.data, siteUrl, siteOrigin, analyticsEndpoint, inspectionEndpoint };
}
