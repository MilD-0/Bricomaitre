import { landingPageDocumentSchema } from '@bric/storefront-core/landing-pages';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { auth } from '../../../../lib/auth';
import { saveLandingPageRevision, setLandingPagePublication } from '../../../../lib/landing-pages';
import { requireMutationAccess } from '../../../../lib/rbac';
import { revalidateStorefrontLandingPages } from '../../../../lib/storefront-revalidate';

const requestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('save'), document: landingPageDocumentSchema }),
  z.object({ action: z.literal('publish') }),
  z.object({ action: z.literal('unpublish') }),
]);

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireMutationAccess('assets');
  if (denied) return denied;
  const id = Number((await params).id);
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!Number.isInteger(id) || id <= 0 || !parsed.success)
    return NextResponse.json({ error: 'Invalid landing-page update.' }, { status: 400 });
  const session = await auth();
  try {
    if (parsed.data.action === 'save')
      return NextResponse.json(
        await saveLandingPageRevision({
          id,
          document: parsed.data.document,
          actorId: session?.user?.email,
        }),
      );
    const result = await setLandingPagePublication({
      id,
      publish: parsed.data.action === 'publish',
      actorId: session?.user?.email,
    });
    await revalidateStorefrontLandingPages();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to update landing page.' },
      { status: 404 },
    );
  }
}
