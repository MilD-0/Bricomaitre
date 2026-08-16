import { NextRequest, NextResponse } from 'next/server';

import { auth } from '../../../../lib/auth';
import { uploadImages } from '../../../../lib/image-uploads';
import { requireMutationAccess } from '../../../../lib/rbac';
import { captureAdminException, getRequestId, withRequestIdHeaders } from '../../../../lib/sentry';

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);
  const denied = await requireMutationAccess('brandsCategories');
  if (denied) {
    return denied;
  }
  const session = await auth();

  try {
    const result = await uploadImages(req, 'brands');
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
      operation: 'brands-upload',
      route: '/api/uploads/brands',
      session,
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload failed' },
      { status: 500, headers: withRequestIdHeaders(requestId) },
    );
  }
}
