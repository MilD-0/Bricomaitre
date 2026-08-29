import { tool, type ToolSet } from 'ai';

import {
  ADMIN_AI_INSPECT_ASSETS_TOOL_DESCRIPTION,
  ADMIN_AI_MANAGE_ASSETS_TOOL_DESCRIPTION,
  ADMIN_AI_REORDER_ASSETS_TOOL_DESCRIPTION,
  adminAiAssetCrudSchema,
  adminAiAssetInspectionSchema,
  adminAiAssetReorderSchema,
  inspectAdminAiAssets,
  manageAdminAiAsset,
  reorderAdminAiAssets,
} from './admin-ai-assets';
import {
  ADMIN_AI_START_LANDING_PAGE_WORK_TOOL_DESCRIPTION,
  adminAiLandingPageJobStatusSchema,
  adminAiLandingPageWorkSchema,
  getAdminAiLandingPageJobStatus,
  startAdminAiLandingPageWork,
} from './admin-ai-landing-page-jobs';
import {
  ADMIN_AI_INSPECT_LANDING_PAGES_TOOL_DESCRIPTION,
  adminAiLandingPageInspectionSchema,
  adminAiLandingPagePublicationSchema,
  inspectAdminAiLandingPages,
  setAdminAiLandingPagePublication,
} from './admin-ai-landing-pages';
import {
  adminAiToolActorId,
  executeAdminAiToolForRuntime,
  type AdminAiToolBuildContext,
} from './admin-ai-tool-runtime';

export function buildAdminAiAssetTools({ permissions, runtime }: AdminAiToolBuildContext): ToolSet {
  if (!permissions.includes('assets_write')) return {};
  const actorId = adminAiToolActorId(runtime);

  return {
    inspect_assets: tool({
      description: ADMIN_AI_INSPECT_ASSETS_TOOL_DESCRIPTION,
      inputSchema: adminAiAssetInspectionSchema,
      execute: inspectAdminAiAssets,
    }),
    manage_assets: tool({
      description: ADMIN_AI_MANAGE_ASSETS_TOOL_DESCRIPTION,
      inputSchema: adminAiAssetCrudSchema,
      execute: (input) =>
        executeAdminAiToolForRuntime(runtime, input, ({ actor }) =>
          manageAdminAiAsset(input, actor),
        ),
    }),
    reorder_assets: tool({
      description: ADMIN_AI_REORDER_ASSETS_TOOL_DESCRIPTION,
      inputSchema: adminAiAssetReorderSchema,
      execute: (input) =>
        executeAdminAiToolForRuntime(runtime, input, () => reorderAdminAiAssets(input)),
    }),
    inspect_landing_pages: tool({
      description: ADMIN_AI_INSPECT_LANDING_PAGES_TOOL_DESCRIPTION,
      inputSchema: adminAiLandingPageInspectionSchema,
      execute: (input) => inspectAdminAiLandingPages(input),
    }),
    start_landing_page_work: tool({
      description: ADMIN_AI_START_LANDING_PAGE_WORK_TOOL_DESCRIPTION,
      inputSchema: adminAiLandingPageWorkSchema,
      execute: (input) =>
        executeAdminAiToolForRuntime(runtime, input, (live) =>
          startAdminAiLandingPageWork(input, {
            ownerKey: live.actorId,
            actor: live.actor,
            conversationId: live.conversationId,
          }),
        ),
    }),
    set_landing_page_active: tool({
      description:
        'Publish or unpublish one exact landing-page revision without changing its content. This is reversible and does not delete the page.',
      inputSchema: adminAiLandingPagePublicationSchema,
      execute: (input) =>
        executeAdminAiToolForRuntime(runtime, input, ({ actor }) =>
          setAdminAiLandingPagePublication(input, actor),
        ),
    }),
    get_landing_page_job_status: tool({
      description:
        'Read this operator’s latest landing-page job progress, partial generation details, failure, and saved result. Queued or running is not completed.',
      inputSchema: adminAiLandingPageJobStatusSchema,
      execute: () => getAdminAiLandingPageJobStatus(actorId),
    }),
  } satisfies ToolSet;
}
