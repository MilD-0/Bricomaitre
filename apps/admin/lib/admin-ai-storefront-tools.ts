import { tool, type ToolSet } from 'ai';
import { z } from 'zod';

import {
  inspectAdminStorefrontConfiguration,
  storefrontAnnouncementMutationSchema,
  storefrontSettingsToolSchema,
  updateAdminStorefrontAnnouncement,
  updateAdminStorefrontSettingsFromTool,
} from './admin-ai-storefront';
import {
  executeAdminAiToolForRuntime,
  type AdminAiToolBuildContext,
} from './admin-ai-tool-runtime';

export function buildAdminAiStorefrontTools({
  permissions,
  runtime,
}: AdminAiToolBuildContext): ToolSet {
  if (!permissions.includes('settings_manage')) return {};

  return {
    inspect_storefront_configuration: tool({
      description:
        'Read the current Storefront contact, customer assistant, configured model choices, and bilingual announcement settings.',
      inputSchema: z.object({}).strict(),
      execute: inspectAdminStorefrontConfiguration,
    }),
    update_storefront_settings: tool({
      description:
        'Change only the named Storefront contact, link, or customer-assistant settings. Omitted settings stay unchanged.',
      inputSchema: storefrontSettingsToolSchema,
      execute: (input) =>
        executeAdminAiToolForRuntime(runtime, input, () =>
          updateAdminStorefrontSettingsFromTool(input),
        ),
    }),
    update_storefront_announcement: tool({
      description:
        'Replace the French and Arabic Storefront announcement messages and their shared active state. Both messages are required when active.',
      inputSchema: storefrontAnnouncementMutationSchema,
      execute: (input) =>
        executeAdminAiToolForRuntime(runtime, input, ({ actorId }) =>
          updateAdminStorefrontAnnouncement(input, actorId),
        ),
    }),
  } satisfies ToolSet;
}
