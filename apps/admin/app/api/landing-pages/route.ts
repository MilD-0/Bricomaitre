import { landingPageCreateSchema } from '@bric/storefront-core/landing-pages';
import { NextRequest, NextResponse } from 'next/server';

import {
  createLandingPage,
  listLandingPages,
  listLandingPageSummaries,
} from '../../../lib/landing-pages';
import { requireMutationAccess } from '../../../lib/rbac';

export async function GET(request: NextRequest) {
  const { response: denied } = await requireMutationAccess('assets');
  if (denied) return denied;
  const summariesOnly = request.nextUrl.searchParams.get('view') === 'index';
  return NextResponse.json({
    items: summariesOnly ? await listLandingPageSummaries() : await listLandingPages(),
  });
}

export async function POST(request: NextRequest) {
  const { response: denied, session } = await requireMutationAccess('assets');
  if (denied) return denied;
  const parsed = landingPageCreateSchema
    .extend({ document: landingPageCreateSchema.shape.document.optional() })
    .strict()
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    return NextResponse.json(
      await createLandingPage({ ...parsed.data, actorId: session?.user?.email }),
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to create landing page.' },
      { status: 409 },
    );
  }
}
