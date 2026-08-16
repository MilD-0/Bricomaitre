import { NextResponse } from 'next/server';

import { readCatalogFeed } from '../../../../lib/catalog-feed';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const feed = await readCatalogFeed();

    return new NextResponse(feed.body, {
      status: 200,
      headers: {
        'content-type': feed.contentType,
        'cache-control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=600',
        'content-disposition': 'inline; filename="meta-catalog-feed.csv"',
        ...(feed.lastModified ? { 'last-modified': feed.lastModified.toUTCString() } : {}),
        ...(feed.etag ? { etag: feed.etag } : {}),
      },
    });
  } catch (error) {
    console.error('[storefront-api] catalog feed fetch failed', error);
    return NextResponse.json({ error: 'Catalog feed is unavailable' }, { status: 503 });
  }
}
