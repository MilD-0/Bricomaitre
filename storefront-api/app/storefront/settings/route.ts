import { NextResponse } from 'next/server';

import { getDb, hasDb } from '@bric/db/client';
import { storefrontSettings } from '@bric/db/schema';
import {
  DEFAULT_STOREFRONT_SETTINGS,
  toStorefrontContactSettings,
} from '@bric/storefront-core/settings';
import { applyServerCache, CACHE_TAGS } from '@bric/storefront-core/server-cache';

export async function GET() {
  applyServerCache(
    { stale: 300, revalidate: 3600, expire: 86400 },
    CACHE_TAGS.storefrontSettings,
  );

  if (!hasDb()) {
    return NextResponse.json(toStorefrontContactSettings(DEFAULT_STOREFRONT_SETTINGS));
  }

  const [stored] = await getDb()
    .select({
      contactPhone: storefrontSettings.contactPhone,
      phoneEnabled: storefrontSettings.phoneEnabled,
      aiAssistantEnabled: storefrontSettings.aiAssistantEnabled,
    })
    .from(storefrontSettings)
    .limit(1);

  return NextResponse.json(toStorefrontContactSettings(stored ?? DEFAULT_STOREFRONT_SETTINGS));
}
