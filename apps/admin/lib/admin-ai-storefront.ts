import {
  storefrontSettingsInputSchema,
  type StorefrontSettingsInput,
} from '@bric/storefront-core/settings';
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

const storefrontSettingOperationSchema = z.discriminatedUnion('field', [
  z.object({ field: z.literal('contactPhone'), value: z.string().trim().min(1).max(50) }).strict(),
  z
    .object({ field: z.literal('contactEmail'), value: z.string().trim().max(254).nullable() })
    .strict(),
  z.object({ field: z.literal('address'), value: z.string().trim().max(500).nullable() }).strict(),
  z.object({ field: z.literal('mapUrl'), value: z.string().trim().max(2_000).nullable() }).strict(),
  z
    .object({ field: z.literal('facebookUrl'), value: z.string().trim().max(2_000).nullable() })
    .strict(),
  z.object({ field: z.literal('aiAssistantEnabled'), value: z.boolean() }).strict(),
  z.object({ field: z.literal('aiModel'), value: z.string().trim().min(1).max(120) }).strict(),
  z
    .object({ field: z.literal('aiFallbackModel'), value: z.string().trim().max(120).nullable() })
    .strict(),
]);

export const storefrontSettingsToolSchema = z
  .object({ operations: z.array(storefrontSettingOperationSchema).min(1).max(8) })
  .strict()
  .superRefine((input, context) => {
    const fields = input.operations.map((operation) => operation.field);
    if (new Set(fields).size !== fields.length) {
      context.addIssue({
        code: 'custom',
        path: ['operations'],
        message: 'Each storefront setting can only be changed once.',
      });
    }
  });

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

export async function updateAdminStorefrontSettings(input: Partial<StorefrontSettingsInput>) {
  const changes = storefrontSettingsInputSchema.partial().strict().parse(input);
  if (!Object.values(input).some((value) => value !== undefined)) {
    throw new Error('At least one setting is required.');
  }
  const modelOptions = getStorefrontAiModelOptions();
  if (
    (input.aiModel !== undefined && !modelOptions.includes(changes.aiModel!)) ||
    (input.aiFallbackModel != null &&
      changes.aiFallbackModel &&
      !modelOptions.includes(changes.aiFallbackModel))
  ) {
    return {
      error: 'Select storefront AI models configured by the environment.',
      configuredAiModels: modelOptions,
    };
  }

  const settings = await saveStorefrontSettings(input);
  await revalidateStorefrontSettings();
  return { ok: true as const, settings };
}

export async function updateAdminStorefrontSettingsFromTool(
  input: z.input<typeof storefrontSettingsToolSchema>,
) {
  const values = storefrontSettingsToolSchema.parse(input);
  return updateAdminStorefrontSettings(
    Object.fromEntries(values.operations.map((operation) => [operation.field, operation.value])),
  );
}

export async function updateAdminStorefrontAnnouncement(
  input: z.input<typeof storefrontAnnouncementMutationSchema>,
  actor?: string | null,
) {
  const announcement = await saveStorefrontAnnouncement(input, actor);
  await revalidateStorefrontSettings();
  return { ok: true as const, announcement };
}
