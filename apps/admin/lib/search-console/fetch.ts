import { z } from 'zod';
import { reportingDateSchema } from '../analytics/contract';
import {
  readSearchConsoleConfig,
  SearchConsoleSyncError,
  type SearchConsoleEnvironment,
} from './config';
import {
  analyticsResponseSchema,
  analyticsRowSchema,
  DETAIL_PAGE_SIZE,
  inspectionResponseSchema,
  MAX_DETAIL_ROWS,
  sitemapResponseSchema,
  type FetchLike,
} from './contract';
import { accessToken, googleRequest } from './transport';

type AnalyticsQuery = {
  startDate: string;
  endDate: string;
  dimensions?: string[];
  rowLimit?: number;
  startRow?: number;
  dimensionFilterGroups?: Array<{
    filters: Array<{ dimension: string; operator: string; expression: string }>;
  }>;
};

async function queryAnalytics(
  config: ReturnType<typeof readSearchConsoleConfig>,
  token: string,
  fetchImpl: FetchLike,
  input: AnalyticsQuery,
) {
  const url = `${config.analyticsEndpoint}/${encodeURIComponent(config.siteUrl)}/searchAnalytics/query`;
  const body = await googleRequest(
    url,
    {
      method: 'POST',
      body: JSON.stringify({
        ...input,
        type: 'web',
        dataState: 'final',
        rowLimit: input.rowLimit ?? DETAIL_PAGE_SIZE,
      }),
    },
    token,
    fetchImpl,
  );
  const rows = analyticsResponseSchema.parse(body).rows ?? [];
  const dateIndex = input.dimensions?.indexOf('date') ?? -1;
  if (
    dateIndex >= 0 &&
    rows.some((row) => !reportingDateSchema.safeParse(row.keys[dateIndex]).success)
  ) {
    throw new SearchConsoleSyncError(
      'Search Console returned an invalid calendar day.',
      'invalid_response',
    );
  }
  return rows;
}

export function numericString(value: number) {
  return Number.isFinite(value) ? String(value) : '0';
}

function canonicalInspectionUrl(value: string, origin: string) {
  try {
    const url = new URL(value, origin);
    if (url.origin !== origin) return null;
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

export async function fetchSearchConsoleSnapshot(input: {
  since: string;
  until: string;
  env?: SearchConsoleEnvironment;
  fetchImpl?: FetchLike;
  now?: Date;
  inspectionLimit?: number;
}) {
  if (
    !reportingDateSchema.safeParse(input.since).success ||
    !reportingDateSchema.safeParse(input.until).success ||
    input.since > input.until
  ) {
    throw new SearchConsoleSyncError('Search Console date range is invalid.', 'invalid_range');
  }
  const config = readSearchConsoleConfig(input.env ?? process.env);
  const fetchImpl = input.fetchImpl ?? fetch;
  const now = input.now ?? new Date();
  const token = await accessToken(config, fetchImpl, now);

  const [totalRows, appearanceTypes] = await Promise.all([
    queryAnalytics(config, token, fetchImpl, {
      startDate: input.since,
      endDate: input.until,
      dimensions: ['date'],
    }),
    queryAnalytics(config, token, fetchImpl, {
      startDate: input.since,
      endDate: input.until,
      dimensions: ['searchAppearance'],
    }),
  ]);

  const detailRows: z.infer<typeof analyticsRowSchema>[] = [];
  for (let startRow = 0; startRow < MAX_DETAIL_ROWS; startRow += DETAIL_PAGE_SIZE) {
    const rows = await queryAnalytics(config, token, fetchImpl, {
      startDate: input.since,
      endDate: input.until,
      dimensions: ['date', 'query', 'page', 'country', 'device'],
      rowLimit: DETAIL_PAGE_SIZE,
      startRow,
    });
    detailRows.push(...rows);
    if (rows.length < DETAIL_PAGE_SIZE) break;
  }

  const appearanceRows = (
    await Promise.all(
      appearanceTypes.map(async (appearance) => {
        const name = appearance.keys[0];
        if (!name) return [];
        const rows = await queryAnalytics(config, token, fetchImpl, {
          startDate: input.since,
          endDate: input.until,
          dimensions: ['date'],
          dimensionFilterGroups: [
            {
              filters: [{ dimension: 'searchAppearance', operator: 'equals', expression: name }],
            },
          ],
        });
        return rows.map((row) => ({ ...row, appearance: name }));
      }),
    )
  ).flat();

  const sitemapsUrl = `${config.analyticsEndpoint}/${encodeURIComponent(config.siteUrl)}/sitemaps`;
  const sitemapBody = await googleRequest(sitemapsUrl, { method: 'GET' }, token, fetchImpl);
  const sitemaps = sitemapResponseSchema.parse(sitemapBody).sitemap ?? [];

  const inspectionUrls = Array.from(
    new Set(
      detailRows
        .slice()
        .sort((left, right) => right.impressions - left.impressions)
        .flatMap((row) => {
          const url = canonicalInspectionUrl(row.keys[2] ?? '', config.siteOrigin);
          return url ? [url] : [];
        }),
    ),
  ).slice(0, Math.max(0, input.inspectionLimit ?? 20));

  const inspections = (
    await Promise.all(
      inspectionUrls.map(async (url) => {
        try {
          const body = await googleRequest(
            config.inspectionEndpoint,
            {
              method: 'POST',
              body: JSON.stringify({
                inspectionUrl: url,
                siteUrl: config.siteUrl,
                languageCode: 'en-US',
              }),
            },
            token,
            fetchImpl,
          );
          const parsed = inspectionResponseSchema.safeParse(body);
          if (!parsed.success) return null;
          return { ...parsed.data.inspectionResult, url };
        } catch (error) {
          if (!(error instanceof SearchConsoleSyncError)) throw error;
          return null;
        }
      }),
    )
  ).filter(
    (
      inspection,
    ): inspection is z.infer<typeof inspectionResponseSchema>['inspectionResult'] & {
      url: string;
    } => inspection != null,
  );

  return {
    config: { siteUrl: config.siteUrl, siteOrigin: config.siteOrigin },
    since: input.since,
    until: input.until,
    fetchedAt: now,
    totals: totalRows,
    details: detailRows,
    appearances: appearanceRows,
    sitemaps,
    inspections,
  };
}
