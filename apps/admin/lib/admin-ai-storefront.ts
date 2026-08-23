import { storefrontSettingsInputSchema } from '@bric/storefront-core/settings';
import { z } from 'zod';

import {
  loadStorefrontContentAdmin,
  saveStorefrontAnnouncement,
  storefrontAnnouncementMutationSchema,
} from './storefront-content';
import { revalidateStorefrontSettings } from './storefront-revalidate';
import {
  getStorefrontAiModelOptions,
  loadStorefrontSettings,
  saveStorefrontSettings,
} from './storefront-settings';

export const storefrontSettingsPatchSchema = storefrontSettingsInputSchema
  .partial()
  .refine((changes) => Object.keys(changes).length > 0, 'At least one setting is required.');

export { storefrontAnnouncementMutationSchema };

export async function inspectAdminStorefrontConfiguration() {
  const [settings, announcement] = await Promise.all([
    loadStorefrontSettings(),
    loadStorefrontContentAdmin(),
  ]);
  return {
    settings,
    announcement,
    configuredAiModels: getStorefrontAiModelOptions(),
  };
}

export async function updateAdminStorefrontSettings(
  input: z.input<typeof storefrontSettingsPatchSchema>,
) {
  const changes = storefrontSettingsPatchSchema.parse(input);
  const current = await loadStorefrontSettings();
  const next = storefrontSettingsInputSchema.parse({ ...current, ...changes });
  const modelOptions = getStorefrontAiModelOptions();
  if (
    modelOptions.length === 0 ||
    !modelOptions.includes(next.aiModel) ||
    (next.aiFallbackModel && !modelOptions.includes(next.aiFallbackModel))
  ) {
    return {
      error: 'Select storefront AI models configured by the environment.',
      configuredAiModels: modelOptions,
    };
  }

  const settings = await saveStorefrontSettings(next);
  await revalidateStorefrontSettings();
  return { ok: true as const, settings };
}

export async function updateAdminStorefrontAnnouncement(
  input: z.input<typeof storefrontAnnouncementMutationSchema>,
  actor?: string | null,
) {
  const announcement = await saveStorefrontAnnouncement(input, actor);
  await revalidateStorefrontSettings();
  return { ok: true as const, announcement };
}
