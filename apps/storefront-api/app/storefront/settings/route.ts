import { unstable_cache } from 'next/cache';
import { NextResponse } from 'next/server';

import { getDb, hasDb } from '@bric/db/client';
import { storefrontSettings } from '@bric/db/schema';
import {
  DEFAULT_STOREFRONT_SETTINGS,
  storefrontSettingsInputSchema,
  toStorefrontContactSettings,
} from '@bric/storefront-core/settings';
import { CACHE_TAGS } from '@bric/storefront-core/server-cache';

const loadSettings = unstable_cache(
  async () => {
    const [stored] = await getDb()
      .select({
        contactPhone: storefrontSettings.contactPhone,
        phoneEnabled: storefrontSettings.phoneEnabled,
        contactEmail: storefrontSettings.contactEmail,
        address: storefrontSettings.address,
        mapUrl: storefrontSettings.mapUrl,
        facebookUrl: storefrontSettings.facebookUrl,
        aiAssistantEnabled: storefrontSettings.aiAssistantEnabled,
        aiModel: storefrontSettings.aiModel,
        aiFallbackModel: storefrontSettings.aiFallbackModel,
      })
      .from(storefrontSettings)
      .limit(1);
    return toStorefrontContactSettings(
      storefrontSettingsInputSchema.parse(stored ?? DEFAULT_STOREFRONT_SETTINGS),
    );
  },
  ['storefront-settings'],
  { revalidate: 3600, tags: [CACHE_TAGS.storefrontSettings] },
);

export async function GET() {
  if (!hasDb()) {
    return NextResponse.json({ error: 'Storefront database is unavailable.' }, { status: 503 });
  }

  return NextResponse.json(await loadSettings());
}
