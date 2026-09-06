import { generateKeyPairSync } from 'node:crypto';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  fetchSearchConsoleSnapshot,
  readSearchConsoleConfig,
  SearchConsoleSyncError,
} from './search-console';

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 1024 });
const credentials = {
  client_email: 'analytics@bricomaitre.test',
  private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  token_uri: 'https://oauth2.googleapis.com/token',
};

describe('Search Console ingestion', () => {
  it('accepts a server-only base64 service-account credential and validates site configuration', () => {
    const config = readSearchConsoleConfig({
      GOOGLE_SEARCH_CONSOLE_CREDENTIALS_BASE64: Buffer.from(JSON.stringify(credentials)).toString(
        'base64',
      ),
      SEARCH_CONSOLE_SITE_URL: 'sc-domain:bricomaitre.com',
      SEARCH_CONSOLE_SITE_ORIGIN: 'https://bricomaitre.com/',
    });
    expect(config.siteUrl).toBe('sc-domain:bricomaitre.com');
    expect(config.siteOrigin).toBe('https://bricomaitre.com');
    expect(() => readSearchConsoleConfig({})).toThrowError(SearchConsoleSyncError);
  });

  it('accepts explicit internal API endpoints for isolated deployments', () => {
    const config = readSearchConsoleConfig({
      GOOGLE_SEARCH_CONSOLE_CREDENTIALS_JSON: JSON.stringify(credentials),
      SEARCH_CONSOLE_ANALYTICS_ENDPOINT: 'http://mock-services:8080/google/webmasters/v3/sites/',
      SEARCH_CONSOLE_INSPECTION_ENDPOINT:
        'http://mock-services:8080/google/urlInspection/index:inspect',
    });

    expect(config.analyticsEndpoint).toBe('http://mock-services:8080/google/webmasters/v3/sites');
    expect(config.inspectionEndpoint).toBe(
      'http://mock-services:8080/google/urlInspection/index:inspect',
    );
    expect(() =>
      readSearchConsoleConfig({
        GOOGLE_SEARCH_CONSOLE_CREDENTIALS_JSON: JSON.stringify(credentials),
        SEARCH_CONSOLE_ANALYTICS_ENDPOINT: 'file:///tmp/search-console',
      }),
    ).toThrowError(SearchConsoleSyncError);
  });

  it('permits configured loopback pages only in explicit demo mode', () => {
    const env = { GOOGLE_SEARCH_CONSOLE_CREDENTIALS_JSON: JSON.stringify(credentials) };
    expect(
      readSearchConsoleConfig({
        ...env,
        BRIC_DEMO_MODE: 'true',
        SEARCH_CONSOLE_SITE_ORIGIN: 'http://127.0.0.1:4402',
      }).siteOrigin,
    ).toBe('http://127.0.0.1:4402');
    for (const origin of [
      'http://127.0.0.1:4402',
      'https://shop.example/path',
      'https://user:password@shop.example',
    ]) {
      expect(() =>
        readSearchConsoleConfig({ ...env, SEARCH_CONSOLE_SITE_ORIGIN: origin }),
      ).toThrowError(SearchConsoleSyncError);
    }
    expect(() =>
      readSearchConsoleConfig({
        ...env,
        BRIC_DEMO_MODE: 'true',
        SEARCH_CONSOLE_SITE_ORIGIN: 'http://shop.example',
      }),
    ).toThrowError(SearchConsoleSyncError);
  });

  it.each([true, false])(
    'loads exact totals and carries requested URL independently of inspection success=%s',
    async (inspectionSucceeds) => {
      const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
        const url = String(input);
        if (url.includes('oauth2.googleapis.com')) {
          return new Response(JSON.stringify({ access_token: 'search-token' }), { status: 200 });
        }
        expect(new Headers(init?.headers).get('authorization')).toBe('Bearer search-token');
        if (url.endsWith('/sitemaps')) {
          return new Response(
            JSON.stringify({
              sitemap: [
                {
                  path: 'https://bricomaitre.com/sitemap.xml',
                  warnings: '0',
                  errors: '0',
                  contents: [{ type: 'web', submitted: '3521' }],
                },
              ],
            }),
            { status: 200 },
          );
        }
        if (url.includes('urlInspection')) {
          if (inspectionSucceeds)
            return new Response(
              JSON.stringify({
                inspectionResult: {
                  inspectionResultLink:
                    'https://search.google.com/search-console/inspect?resource_id=example',
                  indexStatusResult: { verdict: 'PASS', pageFetchState: 'SUCCESSFUL' },
                },
              }),
            );
          return new Response(
            JSON.stringify({ error: { message: 'quota', status: 'RESOURCE_EXHAUSTED' } }),
            {
              status: 429,
            },
          );
        }
        const body = JSON.parse(String(init?.body)) as {
          dimensions: string[];
          dimensionFilterGroups?: unknown[];
        };
        if (body.dimensions.join(',') === 'date') {
          if (body.dimensionFilterGroups) {
            return new Response(
              JSON.stringify({
                rows: [{ keys: ['2026-08-16'], clicks: 2, impressions: 20, ctr: 0.1, position: 3 }],
              }),
              { status: 200 },
            );
          }
          return new Response(
            JSON.stringify({
              rows: [{ keys: ['2026-08-16'], clicks: 10, impressions: 100, ctr: 0.1, position: 8 }],
            }),
            { status: 200 },
          );
        }
        if (body.dimensions.join(',') === 'searchAppearance') {
          return new Response(
            JSON.stringify({
              rows: [
                { keys: ['PRODUCT_SNIPPETS'], clicks: 2, impressions: 20, ctr: 0.1, position: 3 },
              ],
            }),
            { status: 200 },
          );
        }
        return new Response(
          JSON.stringify({
            rows: [
              {
                keys: [
                  '2026-08-16',
                  'perceuse',
                  'https://bricomaitre.com/fr/products/perceuse',
                  'dza',
                  'MOBILE',
                ],
                clicks: 8,
                impressions: 90,
                ctr: 0.088,
                position: 8,
              },
            ],
          }),
          { status: 200 },
        );
      });

      const result = await fetchSearchConsoleSnapshot({
        since: '2026-08-16',
        until: '2026-08-16',
        env: { GOOGLE_SEARCH_CONSOLE_CREDENTIALS_JSON: JSON.stringify(credentials) },
        fetchImpl: fetchMock,
        now: new Date('2026-08-20T00:00:00.000Z'),
        inspectionLimit: 1,
      });

      expect(result.totals).toHaveLength(1);
      expect(result.details).toHaveLength(1);
      expect(result.appearances).toHaveLength(1);
      expect(result.sitemaps[0]?.contents?.[0]?.submitted).toBe('3521');
      expect(result.inspections).toEqual(
        inspectionSucceeds
          ? [
              expect.objectContaining({
                url: 'https://bricomaitre.com/fr/products/perceuse',
                indexStatusResult: { verdict: 'PASS', pageFetchState: 'SUCCESSFUL' },
              }),
            ]
          : [],
      );
    },
  );
});

