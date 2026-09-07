import { json, noContent, readJson } from './mock-http.mjs';
import { storefrontOrigin } from './mock-state.mjs';

export async function handleGoogle(request, response, url) {
  if (url.pathname === '/google/oauth2/token') {
    return json(response, 200, {
      access_token: 'demo-google-access-token',
      token_type: 'Bearer',
      expires_in: 3600,
    });
  }
  if (url.pathname === '/google/mp/collect') {
    await readJson(request);
    return noContent(response);
  }
  if (url.pathname.endsWith('/searchAnalytics/query')) {
    const body = await readJson(request);
    const dimensions = body.dimensions ?? [];
    const day = body.endDate ?? new Date().toISOString().slice(0, 10);
    const values = {
      date: day,
      query: 'perceuse sans fil',
      page: `${storefrontOrigin}/fr/products`,
      country: 'dza',
      device: 'MOBILE',
      searchAppearance: 'MERCHANT_LISTINGS',
    };
    return json(response, 200, {
      rows: [
        {
          keys: dimensions.map((key) => values[key] ?? 'demo'),
          clicks: 42,
          impressions: 860,
          ctr: 0.0488,
          position: 6.4,
        },
      ],
    });
  }
  if (url.pathname.endsWith('/sitemaps')) {
    return json(response, 200, {
      sitemap: [
        {
          path: `${storefrontOrigin}/sitemap.xml`,
          type: 'sitemap',
          isPending: false,
          warnings: 0,
          errors: 0,
          contents: [{ type: 'web', submitted: 12, indexed: 12 }],
        },
      ],
    });
  }
  if (url.pathname === '/google/urlInspection/index:inspect') {
    const body = await readJson(request);
    return json(response, 200, {
      inspectionResult: {
        indexStatusResult: {
          verdict: 'PASS',
          coverageState: 'Submitted and indexed',
          robotsTxtState: 'ALLOWED',
          indexingState: 'INDEXING_ALLOWED',
          pageFetchState: 'SUCCESSFUL',
          googleCanonical: body.inspectionUrl,
          userCanonical: body.inspectionUrl,
          lastCrawlTime: new Date().toISOString(),
          crawledAs: 'MOBILE',
        },
        richResultsResult: {},
      },
    });
  }
  return json(response, 404, { error: { message: 'Unknown demo Google route.' } });
}
