import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { createDb } from '@bric/db/client';
import {
  searchConsoleDailyTotals,
  searchConsoleSyncRuns,
  searchConsoleUrlInspections,
} from '@bric/db/schema';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { loadSearchAnalytics } from '../lib/analytics-search';
import { syncSearchConsole } from '../lib/search-console';

vi.mock('../lib/analytics-snapshots', () => ({ invalidateAnalyticsSnapshots: vi.fn() }));
const schema = `search_review_${randomUUID().replaceAll('-', '')}`;
const db = createDb({ max: 2, options: `-c search_path=${schema},public` });
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 1024 });
const env = {
  GOOGLE_SEARCH_CONSOLE_CREDENTIALS_JSON: JSON.stringify({
    client_email: 'analytics@example.invalid',
    private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  }),
};
const page = 'https://bricomaitre.com/fr/products/perceuse';
let malformed = false;
const fetchImpl: typeof fetch = async (input, init) => {
  const url = String(input);
  if (url.includes('oauth2.googleapis.com')) return Response.json({ access_token: 'local-token' });
  if (url.endsWith('/sitemaps')) return Response.json({ sitemap: [] });
  if (url.includes('urlInspection'))
    return Response.json({
      inspectionResult: {
        inspectionResultLink:
          'https://search.google.com/search-console/inspect?resource_id=example',
        indexStatusResult: {
          verdict: 'PASS',
          pageFetchState: 'SUCCESSFUL',
          googleCanonical: page,
          userCanonical: page,
        },
      },
    });
  if (malformed) return new Response('invalid provider JSON', { status: 200 });
  const query = JSON.parse(String(init?.body)) as { dimensions: string[] };
  if (query.dimensions[0] === 'searchAppearance') return Response.json({ rows: [] });
  const keys =
    query.dimensions.length === 1
      ? ['2026-08-16']
      : ['2026-08-16', 'perceuse', page, 'dza', 'MOBILE'];
  return Response.json({ rows: [{ keys, clicks: 10, impressions: 100, ctr: 0.1, position: 3 }] });
};

beforeAll(async () => {
  await db.execute(sql.raw(`create schema ${schema}`));
  const tables = await db.$client.query<{ tablename: string }>(
    "select tablename from pg_tables where schemaname = 'public' and tablename like 'search_console_%'",
  );
  for (const { tablename } of tables.rows) {
    await db.execute(
      sql.raw(`create table ${schema}."${tablename}" (like public."${tablename}" including all)`),
    );
  }
});
afterAll(async () => {
  await db.execute(sql.raw(`drop schema ${schema} cascade`));
  await db.$client.end();
});

it('persists actual Google inspection responses and preserves captured data on an unreadable successful response', async () => {
  const result = await syncSearchConsole({
    db,
    env,
    fetchImpl,
    since: '2026-08-16',
    until: '2026-08-16',
  });
  expect(result.inspections).toBe(1);
  expect(await db.select().from(searchConsoleUrlInspections)).toEqual([
    expect.objectContaining({ url: page, verdict: 'PASS' }),
  ]);
  malformed = true;
  await expect(
    syncSearchConsole({ db, env, fetchImpl, since: '2026-08-16', until: '2026-08-16' }),
  ).rejects.toMatchObject({ code: 'invalid_response' });
  expect(await db.select().from(searchConsoleDailyTotals)).toEqual([
    expect.objectContaining({ day: '2026-08-16', clicks: '10.0000' }),
  ]);
  const runs = await db.select().from(searchConsoleSyncRuns);
  expect(runs.map((run) => run.status).sort()).toEqual(['failed', 'succeeded']);
});

it('distinguishes host and locale canonicals and recognizes actual Google fetch failure states', async () => {
  await db.delete(searchConsoleUrlInspections);
  await db.insert(searchConsoleUrlInspections).values(
    [
      {
        url: `${page}-locale`,
        googleCanonical: page.replace('/fr/', '/ar/'),
        userCanonical: page,
        pageFetchState: 'SUCCESSFUL',
      },
      {
        url: `${page}-host`,
        googleCanonical: page.replace('bricomaitre.com', 'other.example'),
        userCanonical: page,
        pageFetchState: 'SUCCESSFUL',
      },
      {
        url: `${page}-failure`,
        googleCanonical: page,
        userCanonical: page,
        pageFetchState: 'SERVER_ERROR',
      },
      {
        url: `${page}-equivalent`,
        googleCanonical: page.replace('bricomaitre.com', 'BRICOMAITRE.COM:443'),
        userCanonical: page,
        pageFetchState: 'SUCCESSFUL',
      },
      {
        url: `${page}-unknown`,
        googleCanonical: null,
        userCanonical: null,
        pageFetchState: 'PAGE_FETCH_STATE_UNSPECIFIED',
      },
    ].map((row) => ({
      ...row,
      siteUrl: 'sc-domain:bricomaitre.com',
      verdict: 'NEUTRAL',
      inspectedAt: new Date(),
    })),
  );
  const data = await loadSearchAnalytics(db, {
    startDate: '2026-08-16',
    endDate: '2026-08-16',
    comparisonStartDate: null,
    comparisonEndDate: null,
    resolvedGrain: 'day',
  });
  expect(data.indexHealth.issues.map((row) => row.url).sort()).toEqual([
    `${page}-failure`,
    `${page}-host`,
    `${page}-locale`,
  ]);
});
