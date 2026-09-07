import { getDb } from '@bric/db/client';
import { z } from 'zod';

export type Database = ReturnType<typeof getDb>;

export type FetchLike = typeof fetch;

export const DEFAULT_SEARCH_ANALYTICS_ENDPOINT = 'https://www.googleapis.com/webmasters/v3/sites';

export const DEFAULT_SEARCH_INSPECTION_ENDPOINT =
  'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect';

export const SEARCH_CONSOLE_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';

export const DETAIL_PAGE_SIZE = 25_000;

export const MAX_DETAIL_ROWS = 50_000;

export const DEFAULT_SITE_URL = 'sc-domain:bricomaitre.com';

export const DEFAULT_SITE_ORIGIN = 'https://bricomaitre.com';

export const credentialsSchema = z.object({
  client_email: z.string().email(),
  private_key: z.string().min(1),
  token_uri: z.string().url().default('https://oauth2.googleapis.com/token'),
});

export const analyticsRowSchema = z.object({
  keys: z.array(z.string()).default([]),
  clicks: z.number().default(0),
  impressions: z.number().default(0),
  ctr: z.number().default(0),
  position: z.number().optional(),
});

export const analyticsResponseSchema = z
  .object({ rows: z.array(analyticsRowSchema).optional() })
  .passthrough();

export const sitemapResponseSchema = z
  .object({
    sitemap: z
      .array(
        z
          .object({
            path: z.string(),
            lastSubmitted: z.string().optional(),
            isPending: z.boolean().optional(),
            isSitemapsIndex: z.boolean().optional(),
            type: z.string().optional(),
            lastDownloaded: z.string().optional(),
            warnings: z.union([z.string(), z.number()]).optional(),
            errors: z.union([z.string(), z.number()]).optional(),
            contents: z
              .array(
                z
                  .object({
                    type: z.string().optional(),
                    submitted: z.union([z.string(), z.number()]).optional(),
                    indexed: z.union([z.string(), z.number()]).optional(),
                  })
                  .passthrough(),
              )
              .optional(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();

export const inspectionResponseSchema = z
  .object({
    inspectionResult: z
      .object({
        indexStatusResult: z
          .object({
            verdict: z.string().optional(),
            coverageState: z.string().optional(),
            robotsTxtState: z.string().optional(),
            indexingState: z.string().optional(),
            lastCrawlTime: z.string().optional(),
            pageFetchState: z.string().optional(),
            googleCanonical: z.string().optional(),
            userCanonical: z.string().optional(),
            referringUrls: z.array(z.string()).optional(),
            sitemap: z.array(z.string()).optional(),
            crawledAs: z.string().optional(),
          })
          .passthrough()
          .optional(),
        richResultsResult: z.record(z.string(), z.unknown()).optional(),
      })
      .passthrough(),
  })
  .passthrough();
