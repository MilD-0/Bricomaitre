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

  return storefrontSettingsInputSchema.parse({
    ...DEFAULT_STOREFRONT_SETTINGS,
    ...stored,
    contactEmail: stored?.contactEmail ?? DEFAULT_STOREFRONT_SETTINGS.contactEmail,
    address: stored?.address ?? DEFAULT_STOREFRONT_SETTINGS.address,
    mapUrl: stored?.mapUrl ?? DEFAULT_STOREFRONT_SETTINGS.mapUrl,
    facebookUrl: stored?.facebookUrl ?? DEFAULT_STOREFRONT_SETTINGS.facebookUrl,
    phoneEnabled: true,
  });
}

export function getStorefrontAiModelOptions(env: NodeJS.ProcessEnv = process.env) {
  const configured = [
    ...(env.AI_STOREFRONT_MODEL_OPTIONS ?? '').split(','),
    env.AI_STOREFRONT_MODEL ?? '',
    env.AI_STOREFRONT_FALLBACK_MODEL ?? '',
  ]
    .map((value) => value.trim())
    .filter(Boolean);
  return [...new Set(configured)];
}

export function normalizeStorefrontAiModels(
  settings: StorefrontSettingsInput,
  modelOptions: string[],
): StorefrontSettingsInput {
  if (modelOptions.length === 0) return settings;
  return {
    ...settings,
    aiModel: modelOptions.includes(settings.aiModel) ? settings.aiModel : modelOptions[0]!,
    aiFallbackModel:
      settings.aiFallbackModel && modelOptions.includes(settings.aiFallbackModel)
        ? settings.aiFallbackModel
        : null,
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
      contactEmail: storefrontSettings.contactEmail,
      address: storefrontSettings.address,
      mapUrl: storefrontSettings.mapUrl,
      facebookUrl: storefrontSettings.facebookUrl,
      aiAssistantEnabled: storefrontSettings.aiAssistantEnabled,
      aiModel: storefrontSettings.aiModel,
      aiFallbackModel: storefrontSettings.aiFallbackModel,
    });

  return storefrontSettingsInputSchema.parse(stored);
}
