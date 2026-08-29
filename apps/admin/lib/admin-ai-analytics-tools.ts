import { tool, type ToolSet } from 'ai';

import {
  ADMIN_AI_STATS_TOOL_DESCRIPTION,
  adminAiStatsQuerySchema,
  queryAdminAiStats,
} from './admin-ai-ai-stats';
import {
  adminAiAnalyticsCostsMutationSchema,
  adminAiAnalyticsDayOverridesMutationSchema,
  adminAiAnalyticsSettingsPatchSchema,
  adminAiAnalyticsSyncSchema,
  manageAdminAiAnalyticsCosts,
  manageAdminAiAnalyticsDayOverrides,
  syncAdminAiAnalyticsSource,
  updateAdminAiAnalyticsSettings,
} from './admin-ai-analytics-actions';
import {
  executeAdminAiToolForRuntime,
  type AdminAiToolBuildContext,
} from './admin-ai-tool-runtime';
import { adminAiAnalyticsQuerySchema, queryAdminAnalytics } from './ai-analytics';

const ADMIN_AI_ANALYTICS_TOOL_DESCRIPTION = [
  'Read canonical live Analytics evidence.',
  'Results include metric meanings, dates, coverage, estimation, sources, and warnings. Use focus for useful underlying rows and sourceCoverage for the exact EcoTrack denominator and missing eligible orders.',
].join(' ');

export function buildAdminAiAnalyticsTools({
  permissions,
  runtime,
}: AdminAiToolBuildContext): ToolSet {
  if (!permissions.includes('analytics_manage')) return {};

  return {
    query_analytics: tool({
      description: ADMIN_AI_ANALYTICS_TOOL_DESCRIPTION,
      inputSchema: adminAiAnalyticsQuerySchema,
      execute: queryAdminAnalytics,
    }),
    query_ai_stats: tool({
      description: ADMIN_AI_STATS_TOOL_DESCRIPTION,
      inputSchema: adminAiStatsQuerySchema,
      execute: queryAdminAiStats,
    }),
    update_analytics_settings: tool({
      description:
        'Change the canonical planning return rate and return the persisted before and after values.',
      inputSchema: adminAiAnalyticsSettingsPatchSchema,
      execute: (input) =>
        executeAdminAiToolForRuntime(runtime, input, () => updateAdminAiAnalyticsSettings(input)),
    }),
    manage_analytics_costs: tool({
      description:
        'Create, update, or delete exact operating-cost records used by true profit. Updates preserve omitted fields and return a persisted outcome for each requested operation.',
      inputSchema: adminAiAnalyticsCostsMutationSchema,
      execute: (input) =>
        executeAdminAiToolForRuntime(runtime, input, () => manageAdminAiAnalyticsCosts(input)),
    }),
    manage_analytics_day_overrides: tool({
      description:
        'Set or reset exact calculator-day overrides for gross profit, planning return rate, confirmed orders, or an operator note. Omitted fields stay unchanged and null clears a named value.',
      inputSchema: adminAiAnalyticsDayOverridesMutationSchema,
      execute: (input) =>
        executeAdminAiToolForRuntime(runtime, input, () =>
          manageAdminAiAnalyticsDayOverrides(input),
        ),
    }),
    sync_analytics_source: tool({
      description:
        'Synchronize an exact Meta or Search Console date range through the canonical integration. Meta ranges are limited to 90 days; returns the source operation result.',
      inputSchema: adminAiAnalyticsSyncSchema,
      execute: (input) =>
        executeAdminAiToolForRuntime(runtime, input, () => syncAdminAiAnalyticsSource(input)),
    }),
  } satisfies ToolSet;
}
