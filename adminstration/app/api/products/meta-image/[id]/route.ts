import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { eq } from 'drizzle-orm';

import { getDb, hasDb } from '../../../../../db/client';
import { products } from '../../../../../db/schema';
import { captureAdminException, getRequestId, withRequestIdHeaders } from '../../../../../lib/sentry';

function parseProductId(id: string) {
  const numericId = Number(id);
  return Number.isInteger(numericId) && numericId > 0 ? numericId : null;
}

function isSuccessfulResponse(response: Response) {
  return response.ok && response.body !== null;
}

function toResponseBody(buffer: Buffer) {
  return new Uint8Array(buffer);
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = getRequestId(request);

  if (!hasDb()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503, headers: withRequestIdHeaders(requestId) });
  }

  const { id } = await params;
  const productId = parseProductId(id);
  if (!productId) {
    return NextResponse.json({ error: 'Invalid product id' }, { status: 400, headers: withRequestIdHeaders(requestId) });
  }

  const product = await getDb().query.products.findFirst({
    columns: { images: true },
    where: eq(products.id, productId),
  });

  const sourceUrl = product?.images[0];
  if (!sourceUrl) {
    return NextResponse.json({ error: 'Image not found' }, { status: 404, headers: withRequestIdHeaders(requestId) });
  }

  try {
    const upstreamResponse = await fetch(sourceUrl, { cache: 'force-cache' });
    if (!isSuccessfulResponse(upstreamResponse)) {
      return NextResponse.json({ error: 'Unable to fetch product image' }, { status: 502, headers: withRequestIdHeaders(requestId) });
    }

    const inputBuffer = Buffer.from(await upstreamResponse.arrayBuffer());
    const image = sharp(inputBuffer, { animated: false });
    const metadata = await image.metadata();

    if (!metadata.hasAlpha) {
      return new NextResponse(toResponseBody(inputBuffer), {
        status: 200,
        headers: withRequestIdHeaders(requestId, {
          'Content-Type': upstreamResponse.headers.get('content-type') ?? 'application/octet-stream',
          'Cache-Control': 'public, max-age=31536000, immutable',
        }),
      });
    }

    const flattenedBuffer = await image
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 92 })
      .toBuffer();

    return new NextResponse(toResponseBody(flattenedBuffer), {
      status: 200,
      headers: withRequestIdHeaders(requestId, {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=31536000, immutable',
      }),
    });
  } catch (error) {
    captureAdminException(error, {
      requestId,
      operation: 'meta-catalog-image',
      route: '/api/products/meta-image/[id]',
      context: { productId, sourceUrl },
    });
    return NextResponse.json({ error: 'Unable to process product image' }, { status: 502, headers: withRequestIdHeaders(requestId) });
  }
}
