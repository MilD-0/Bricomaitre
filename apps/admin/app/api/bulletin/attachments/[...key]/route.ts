import { NextRequest, NextResponse } from 'next/server';

import { requireBulletinSession } from '../../../../../lib/bulletin-server';
import { isS3ObjectNotFound, readPrivateS3Object } from '../../../../../lib/s3-upload';

function resolveBulletinKey(parts: string[]) {
  const key = parts.map((part) => decodeURIComponent(part)).join('/');
  return key.startsWith('bulletin/') && !key.includes('..') ? key : null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const { response } = await requireBulletinSession();
  if (response) return response;
  const key = resolveBulletinKey((await params).key);
  if (!key) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const object = await readPrivateS3Object(key).catch((error: unknown) => {
    if (isS3ObjectNotFound(error)) return null;
    throw error;
  });
  if (!object) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!object.Body) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const fileName = request.nextUrl.searchParams.get('name') ?? 'attachment';
  const fallbackName = fileName.replace(/[^\x20-\x7e]|["\\]/g, '_');
  const encodedName = encodeURIComponent(fileName).replace(
    /['()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  const contentType = object.ContentType ?? 'application/octet-stream';
  const displayContentType =
    /^text\//i.test(contentType) && !/;\s*charset\s*=/i.test(contentType)
      ? `${contentType}; charset=utf-8`
      : contentType;
  return new Response(object.Body.transformToWebStream(), {
    headers: {
      'content-type': displayContentType,
      'content-disposition': `inline; filename="${fallbackName}"; filename*=UTF-8''${encodedName}`,
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}
