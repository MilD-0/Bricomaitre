import { tool, type ToolSet } from 'ai';

import { buildAdminAiAnalyticsTools } from './admin-ai-analytics-tools';
import { buildAdminAiAssetTools } from './admin-ai-asset-tools';
import { buildAdminAiCatalogTools } from './admin-ai-catalog-tools';
import { buildAdminAiOrderTools } from './admin-ai-order-tools';
import {
  ADMIN_AI_PRESENTATION_TOOL_DESCRIPTION,
  ADMIN_AI_PRESENTATION_TOOL_NAME,
  adminAiPresentationPlanSchema,
} from './admin-ai-presentation';
import {
  ADMIN_AI_GUIDANCE_TOOL_DESCRIPTION,
  type AdminAiGuidanceTopic,
  adminAiGuidanceRequestSchemaForTopics,
  readAdminAiGuidanceForTopics,
} from './admin-ai-runtime';
import { buildAdminAiStorefrontTools } from './admin-ai-storefront-tools';
import type { AdminAiToolBuildContext, AdminAiToolRuntime } from './admin-ai-tool-runtime';
import type { PermissionKey } from './permissions';

type BuildAdminAiToolsInput = {
  permissions: readonly PermissionKey[];
  locale: 'en' | 'fr' | 'ar';
  now?: Date;
  runtime: AdminAiToolRuntime;
};

function guidanceTopicsForPermissions(
  permissions: readonly PermissionKey[],
): AdminAiGuidanceTopic[] {
  const hasAnalytics = permissions.includes('analytics_manage');
  const hasCatalog =
    permissions.includes('products_write') ||
    permissions.includes('orders_write') ||
    permissions.includes('assets_write') ||
    permissions.includes('brands_categories_write');
  const hasOrders = permissions.includes('orders_write');
  const hasStorefront = permissions.includes('settings_manage');
  const hasAssets = permissions.includes('assets_write');

  return [
    ...(hasAnalytics
      ? ([
          'analytics_profit',
          'analytics_order_lifecycle',
          'analytics_sources_and_coverage',
          'analytics_dates_and_comparisons',
          'analytics_storefront_and_attribution',
          'ai_stats_operations',
          'ai_stats_shopping',
        ] satisfies AdminAiGuidanceTopic[])
      : []),
    ...(hasCatalog ? (['catalog'] satisfies AdminAiGuidanceTopic[]) : []),
    ...(hasOrders ? (['orders'] satisfies AdminAiGuidanceTopic[]) : []),
    ...(hasStorefront ? (['storefront'] satisfies AdminAiGuidanceTopic[]) : []),
    ...(hasAssets ? (['assets', 'landing_pages'] satisfies AdminAiGuidanceTopic[]) : []),
  ];
}

export function buildAdminAiTools({
  permissions,
  locale,
  now = new Date(),
  runtime,
}: BuildAdminAiToolsInput): ToolSet {
  const context: AdminAiToolBuildContext = { permissions, locale, now, runtime };
  const guidanceTopics = guidanceTopicsForPermissions(permissions);
  const permittedGuidanceTopics = guidanceTopics as [
    AdminAiGuidanceTopic,
    ...AdminAiGuidanceTopic[],
  ];
  const hasEvidenceTools =
    permissions.includes('analytics_manage') ||
    permissions.includes('products_write') ||
    permissions.includes('orders_write') ||
    permissions.includes('assets_write') ||
    permissions.includes('brands_categories_write') ||
    permissions.includes('settings_manage');

  return {
    ...(guidanceTopics.length > 0
      ? {
          read_system_guidance: tool({
            description: ADMIN_AI_GUIDANCE_TOOL_DESCRIPTION,
            inputSchema: adminAiGuidanceRequestSchemaForTopics(permittedGuidanceTopics),
            execute: (input) => readAdminAiGuidanceForTopics(permittedGuidanceTopics, input),
          }),
        }
      : {}),
    ...buildAdminAiCatalogTools(context),
    ...buildAdminAiAssetTools(context),
    ...buildAdminAiOrderTools(context),
    ...buildAdminAiAnalyticsTools(context),
    ...buildAdminAiStorefrontTools(context),
    ...(hasEvidenceTools
      ? {
          [ADMIN_AI_PRESENTATION_TOOL_NAME]: tool({
            description: ADMIN_AI_PRESENTATION_TOOL_DESCRIPTION,
            inputSchema: adminAiPresentationPlanSchema.omit({ kind: true }),
            execute: async (input) =>
              adminAiPresentationPlanSchema.parse({ kind: 'admin_ui_blocks_v1', ...input }),
          }),
        }
      : {}),
  } satisfies ToolSet;
}
