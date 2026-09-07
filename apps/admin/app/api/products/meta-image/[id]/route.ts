import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { eq } from 'drizzle-orm';

import { getDb, hasDb } from '@bric/db/client';
import { products } from '@bric/db/schema';
import { parsePositiveIntegerId } from '@bric/runtime/http-input';
import { isSafeRemoteHttpsUrl } from '@/lib/remote-url-safety';
import { captureAdminException, getRequestId, withRequestIdHeaders } from '@/lib/sentry';

const MAX_SOURCE_BYTES = 10 * 1024 * 1024;

function isSuccessfulResponse(response: Response) {
  return response.ok && response.body !== null;
}

function toResponseBody(buffer: Buffer) {
  return new Uint8Array(buffer);
}

async function readBoundedBody(response: Response) {
  const declaredSize = Number(response.headers.get('content-length') ?? 0);
  if (declaredSize > MAX_SOURCE_BYTES)
    throw new Error('Product image exceeds the source size limit.');
  if (!response.body) throw new Error('Product image response has no body.');

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_SOURCE_BYTES) {
      await reader.cancel();
      throw new Error('Product image exceeds the source size limit.');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks, size);
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = getRequestId(request);

  if (!hasDb()) {
    return NextResponse.json(
      { error: 'DATABASE_URL is not configured' },
      { status: 503, headers: withRequestIdHeaders(requestId) },
    );
  }

  const { id } = await params;
  const productId = parsePositiveIntegerId(id);
  if (!productId) {
    return NextResponse.json(
      { error: 'Invalid product id' },
      { status: 400, headers: withRequestIdHeaders(requestId) },
    );
  }

  const product = await getDb().query.products.findFirst({
    columns: { images: true },
    where: eq(products.id, productId),
  });

  const sourceUrl = product?.images[0];
  if (!sourceUrl) {
    return NextResponse.json(
      { error: 'Image not found' },
      { status: 404, headers: withRequestIdHeaders(requestId) },
    );
  }
  if (!(await isSafeRemoteHttpsUrl(sourceUrl))) {
    return NextResponse.json(
      { error: 'Image source is not allowed' },
      { status: 400, headers: withRequestIdHeaders(requestId) },
    );
  }

  try {
    const upstreamResponse = await fetch(sourceUrl, {
      cache: 'force-cache',
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    });
    if (!isSuccessfulResponse(upstreamResponse)) {
      return NextResponse.json(
        { error: 'Unable to fetch product image' },
        { status: 502, headers: withRequestIdHeaders(requestId) },
      );
    }
    if (!upstreamResponse.headers.get('content-type')?.toLowerCase().startsWith('image/')) {
      return NextResponse.json(
        { error: 'Upstream response is not an image' },
        { status: 502, headers: withRequestIdHeaders(requestId) },
      );
    }

    const inputBuffer = await readBoundedBody(upstreamResponse);
    const image = sharp(inputBuffer, { animated: false, limitInputPixels: 40_000_000 });
    const metadata = await image.metadata();

    if (!metadata.hasAlpha) {
      return new NextResponse(toResponseBody(inputBuffer), {
        status: 200,
        headers: withRequestIdHeaders(requestId, {
          'Content-Type':
            upstreamResponse.headers.get('content-type') ?? 'application/octet-stream',
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
    return NextResponse.json(
      { error: 'Unable to process product image' },
      { status: 502, headers: withRequestIdHeaders(requestId) },
    );
  }
}
