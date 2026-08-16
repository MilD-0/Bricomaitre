import { NextRequest, NextResponse } from 'next/server';

import { storefrontSettingsInputSchema } from '@bric/storefront-core/settings';

import { loadStorefrontSettings, saveStorefrontSettings } from '../../../lib/storefront-settings';
import { requireMutationAccess } from '../../../lib/rbac';
import { revalidateStorefrontSettings } from '../../../lib/storefront-revalidate';

export async function GET() {
  const denied = await requireMutationAccess('settings');
  if (denied) return denied;

  return NextResponse.json(await loadStorefrontSettings());
}

export async function PUT(request: NextRequest) {
  const denied = await requireMutationAccess('settings');
  if (denied) return denied;

  const parsed = storefrontSettingsInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const settings = await saveStorefrontSettings({ ...parsed.data, phoneEnabled: true });
    await revalidateStorefrontSettings();
    return NextResponse.json(settings);
  } catch (error) {
    if (error instanceof Error && error.message === 'DATABASE_URL is not configured') {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    throw error;
  }
}
