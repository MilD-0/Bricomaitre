import { NextResponse } from 'next/server';

import {
  loadStorefrontContentAdmin,
  saveStorefrontAnnouncement,
  storefrontAnnouncementMutationSchema,
} from '@/lib/storefront-content';
import { requireMutationAccess } from '@/lib/rbac';
import { revalidateStorefrontSettings } from '@/lib/storefront-revalidate';

export async function GET() {
  const { response: denied } = await requireMutationAccess('settings');
  if (denied) return denied;
  return NextResponse.json(await loadStorefrontContentAdmin());
}

export async function PUT(request: Request) {
  const { response: denied, session } = await requireMutationAccess('settings');
  if (denied) return denied;
  const parsed = storefrontAnnouncementMutationSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const item = await saveStorefrontAnnouncement(parsed.data, session?.user?.email);
  await revalidateStorefrontSettings();
  return NextResponse.json({ ok: true, item });
}
