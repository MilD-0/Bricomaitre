import { getDb } from '@bric/db/client';
import { products } from '@bric/db/schema';
import { parsePositiveIntegerId } from '@bric/runtime/http-input';
import { eq } from 'drizzle-orm';
import { unstable_cache } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { requireMutationAccess } from '../../../../../lib/rbac';
import { isSafeRemoteHttpsUrl } from '../../../../../lib/remote-url-safety';
import { buildCloudfrontUrl, readPrivateS3Object } from '../../../../../lib/s3-upload';

const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
let activeThumbnails = 0;
const waitingThumbnails: Array<() => void> = [];

async function withThumbnailSlot<T>(work: () => Promise<T>): Promise<T> {
  if (activeThumbnails >= 2) await new Promise<void>((resolve) => waitingThumbnails.push(resolve));
  else activeThumbnails += 1;
  try {
    return await work();
  } finally {
    const next = waitingThumbnails.shift();
    if (next) next();
    else activeThumbnails -= 1;
  }
}

async function readImage(response: Response) {
  if (!response.ok || !response.body) throw new Error('Image unavailable');
  if (Number(response.headers.get('content-length') ?? 0) > MAX_SOURCE_BYTES)
    throw new Error('Image too large');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_SOURCE_BYTES) throw new Error('Image too large');
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  return Buffer.concat(chunks, size);
}

const thumbnail = unstable_cache(
  async (source: string, mediaOrigin: string) =>
    withThumbnailSlot(async () => {
      const url = new URL(source);
      const media = mediaOrigin ? new URL(buildCloudfrontUrl(mediaOrigin, '')) : null;
      let response: Response;
      if (media && url.origin === media.origin && url.pathname.startsWith(media.pathname)) {
        // The source comes from the product record, never an arbitrary requested URL.
        const key = decodeURIComponent(url.pathname.slice(media.pathname.length));
        if (!key || key.split('/').some((part) => part === '..'))
          throw new Error('Invalid image key');
        const object = await readPrivateS3Object(key, { abortSignal: AbortSignal.timeout(10_000) });
        if (!object.Body || (object.ContentLength ?? 0) > MAX_SOURCE_BYTES)
          throw new Error('Image unavailable');
        response = new Response(object.Body.transformToWebStream());
      } else {
        if (!(await isSafeRemoteHttpsUrl(source))) throw new Error('Image source is not allowed');
        response = await fetch(source, { redirect: 'error', signal: AbortSignal.timeout(10_000) });
      }
      const bytes = await readImage(response);
      const output = await sharp(bytes, { animated: false, limitInputPixels: 40_000_000 })
        .rotate()
        .resize(120, 120, { fit: 'inside', withoutEnlargement: true })
        .flatten({ background: '#ffffff' })
        .jpeg({ quality: 80 })
        .toBuffer();
      return output.toString('base64');
    }),
  ['shopping-list-thumbnail-v1'],
  { revalidate: 3600 },
);

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response: denied } = await requireMutationAccess('orders');
  if (denied) return denied;
  const id = parsePositiveIntegerId((await params).id);
  if (id === null) return NextResponse.json({ error: 'Invalid product id' }, { status: 400 });
  const product = await getDb().query.products.findFirst({
    columns: { images: true },
    where: eq(products.id, id),
  });
  const source = product?.images[0];
  if (!source) return NextResponse.json({ error: 'Image not found' }, { status: 404 });
  try {
    const image = await thumbnail(source, process.env.AWS_CLOUDFRONT_DOMAIN ?? '');
    return new Response(Buffer.from(image, 'base64'), {
      headers: { 'content-type': 'image/jpeg', 'cache-control': 'private, max-age=3600' },
    });
  } catch {
    // The printed product name and quantities remain available without a photo.
    return new NextResponse(null, {
      status: 404,
      headers: { 'cache-control': 'private, max-age=60' },
    });
  }
}
