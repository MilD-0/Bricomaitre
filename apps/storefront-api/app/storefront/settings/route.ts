import { NextResponse } from 'next/server';

import { getDb, hasDb } from '@bric/db/client';
import { storefrontSettings } from '@bric/db/schema';
import {
  DEFAULT_STOREFRONT_SETTINGS,
  toStorefrontContactSettings,
} from '@bric/storefront-core/settings';
import { CACHE_TAGS, createServerCache } from '@bric/storefront-core/server-cache';

const loadSettings = createServerCache({
  keyParts: ['storefront-settings'],
  revalidate: 3600,
  tags: [CACHE_TAGS.storefrontSettings],
  load: async () => {
    const [stored] = await getDb()
      .select({
        contactPhone: storefrontSettings.contactPhone,
        phoneEnabled: storefrontSettings.phoneEnabled,
        aiAssistantEnabled: storefrontSettings.aiAssistantEnabled,
      })
      .from(storefrontSettings)
      .limit(1);
    return toStorefrontContactSettings(stored ?? DEFAULT_STOREFRONT_SETTINGS);
  },
});

export async function GET() {
  if (!hasDb()) {
    return NextResponse.json(toStorefrontContactSettings(DEFAULT_STOREFRONT_SETTINGS));
  }

  return NextResponse.json(await loadSettings());
}