afterEach(() => vi.useRealTimers());

it.each(['authentication', 'analytics'])(
  'rejects unreadable successful %s responses instead of treating them as empty data',
  async (stage) => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      if (stage === 'analytics' && String(input).includes('oauth2.googleapis.com')) {
        return new Response(JSON.stringify({ access_token: 'token' }));
      }
      return new Response('upstream proxy error', { status: 200 });
    });
    const result = expect(
      fetchSearchConsoleSnapshot({
        since: '2026-08-16',
        until: '2026-08-16',
        env: { GOOGLE_SEARCH_CONSOLE_CREDENTIALS_JSON: JSON.stringify(credentials) },
        fetchImpl,
      }),
    ).rejects.toMatchObject({ code: 'invalid_response' });
    await vi.runAllTimersAsync();
    await result;
  },
);

it('bounds a stalled OAuth request and aborts every attempt', async () => {
  vi.useFakeTimers();
  const signals: AbortSignal[] = [];
  const fetchImpl = vi.fn<typeof fetch>(
    (_input, init) =>
      new Promise((_resolve, reject) => {
        const signal = init!.signal!;
        signals.push(signal);
        signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      }),
  );
  const result = expect(
    fetchSearchConsoleSnapshot({
      since: '2026-08-16',
      until: '2026-08-16',
      env: { GOOGLE_SEARCH_CONSOLE_CREDENTIALS_JSON: JSON.stringify(credentials) },
      fetchImpl,
    }),
  ).rejects.toMatchObject({ code: 'request_timeout' });
  await vi.runAllTimersAsync();
  await result;
  expect(signals).toHaveLength(3);
  expect(signals.every((signal) => signal.aborted)).toBe(true);
});
