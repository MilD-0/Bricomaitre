import { landingPageDocumentSchema } from '@bric/storefront-core/landing-pages';
import { parsePositiveIntegerId } from '@bric/runtime/http-input';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import {
  getLandingPageDetail,
  LandingPageConflictError,
  LandingPageNotFoundError,
  saveLandingPage,
  setLandingPageActive,
} from '../../../../lib/landing-pages';
import { requireMutationAccess } from '../../../../lib/rbac';
import {
  buildStorefrontLandingPagePreviewUrl,
  revalidateStorefrontLandingPages,
} from '../../../../lib/storefront-revalidate';

const requestSchema = z.discriminatedUnion('action', [
  z.strictObject({
    action: z.literal('save-active'),
    document: landingPageDocumentSchema,
    active: z.boolean(),
    expectedRevision: z.number().int().positive(),
  }),
  z.strictObject({
    action: z.literal('set-active'),
    active: z.boolean(),
    expectedRevision: z.number().int().positive(),
  }),
]);

function errorResponse(error: unknown) {
  if (error instanceof LandingPageConflictError)
    return NextResponse.json({ error: error.message, code: 'stale_revision' }, { status: 409 });
  if (error instanceof LandingPageNotFoundError)
    return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json(
    { error: error instanceof Error ? error.message : 'Unable to update landing page.' },
    { status: 500 },
  );
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response: denied } = await requireMutationAccess('assets');
  if (denied) return denied;
  const id = parsePositiveIntegerId((await params).id);
  if (id === null) return NextResponse.json({ error: 'Invalid landing-page id.' }, { status: 400 });
  try {
    const detail = await getLandingPageDetail(id);
    if (request.nextUrl.searchParams.get('view') === 'preview') {
      const response = NextResponse.redirect(
        buildStorefrontLandingPagePreviewUrl({
          locale: detail.locale,
          slug: detail.slug,
          revision: detail.currentRevision,
        }),
        307,
      );
      response.headers.set('cache-control', 'private, no-store');
      response.headers.set('referrer-policy', 'no-referrer');
      return response;
    }
    return NextResponse.json(detail);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response: denied, session } = await requireMutationAccess('assets');
  if (denied) return denied;
  const id = parsePositiveIntegerId((await params).id);
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (id === null || !parsed.success)
    return NextResponse.json({ error: 'Invalid landing-page update.' }, { status: 400 });

  try {
    if (parsed.data.action === 'save-active') {
      const result = await saveLandingPage({
        id,
        document: parsed.data.document,
        active: parsed.data.active,
        expectedRevision: parsed.data.expectedRevision,
        actorId: session?.user?.email,
      });
      await revalidateStorefrontLandingPages();
      return NextResponse.json(result);
    }
    const result = await setLandingPageActive({
      id,
      active: parsed.data.active,
      expectedRevision: parsed.data.expectedRevision,
      actorId: session?.user?.email,
    });
    await revalidateStorefrontLandingPages();
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
