import { getDb, hasDb } from '@bric/db/client';
import { storefrontSettings } from '@bric/db/schema';
import {
  DEFAULT_STOREFRONT_SETTINGS,
  storefrontSettingsInputSchema,
  type StorefrontSettingsInput,
} from '@bric/storefront-core/settings';

export async function loadStorefrontSettings(): Promise<StorefrontSettingsInput> {
  if (!hasDb()) return DEFAULT_STOREFRONT_SETTINGS;

  const [stored] = await getDb()
    .select({
      contactPhone: storefrontSettings.contactPhone,
      phoneEnabled: storefrontSettings.phoneEnabled,
      aiAssistantEnabled: storefrontSettings.aiAssistantEnabled,
    })
    .from(storefrontSettings)
    .limit(1);

  return {
    ...storefrontSettingsInputSchema.parse(stored ?? DEFAULT_STOREFRONT_SETTINGS),
    phoneEnabled: true,
  };
}

export async function saveStorefrontSettings(input: StorefrontSettingsInput) {
  if (!hasDb()) throw new Error('DATABASE_URL is not configured');

  const values = { ...storefrontSettingsInputSchema.parse(input), phoneEnabled: true };
  const [stored] = await getDb()
    .insert(storefrontSettings)
    .values({ id: 1, ...values, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: storefrontSettings.id,
      set: { ...values, updatedAt: new Date() },
    })
    .returning({
      contactPhone: storefrontSettings.contactPhone,
      phoneEnabled: storefrontSettings.phoneEnabled,
      aiAssistantEnabled: storefrontSettings.aiAssistantEnabled,
    });

  return storefrontSettingsInputSchema.parse(stored);
}
