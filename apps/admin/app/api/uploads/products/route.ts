import { NextRequest, NextResponse } from 'next/server';

import { uploadImages } from '../../../../lib/image-uploads';
import { requireMutationAccess } from '../../../../lib/rbac';
import { captureAdminException, getRequestId, withRequestIdHeaders } from '../../../../lib/sentry';

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);
  const { response: denied } = await requireMutationAccess('products');
  if (denied) {
    return denied;
  }

  try {
    const result = await uploadImages(req, 'products');
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status, headers: withRequestIdHeaders(requestId) },
      );
    }

    return NextResponse.json({ urls: result.urls }, { headers: withRequestIdHeaders(requestId) });
  } catch (error) {
    captureAdminException(error, {
      requestId,
      operation: 'products-upload',
      route: '/api/uploads/products',
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload failed' },
      { status: 500, headers: withRequestIdHeaders(requestId) },
    );
  }
}
