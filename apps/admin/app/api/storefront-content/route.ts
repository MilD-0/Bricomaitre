import { NextResponse } from 'next/server';

import { auth } from '../../../lib/auth';
import {
  loadStorefrontContentAdmin,
  saveStorefrontAnnouncement,
  storefrontAnnouncementMutationSchema,
} from '../../../lib/storefront-content';
import { requireMutationAccess } from '../../../lib/rbac';
import { revalidateStorefrontSettings } from '../../../lib/storefront-revalidate';

export async function GET() {
  const denied = await requireMutationAccess('settings');
  if (denied) return denied;
  return NextResponse.json(await loadStorefrontContentAdmin());
}

export async function PUT(request: Request) {
  const denied = await requireMutationAccess('settings');
  if (denied) return denied;
  const parsed = storefrontAnnouncementMutationSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const session = await auth();
  try {
    const item = await saveStorefrontAnnouncement(parsed.data, session?.user?.email);
    await revalidateStorefrontSettings();
    return NextResponse.json({ ok: true, item });
  } catch (error) {
    if (error instanceof Error && error.message.includes('announcement messages')) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
