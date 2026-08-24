import { createAiLanguageModel, getAiConfig, productContentFieldSchema } from '@bric/ai-core';
import { stepCountIs, streamText, tool, type ToolSet } from 'ai';
import { and, desc, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getDb, hasDb } from '@bric/db/client';
import { aiConversations, aiMessages, aiRuns, aiToolCalls } from '@bric/db/schema';
import { proposeProductContent } from '../../../../lib/ai-product-content';
import { ADMIN_AI_CHAT_INSTRUCTIONS } from '../../../../lib/ai-admin-chat';
import {
  allowedAdminBackgroundJobTypes,
  allowedStartableAdminBackgroundJobTypes,
  cancelAdminBackgroundJob,
  getAdminBackgroundJob,
  listAdminBackgroundJobs,
  startAdminBackgroundJob,
  type AdminBackgroundJobType,
  type StartableAdminBackgroundJobType,
} from '../../../../lib/ai-background-jobs';
import {
  AI_CATALOG_EDIT_FIELDS,
  AI_TAXONOMY_CREATE_FIELDS,
  proposeDiscount,
  proposeEntityEdit,
  proposeFeaturedProducts,
  proposeLandingPage,
  proposeTaxonomyCreate,
} from '../../../../lib/ai-admin-capabilities';
import {
  ADMIN_AI_ANALYTICS_TOOL_DESCRIPTION,
  adminAiAnalyticsQuerySchemaForPlan,
  queryAdminAnalytics,
  queryAdminAnalyticsInvestigation,
} from '../../../../lib/ai-analytics';
import {
  adminAiAnalyticsCostsMutationSchemaForMessage,
  adminAiAnalyticsDayOverridesMutationSchemaForMessage,
  adminAiAnalyticsSettingsPatchSchemaForMessage,
  adminAiAnalyticsSyncSchemaForContext,
  manageAdminAiAnalyticsCosts,
  manageAdminAiAnalyticsDayOverrides,
  syncAdminAiAnalyticsSource,
  updateAdminAiAnalyticsSettings,
} from '../../../../lib/admin-ai-analytics-actions';
import { ADMIN_AI_ANALYTICS_INSTRUCTIONS } from '../../../../lib/admin-ai-analytics-contract';
import {
  adminAiAnalyticsQueriesForPlan,
  adminAiAnalyticsPlanMessage,
  isAdminAiAnalyticsContinuationMessage,
  planAdminAiAnalyticsQuery,
} from '../../../../lib/admin-ai-analytics-plan';
import {
  adjustAdminInventory,
  adminAiInventoryAdjustmentSchema,
  adminAiInventoryReceiptSchema,
  adminAiInventoryScanSchema,
  adminAiInventoryStateSchema,
  receiveAdminInventory,
  scanAdminInventory,
  updateAdminInventoryState,
} from '../../../../lib/admin-ai-inventory';
import {
  adminAiBulletinPostSchema,
  adminAiBulletinPostUpdateSchema,
  adminAiBulletinReactionSchema,
  adminAiBulletinDeleteSchema,
  adminAiBulletinReplySchema,
  createAdminAiBulletinPost,
  deleteAdminAiBulletinContent,
  replyToAdminAiBulletinPost,
  setAdminAiBulletinReaction,
  updateAdminAiBulletinPost,
} from '../../../../lib/admin-ai-bulletin';
import {
  adminAiAccessRevocationSchema,
  adminAiAccessGrantSchema,
  adminAiRoleDefinitionSchema,
  revokeAdminAiAccessGrants,
  setAdminAiAccessGrant,
  setAdminAiRoleDefinition,
} from '../../../../lib/admin-ai-administration';
import {
  adminAiActionHistoryInspectionSchema,
  adminAiActionHistoryRecoverySchema,
  inspectAdminAiActionHistory,
  recoverAdminAiActionHistory,
} from '../../../../lib/admin-ai-action-history';
import {
  adminAiOrderCreateSchema,
  adminAiOrderDeleteSchema,
  adminAiOrderDetailsToolSchema,
  adminAiOrderStatusMutationSchema,
  createAdminAiOrder,
  deleteAdminAiOrders,
  updateAdminOrderDetailsFromTool,
  updateAdminOrderStatuses,
} from '../../../../lib/admin-ai-orders';
import {
  adminAiOrderExportScopeSchemaForMessage,
  previewAdminAiOrderExport,
  startAdminAiOrderExport,
} from '../../../../lib/admin-ai-order-exports';
import {
  adminAiOrderTrackingLinksSchema,
  issueAdminAiOrderTrackingLinks,
} from '../../../../lib/admin-ai-order-tracking';
import {
  adminAiShoppingListApplySchema,
  adminAiShoppingListScopeSchema,
  applyAdminAiShoppingListInventory,
  inspectAdminAiShoppingList,
  saveAdminAiShoppingList,
} from '../../../../lib/admin-ai-shopping-list';
import {
  adminAiEcotrackPostingPreviewSchema,
  adminAiEcotrackPostingStartSchema,
  adminAiEcotrackRequirementsSchema,
  loadAdminAiEcotrackRequirements,
  previewAdminAiEcotrackPosting,
  startAdminAiEcotrackPosting,
} from '../../../../lib/admin-ai-ecotrack';
import {
  adminAiEcotrackShipmentActionSchema,
  adminAiEcotrackShipmentChangeSchema,
  adminAiEcotrackShipmentInspectionSchema,
  changeAdminAiEcotrackShipments,
  inspectAdminAiEcotrackShipments,
  manageAdminAiEcotrackShipments,
} from '../../../../lib/admin-ai-ecotrack-shipments';
import {
  adminAiArchivedProductInspectionSchema,
  adminAiProductArchiveSchema,
  adminAiProductCreateSchema,
  adminAiProductRestoreSchema,
  adminAiProductUpdateSchema,
  archiveAdminAiProducts,
  createAdminAiProduct,
  inspectAdminAiArchivedProducts,
  restoreAdminAiProducts,
  updateAdminAiProducts,
} from '../../../../lib/admin-ai-products';
import { adminAiAssetCrudSchema, manageAdminAiAsset } from '../../../../lib/admin-ai-assets';
import {
  adminAiTaxonomyMutationSchema,
  manageAdminAiTaxonomy,
} from '../../../../lib/admin-ai-taxonomy';
import {
  adminAiLandingPageCreateSchema,
  adminAiLandingPageEditSchema,
  createAdminAiLandingPage,
  editAdminAiLandingPage,
} from '../../../../lib/admin-ai-landing-pages';
import {
  adminAiExpiredProposalDeletionSchema,
  adminAiProposalReviewSchema,
  deleteExpiredAdminAiProposals,
  reviewAdminAiProposals,
} from '../../../../lib/admin-ai-proposal-review';
import {
  inspectAdminStorefrontConfiguration,
  storefrontAnnouncementMutationSchema,
  storefrontSettingsToolSchema,
  updateAdminStorefrontAnnouncement,
  updateAdminStorefrontSettingsFromTool,
} from '../../../../lib/admin-ai-storefront';
import {
  adminAiInventoryInspectionSchema,
  adminAiProductLookupSchema,
  findAdminBrands,
  findAdminCategories,
  findAdminProducts,
  inspectAdminAdministration,
  inspectAdminAssets,
  inspectAdminBulletin,
  inspectAdminInventory,
  inspectAdminLandingPages,
  inspectAdminOrders,
  inspectAdminProducts,
  inspectAdminProposals,
} from '../../../../lib/admin-ai-domain';
import {
  adminAiCapabilityInstructions,
  adminAiContextMessage,
} from '../../../../lib/admin-ai-capabilities';
import { adminAiSurfaceContextSchema } from '../../../../lib/admin-ai-context';
import {
  adminAssetStateMutationSchema,
  reorderAdminAssets,
  updateAdminAssetStates,
} from '../../../../lib/asset-mutations';
import { assetReorderSchema } from '../../../../lib/assets';
import {
  ADMIN_AI_CATEGORIZATION_QUEUE,
  ADMIN_AI_CONTENT_QUEUE,
  getLatestExportJob,
  startAiCategorizationJob,
  startAiContentJob,
} from '../../../../lib/background-jobs';
import { auth } from '../../../../lib/auth';
import {
  hasPermission,
  normalizePermissions,
  type PermissionKey,
} from '../../../../lib/permissions';
import { requireAppAccess } from '../../../../lib/rbac';
import {
  adminAiChatStreamEventSchema,
  type AdminAiChatStreamEvent,
} from '../../../../lib/admin-ai-chat-stream';
import {
  ADMIN_AI_CONTEXT_QUERY_LIMIT,
  buildAdminAiConversationContext,
  latestAdminAiAnalyticsContinuation,
} from '../../../../lib/admin-ai-conversation-context';
import {
  ADMIN_AI_DEFAULT_MODEL,
  ADMIN_AI_MAX_OUTPUT_TOKENS,
  adminAiModelIdSchema,
  adminAiReasoningEffortSchema,
  getDefaultAdminAiReasoningEffort,
  resolveAdminAiModel,
  supportsAdminAiReasoningEffort,
} from '../../../../lib/admin-ai-models';
import {
  adminAiGroundingTool,
  adminAiMutationTool,
  adminAiRequestTimeoutMs,
  adminAiStepPlan,
} from '../../../../lib/admin-ai-tool-plan';

const requestSchema = z
  .object({
    message: z.string().trim().min(1).max(4_000),
    conversationKey: z.uuid(),
    context: adminAiSurfaceContextSchema.optional(),
    autoAcceptProposals: z.boolean().optional().default(false),
    model: adminAiModelIdSchema.optional().default(ADMIN_AI_DEFAULT_MODEL),
    reasoningEffort: adminAiReasoningEffortSchema.optional(),
  })
  .superRefine((input, context) => {
    const effort = input.reasoningEffort ?? getDefaultAdminAiReasoningEffort(input.model);
    if (!supportsAdminAiReasoningEffort(input.model, effort)) {
      context.addIssue({
        code: 'custom',
        message: 'The selected reasoning effort is not supported by this model.',
        path: ['reasoningEffort'],
      });
    }
  })
  .transform((input) => ({
    ...input,
    reasoningEffort: input.reasoningEffort ?? getDefaultAdminAiReasoningEffort(input.model),
  }));

export const ADMIN_AI_CHAT_PROMPT_VERSION = 'admin-chat-v36';
export const ADMIN_AI_INLINE_PRODUCT_LIMIT = 20;

const productLookupPermissions: PermissionKey[] = [
  'products_write',
  'orders_write',
  'assets_write',
  'brands_categories_write',
];
const taxonomyLookupPermissions: PermissionKey[] = [
  'products_write',
  'assets_write',
  'brands_categories_write',
];

function hasAnyPermission(
  permissions: readonly PermissionKey[],
  required: readonly PermissionKey[],
) {
  return required.some((permission) => hasPermission(permissions, permission));
}

function repeatableStreamText<TOOLS extends ToolSet>(
  options: Parameters<typeof streamText<TOOLS>>[0],
) {
  return () => streamText(options);
}

function conversationTitle(message: string) {
  const title = message.replace(/\s+/g, ' ').trim();
  return title.length > 80 ? `${title.slice(0, 77)}…` : title;
}

function toolErrorCode(error: unknown) {
  if (error instanceof Error) return error.name || 'Error';
  if (typeof error === 'string' && error.trim()) return error.slice(0, 200);
  return 'UnknownError';
}

type ToolTrace = {
  toolCallId: string;
  toolName: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  input: unknown;
  output?: unknown;
  errorCode?: string;
  startedAt: Date;
  completedAt?: Date;
};

export async function POST(request: NextRequest) {
  const denied = await requireAppAccess();
  if (denied) return denied;
  if (!hasDb())
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 });
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: 'Invalid AI chat request.' }, { status: 400 });

  let runId: number | null = null;
  try {
    const session = await auth();
    const actor = { email: session?.user?.email, name: session?.user?.name };
    const actorId = actor.email;
    if (!actorId) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    const permissions = normalizePermissions(session?.user?.permissions);
    const allowedJobTypes = allowedAdminBackgroundJobTypes(permissions);
    const allowedStartableJobTypes = allowedStartableAdminBackgroundJobTypes(permissions).filter(
      (type) => type !== 'order_export',
    );
    const allowedJobTypeSchema =
      allowedJobTypes.length > 0
        ? z.enum(
            allowedJobTypes as unknown as [AdminBackgroundJobType, ...AdminBackgroundJobType[]],
          )
        : null;
    const allowedStartableJobTypeSchema =
      allowedStartableJobTypes.length > 0
        ? z.enum(
            allowedStartableJobTypes as unknown as [
              StartableAdminBackgroundJobType,
              ...StartableAdminBackgroundJobType[],
            ],
          )
        : null;
    const proposalScopes = [
      ...(hasPermission(permissions, 'products_write') ? (['products'] as const) : []),
      ...(hasPermission(permissions, 'brands_categories_write') ? (['taxonomy'] as const) : []),
      ...(hasPermission(permissions, 'assets_write') ? (['assets'] as const) : []),
    ];
    const db = getDb();
    const config = getAiConfig();
    if (config.provider !== 'openrouter') {
      return NextResponse.json(
        { error: 'The admin AI model selector requires OpenRouter.' },
        { status: 503 },
      );
    }
    const selectedModel = resolveAdminAiModel(parsed.data.model, parsed.data.reasoningEffort);
    const model = selectedModel.telemetryModel;
    const now = new Date();
    const title = conversationTitle(parsed.data.message);
    const [existingConversation] = await db
      .select({ id: aiConversations.id, title: aiConversations.title })
      .from(aiConversations)
      .where(
        and(
          eq(aiConversations.surface, 'admin'),
          eq(aiConversations.sessionKey, parsed.data.conversationKey),
          eq(aiConversations.actorId, actorId),
        ),
      )
      .limit(1);
    const conversation =
      existingConversation ??
      (
        await db
          .insert(aiConversations)
          .values({
            surface: 'admin',
            actorId,
            sessionKey: parsed.data.conversationKey,
            title,
          })
          .returning({ id: aiConversations.id, title: aiConversations.title })
      )[0];
    const previousRows = await db
      .select({ role: aiMessages.role, content: aiMessages.content })
      .from(aiMessages)
      .where(eq(aiMessages.conversationId, conversation.id))
      .orderBy(desc(aiMessages.createdAt))
      .limit(ADMIN_AI_CONTEXT_QUERY_LIMIT);
    const previousMessages = buildAdminAiConversationContext(previousRows);
    const analyticsContinuation = latestAdminAiAnalyticsContinuation(previousRows);
    const effectiveTitle = previousMessages.length === 0 ? title : conversation.title || title;
    await Promise.all([
      db.insert(aiMessages).values({
        conversationId: conversation.id,
        role: 'user',
        content: { text: parsed.data.message },
      }),
      db
        .update(aiConversations)
        .set({ title: effectiveTitle, updatedAt: now })
        .where(eq(aiConversations.id, conversation.id)),
    ]);

    try {
      const [run] = await db
        .insert(aiRuns)
        .values({
          conversationId: conversation.id,
          surface: 'admin',
          task: 'admin_chat',
          status: 'running',
          model,
          promptVersion: ADMIN_AI_CHAT_PROMPT_VERSION,
          actorId,
        })
        .returning({ id: aiRuns.id });
      runId = run.id;
    } catch {
      // AI telemetry must never prevent the assistant from answering.
    }
    const groundingTool =
      analyticsContinuation &&
      isAdminAiAnalyticsContinuationMessage(parsed.data.message) &&
      hasPermission(permissions, 'analytics_manage')
        ? ('query_analytics' as const)
        : adminAiGroundingTool({
            message: parsed.data.message,
            surface: parsed.data.context?.surface,
            section: parsed.data.context?.section,
            permissions,
          });
    const mutationTool = adminAiMutationTool({
      message: parsed.data.message,
      surface: parsed.data.context?.surface,
      section: parsed.data.context?.section,
      permissions,
    });
    const analyticsInstructions =
      groundingTool === 'query_analytics' || parsed.data.context?.surface === 'stats'
        ? ` ${ADMIN_AI_ANALYTICS_INSTRUCTIONS}`
        : '';
    const analyticsPlan =
      groundingTool === 'query_analytics'
        ? planAdminAiAnalyticsQuery({
            message: parsed.data.message,
            context: parsed.data.context,
            previous: analyticsContinuation,
          })
        : null;
    const createResult = repeatableStreamText({
      model: createAiLanguageModel(config, 'admin', {
        model: selectedModel.model,
        openRouterRequestBody: selectedModel.openRouterRequestBody,
      }),
      instructions: parsed.data.context
        ? `${ADMIN_AI_CHAT_INSTRUCTIONS} ${adminAiCapabilityInstructions(parsed.data.context, permissions)}${analyticsInstructions}${analyticsPlan ? ` ${adminAiAnalyticsPlanMessage(analyticsPlan)}` : ''}`
        : `${ADMIN_AI_CHAT_INSTRUCTIONS}${analyticsInstructions}${analyticsPlan ? ` ${adminAiAnalyticsPlanMessage(analyticsPlan)}` : ''}`,
      messages: [
        ...previousMessages,
        ...(parsed.data.context
          ? [
              {
                role: 'user' as const,
                content: adminAiContextMessage(parsed.data.context),
              },
            ]
          : []),
        { role: 'user', content: parsed.data.message },
      ],
      abortSignal: AbortSignal.any([
        request.signal,
        AbortSignal.timeout(
          adminAiRequestTimeoutMs(config.requestTimeoutMs, mutationTool, groundingTool),
        ),
      ]),
      maxRetries: config.maxRetries,
      maxOutputTokens: ADMIN_AI_MAX_OUTPUT_TOKENS,
      stopWhen: stepCountIs(8),
      prepareStep: ({ stepNumber, steps = [] }) => {
        const analyticsQueryCount = steps.reduce(
          (count, step) =>
            count + step.toolCalls.filter((call) => call?.toolName === 'query_analytics').length,
          0,
        );
        const plan = adminAiStepPlan({
          stepNumber,
          groundingTool,
          mutationTool,
          analyticsQueryCount,
          analyticsQueryLimit: analyticsPlan?.maxQueries,
        });
        if (plan?.kind === 'force_tool') {
          return {
            activeTools: [plan.toolName],
            toolChoice: { type: 'tool', toolName: plan.toolName },
          };
        }
        if (plan?.kind === 'analytics_only') {
          return { activeTools: ['query_analytics'], toolChoice: 'auto' };
        }
        if (plan?.kind === 'answer_only') return { activeTools: [], toolChoice: 'none' };
        return undefined;
      },
      tools: {
        ...(hasAnyPermission(permissions, productLookupPermissions)
          ? {
              find_products: tool({
                description:
                  'Read catalog products through the canonical product option service. Resolve either exact IDs from the current selection or a title, SKU, or barcode search; results include pagination totals and are not limited to an arbitrary catalog subset.',
                inputSchema: adminAiProductLookupSchema,
                execute: findAdminProducts,
              }),
            }
          : {}),
        ...(hasPermission(permissions, 'products_write')
          ? {
              inspect_products: tool({
                description:
                  'Read complete current product records through canonical product mutation inputs, including content, identifiers, prices, exact purchase cost, activation, availability, inventory quantity, taxonomy IDs, images, and complete promo-code rules. Resolve exact IDs or search across the full unarchived catalog. Before product creation, also resolve duplicate title/SKU candidates and any referenced brand or category name in this same read.',
                inputSchema: z
                  .object({
                    query: z.string().trim().max(200).default(''),
                    productIds: z.array(z.number().int().positive()).max(20).default([]),
                    brandQuery: z.string().trim().max(200).default(''),
                    categoryQuery: z.string().trim().max(200).default(''),
                    page: z.number().int().positive().default(1),
                    limit: z.number().int().min(1).max(20).default(10),
                  })
                  .refine(
                    (input) =>
                      input.query.length > 0 ||
                      input.productIds.length > 0 ||
                      input.brandQuery.length > 0 ||
                      input.categoryQuery.length > 0,
                    {
                      message:
                        'Provide a product search, product ID, brand query, or category query.',
                    },
                  ),
                execute: inspectAdminProducts,
              }),
              create_product: tool({
                description:
                  'Create one exact product through the same canonical Product editor workflow, including unique slug resolution, identifier validation, numeric formatting, initial inventory, complete promo rules, action history, storefront refresh, and catalog-feed refresh. Resolve possible duplicates and named taxonomy first. The persisted active and availability fields determine whether it is live.',
                inputSchema: adminAiProductCreateSchema,
                execute: (input) => createAdminAiProduct(input, actor),
              }),
              update_products: tool({
                description:
                  'Directly update up to 20 exact inspected products through the same complete replacement workflow as the Product editor. Supports content, identifiers, selling/purchase/old prices, activation, availability, taxonomy, images, and complete promo-code rules; inventory quantity remains owned by adjust_inventory. Preserves omitted fields, validates merged records and promo economics, keeps slug history and landing pages aligned, refreshes storefront caches once, queues the catalog feed once, and reports partial failures.',
                inputSchema: adminAiProductUpdateSchema,
                execute: (input) => updateAdminAiProducts(input, actor),
              }),
              archive_products: tool({
                description:
                  'Archive up to 20 exact inspected products through the same canonical Product delete workflow. Archiving disables sale and stock visibility without erasing historical order references. Report every archived and missing product.',
                inputSchema: adminAiProductArchiveSchema,
                execute: (input) => archiveAdminAiProducts(input, actor),
              }),
              inspect_archived_products: tool({
                description:
                  'Read the native product archive by exact archived product IDs or across the complete archived catalog with search and pagination. Returns archived timestamps and identifiers plus explicit missing IDs. This reader is distinct from inspect_products, which intentionally covers only the live catalog.',
                inputSchema: adminAiArchivedProductInspectionSchema,
                execute: inspectAdminAiArchivedProducts,
              }),
              restore_products: tool({
                description:
                  'Restore up to 20 exact inspected archived products through the canonical Product archive-recovery workflow after an explicit operator request. Restoring removes the archived state but preserves the product’s inactive and out-of-stock state until separately changed. Reports every restored and missing product and refreshes catalog consumers once.',
                inputSchema: adminAiProductRestoreSchema,
                execute: (input) => restoreAdminAiProducts(input, actor),
              }),
            }
          : {}),
        ...(hasAnyPermission(permissions, taxonomyLookupPermissions)
          ? {
              find_brands: tool({
                description:
                  'Resolve a brand name through the canonical taxonomy service before editing it or assigning products.',
                inputSchema: z.object({
                  query: z.string().trim().min(1).max(200),
                  limit: z.number().int().min(1).max(50).default(10),
                }),
                execute: findAdminBrands,
              }),
              find_categories: tool({
                description:
                  'Resolve a localized category name and its hierarchy through the canonical taxonomy service before editing it or assigning products.',
                inputSchema: z.object({
                  query: z.string().trim().min(1).max(200),
                  limit: z.number().int().min(1).max(50).default(10),
                }),
                execute: findAdminCategories,
              }),
            }
          : {}),
        ...(hasPermission(permissions, 'brands_categories_write')
          ? {
              manage_taxonomy: tool({
                description:
                  'Directly create, update, activate, deactivate, reparent, or delete one exact brand or category through the same canonical taxonomy workflows as the admin UI. Resolve matching names and parent categories first. Category hierarchy cycles and missing parents are rejected; deletes preserve product records by clearing their taxonomy reference and refresh storefront metadata.',
                inputSchema: adminAiTaxonomyMutationSchema,
                execute: (input) => manageAdminAiTaxonomy(input, actor),
              }),
            }
          : {}),
        ...(hasPermission(permissions, 'orders_write')
          ? {
              inspect_orders: tool({
                description:
                  'Read selected or filtered orders through the canonical Orders service with complete customer, contact, address, note, delivery, payment, product, promotion, and staff-handled status context.',
                inputSchema: z.object({
                  orderIds: z.array(z.number().int().positive()).max(50).default([]),
                  status: z.number().int().min(0).max(11).optional(),
                  noAnswerCount: z.number().int().min(0).max(99).optional(),
                  limit: z.number().int().min(1).max(50).default(20),
                }),
                execute: inspectAdminOrders,
              }),
              preview_order_export: tool({
                description:
                  'Preview the native Orders Excel export for exact selected orders or the complete recent confirmed cohort. The confirmed cohort uses the same seven-day created-date rule as the UI. Returns every resolved order ID, missing or stale exclusions, required-field gaps, a labeled row sample, the canonical filename, and the critical completion effect without starting work.',
                inputSchema: adminAiOrderExportScopeSchemaForMessage(parsed.data.message),
                execute: (input) => previewAdminAiOrderExport(input),
              }),
              start_order_export: tool({
                description:
                  'Start the native server-owned Orders Excel export only after preview and an explicit operator request. For confirmed mode, orderIds must remain [] and must not copy resolved preview IDs; the server reloads the complete recent-confirmed scope. Selected mode uses exact inspected IDs. A confirmed export transitions successfully exported orders to dispatched after file creation; a selected export leaves statuses unchanged. Queued or running is not complete, and the terminal conversation result provides the authenticated download when ready.',
                inputSchema: adminAiOrderExportScopeSchemaForMessage(parsed.data.message),
                execute: (input) =>
                  startAdminAiOrderExport(input, {
                    ownerKey: session?.user?.id ?? actorId,
                    conversationId: conversation.id,
                  }),
              }),
              get_order_tracking_links: tool({
                description:
                  'Issue missing opaque storefront tracking tokens and return canonical customer tracking links for up to 50 exact inspected orders after an explicit operator request. Existing tokens are reused, missing orders are reported, and link locale comes from the current admin conversation.',
                inputSchema: adminAiOrderTrackingLinksSchema,
                execute: (input) =>
                  issueAdminAiOrderTrackingLinks(input, parsed.data.context?.locale ?? 'fr'),
              }),
              inspect_order_shopping_list: tool({
                description:
                  'Preview the native shared Orders shopping list for exact selected orders or the complete confirmed, dispatched, posted, or posted-and-confirmed cohort. Rebuilds canonical line aggregation from every in-scope order, live inventory and purchase cost, merges any persisted team draft, and returns order count, units, inventory coverage, shortages, unmatched lines, and exact draft IDs without writing.',
                inputSchema: adminAiShoppingListScopeSchema,
                execute: inspectAdminAiShoppingList,
              }),
              save_order_shopping_list: tool({
                description:
                  'Create, refresh, or merge one native shared Orders shopping-list draft only after preview and an explicit operator request. The server reloads the complete current cohort and canonical product/inventory data instead of trusting model-authored lines, preserves existing team draft edits, and reports missing selected orders, coverage, shortages, and unmatched lines.',
                inputSchema: adminAiShoppingListScopeSchema,
                execute: (input) => saveAdminAiShoppingList(input, actor),
              }),
              ...(hasPermission(permissions, 'products_write')
                ? {
                    apply_order_shopping_list_inventory: tool({
                      description:
                        'Apply all or exact inspected eligible shopping-list draft lines to Inventory after an explicit operator request. Use selection all and draftIds [] when the operator says all, every, toute, or the whole list; use exact only for a named subset. Uses the saved shared draft quantities, canonical inventory conflict handling and action history, marks successful lines applied, persists the revised draft, and reports every applied, inventory-rejected, missing, unmatched, already-applied, or uncovered requested row. applicationSummary.appliedUnits is the exact applied total; draft coverage is not an applied total. This decreases stock and requires inventory write access.',
                      inputSchema: adminAiShoppingListApplySchema,
                      execute: (input) => applyAdminAiShoppingListInventory(input, actor),
                    }),
                  }
                : {}),
              preview_ecotrack_posting: tool({
                description:
                  'Resolve and validate an exact selected, all-confirmed, confirmed-on-date, or today-confirmed order cohort before ECOTRACK posting. Today uses the Africa/Algiers order-created business date. Returns every eligible, already-posted, and invalid order without mutating anything. Always ask the operator to choose Delivro or Emir when the provider is not explicit.',
                inputSchema: adminAiEcotrackPostingPreviewSchema,
                execute: (input) => previewAdminAiEcotrackPosting(input),
              }),
              load_ecotrack_requirements: tool({
                description:
                  'Load the canonical ECOTRACK posting requirements, complete current order evidence, provider-payload field mappings, and typo-tolerant live wilaya/commune matches. Use after any local validation failure or provider rejection and before proposing or applying a repair; never invent a destination absent from the live catalog.',
                inputSchema: adminAiEcotrackRequirementsSchema,
                execute: loadAdminAiEcotrackRequirements,
              }),
              inspect_ecotrack_shipments: tool({
                description:
                  'Read the native ECOTRACK shipment ledger. Exact order IDs return fresh complete shipment records with provider, tracking number, customer, destination, products, amounts, current status, allowed actions, MAJ entries, and tracking history. Filtered reads use the same search, status, stale, pagination, and sort semantics as the ledger UI.',
                inputSchema: adminAiEcotrackShipmentInspectionSchema,
                execute: inspectAdminAiEcotrackShipments,
              }),
              post_orders_to_ecotrack: tool({
                description:
                  'Start one canonical server-owned ECOTRACK posting job for the exact previewed scope only after the operator explicitly chooses Delivro or Emir. The job attempts every eligible order, preserves per-order partial failures, posts a terminal result back into this conversation, and must not be described as complete while merely queued or running.',
                inputSchema: adminAiEcotrackPostingStartSchema,
                execute: (input) =>
                  startAdminAiEcotrackPosting(input, {
                    ownerKey: session?.user?.id ?? actorId,
                    actor,
                    conversationId: conversation.id,
                  }),
              }),
              manage_ecotrack_shipments: tool({
                description:
                  'Run the native ECOTRACK refresh, dispatch, add-MAJ, return-request, label-preparation, or delete workflow for exact inspected shipments after an explicit operator request. Label preparation returns authenticated per-shipment download URLs and must not be described as already printed. The canonical service refreshes action eligibility, calls the correct Delivro or Emir account, preserves partial successes, synchronizes local order state, records action history, and returns every failure reason.',
                inputSchema: adminAiEcotrackShipmentActionSchema,
                execute: (input) => manageAdminAiEcotrackShipments(input, actor),
              }),
              change_ecotrack_shipments: tool({
                description:
                  'Apply explicit field/value operations to exact inspected posted shipments. Auto mode edits when ECOTRACK still allows direct editing and otherwise recreates only when the canonical action flags allow it. Unmentioned fields are loaded and preserved server-side; local commercial totals and the correct Delivro or Emir shipment are updated atomically or rolled back, with per-order failures returned.',
                inputSchema: adminAiEcotrackShipmentChangeSchema,
                execute: (input) => changeAdminAiEcotrackShipments(input, actor),
              }),
              update_order_status: tool({
                description:
                  'Update exact inspected orders through the canonical Orders workflow after an explicit operator request. Semantic statuses: not_contacted, no_answer, confirmed, dispatched, completed, delayed, cancelled, in_delivery, returned, failed, manual_completed, posted. This records history, validates transitions, queues normal lifecycle events, refreshes reporting, and reports partial failures.',
                inputSchema: adminAiOrderStatusMutationSchema,
                execute: (input) => updateAdminOrderStatuses(input, actor),
              }),
              create_order: tool({
                description:
                  'Create one local admin order after resolving every named product to exact IDs. Uses canonical commercial pricing, immutable order-line snapshots, promotion validation, EcoTrack delivery-fee rules, duplicate-phone evidence, degraded-capture classification, public token generation, initial status history, action history, and reporting refresh. Null means the operator did not provide that optional customer field; never invent it.',
                inputSchema: adminAiOrderCreateSchema,
                execute: (input) => createAdminAiOrder(input, actor),
              }),
              delete_orders: tool({
                description:
                  'Delete up to 20 exact inspected local orders after an explicit operator request through canonical action history and reporting refresh. Reports every deleted and missing order and whether an already-posted external EcoTrack shipment may remain; local order deletion is not carrier shipment deletion.',
                inputSchema: adminAiOrderDeleteSchema,
                execute: (input) => deleteAdminAiOrders(input, actor),
              }),
              update_order_details: tool({
                description:
                  'Correct exact inspected order customer names, phone, note, home/stop-desk delivery, wilaya, commune, address, or product lines after an explicit operator request. Supply one explicit field/value operation per requested change and omit every unrelated field. cartProductTokens contains one canonical product ID/slug token per unit. Uses the same commercial recalculation, delivery catalog, degraded-capture handling, action history, and reporting refresh as the Orders UI, and reports partial failures.',
                inputSchema: adminAiOrderDetailsToolSchema,
                execute: (input) => updateAdminOrderDetailsFromTool(input, actor),
              }),
            }
          : {}),
        ...(hasPermission(permissions, 'products_write')
          ? {
              inspect_inventory: tool({
                description:
                  'Read the canonical Inventory workspace using an explicit scope. Use exact with productIds for named/selected IDs, search with query for a barcode, SKU, or title, and visible only for the current general inventory view. Returns real quantities and availability state.',
                inputSchema: adminAiInventoryInspectionSchema,
                execute: inspectAdminInventory,
              }),
              scan_inventory: tool({
                description:
                  'Resolve one exact native Inventory scanner input before receiving stock. A numeric order ID returns every snapshotted order line, catalog match, quantity, current inventory, and selectability; otherwise an exact barcode returns its product. This is a read-only preview.',
                inputSchema: adminAiInventoryScanSchema,
                execute: scanAdminInventory,
              }),
              adjust_inventory: tool({
                description:
                  'Increase or decrease exact resolved product inventory quantities after an explicit operator request. Returns every previous/next quantity and any missing or insufficient rows, and records normal action history.',
                inputSchema: adminAiInventoryAdjustmentSchema,
                execute: (input) => adjustAdminInventory(input, actor),
              }),
              receive_inventory: tool({
                description:
                  'Receive exact quantities from one completed scan preview. Use order_scan with the exact inspected orderId and selected catalog-matched lines, or barcode_scan with orderId null and the exact scanned product. Increases inventory through canonical action history and reports every resulting quantity or failure.',
                inputSchema: adminAiInventoryReceiptSchema,
                execute: (input) => receiveAdminInventory(input, actor),
              }),
              update_inventory_state: tool({
                description:
                  'Set or clear the barcode and set sellability for up to 50 exact inspected products. Supply only explicit field/value operations; null clears a barcode. Each product update is one canonical action-history mutation and partial failures remain visible.',
                inputSchema: adminAiInventoryStateSchema,
                execute: (input) => updateAdminInventoryState(input, actor),
              }),
            }
          : {}),
        ...(hasPermission(permissions, 'assets_write')
          ? {
              inspect_assets: tool({
                description:
                  'Read current banners, featured groups, and product cards through the canonical Assets service before merchandising changes. For asset creation, also resolve any referenced product, brand, or category names in the same read by supplying the matching query fields.',
                inputSchema: z.object({
                  kind: z.enum(['all', 'banners', 'featuredGroups', 'productCards']).default('all'),
                  ids: z.array(z.number().int().positive()).max(100).default([]),
                  limit: z.number().int().min(1).max(50).default(20),
                  productQuery: z.string().trim().max(200).default(''),
                  brandQuery: z.string().trim().max(200).default(''),
                  categoryQuery: z.string().trim().max(200).default(''),
                }),
                execute: inspectAdminAssets,
              }),
              inspect_landing_pages: tool({
                description:
                  'Read complete current landing-page documents, revisions, publication state, product identity, locale, slug, theme, SEO, and ordered blocks. Use exact IDs or product IDs when available so edits are grounded in the complete current document.',
                inputSchema: z.object({
                  landingPageIds: z.array(z.number().int().positive()).max(20).default([]),
                  productIds: z.array(z.number().int().positive()).max(20).default([]),
                  query: z.string().trim().max(200).default(''),
                  limit: z.number().int().min(1).max(20).default(10),
                }),
                execute: inspectAdminLandingPages,
              }),
              create_landing_page: tool({
                description:
                  'Generate and persist a complete validated landing page for one resolved active product. The backend uses a staged creative plan and independently validated blocks, protects catalog facts and image URLs, and always returns the exact generation/fallback status. Creates an inactive draft unless active is explicitly true.',
                inputSchema: adminAiLandingPageCreateSchema,
                execute: (input) => createAdminAiLandingPage(input, actor),
              }),
              edit_landing_page: tool({
                description:
                  'Edit one exact inspected landing page through a validated staged edit plan. Unaffected and accidentally omitted blocks are preserved verbatim, explicit deletion must name an existing block and match the operator request, changed/new blocks are generated independently, ordering and IDs are validated, stale revisions are rejected, and per-block fallbacks are returned. active null preserves publication state; set it only when explicitly requested.',
                inputSchema: adminAiLandingPageEditSchema,
                execute: (input) => editAdminAiLandingPage(input, actor),
              }),
              update_asset_state: tool({
                description:
                  'Activate or deactivate exact inspected banners, featured groups, or product cards, and control featured-group top-of-products placement after an explicit operator request. Uses the same action history and storefront revalidation as the Assets UI.',
                inputSchema: adminAssetStateMutationSchema,
                execute: (input) => updateAdminAssetStates(getDb(), input, actor),
              }),
              reorder_assets: tool({
                description:
                  'Persist an explicit complete ordering for one inspected asset kind (banner, featured-group, or product-card) using the same transaction and storefront revalidation as the Assets UI.',
                inputSchema: assetReorderSchema,
                execute: (input) => reorderAdminAssets(getDb(), input),
              }),
              manage_assets: tool({
                description:
                  'Create, completely replace, or delete one exact banner, featured group, or product card through the same canonical mutation, selection-sync, action-history, ordering, and storefront-revalidation workflows as the Assets UI. Resolve product, brand, and category IDs first. Replacement data is complete, so preserve every inspected field the operator did not ask to change.',
                inputSchema: adminAiAssetCrudSchema,
                execute: (input) => manageAdminAiAsset(input, actor),
              }),
            }
          : {}),
        ...(proposalScopes.length > 0
          ? {
              inspect_ai_proposals: tool({
                description:
                  'Read pending AI proposals from the canonical proposal inbox. Results are server-scoped to the product, taxonomy, and asset domains the operator is permitted to manage.',
                inputSchema: z.object({
                  proposalIds: z.array(z.number().int().positive()).max(100).default([]),
                  query: z.string().trim().max(120).default(''),
                  limit: z.number().int().min(1).max(50).default(20),
                }),
                execute: ({ proposalIds, query, limit }) =>
                  inspectAdminProposals({
                    scopes: proposalScopes,
                    proposalIds,
                    query,
                    limit,
                  }),
              }),
              review_ai_proposals: tool({
                description:
                  'Approve or reject exact proposals only after inspecting them and receiving an explicit operator decision. Each proposal is re-authorized against its product, taxonomy, or asset domain; approvals use the same conflict checks, verified writes, cache refresh, and storefront refresh as the proposal inbox.',
                inputSchema: adminAiProposalReviewSchema,
                execute: (input) => reviewAdminAiProposals(input, actor, permissions),
              }),
              delete_expired_ai_proposals: tool({
                description:
                  'Delete exact inspected proposals only when each remains pending and expired, after an explicit operator request. Every proposal is re-authorized against its product, taxonomy, or asset domain immediately before deletion; active or already-reviewed proposals are preserved and reported as failures.',
                inputSchema: adminAiExpiredProposalDeletionSchema,
                execute: (input) => deleteExpiredAdminAiProposals(input, permissions),
              }),
            }
          : {}),
        inspect_bulletin: tool({
          description:
            'Read recent or matching posts from the shared Bulletin service with complete authors, emails, attachments, replies, reactions, and reaction identities.',
          inputSchema: z.object({
            query: z.string().trim().max(200).default(''),
            limit: z.number().int().min(1).max(50).default(20),
          }),
          execute: ({ query, limit }) =>
            inspectAdminBulletin({
              query,
              limit,
              viewer: {
                userId: session?.user?.id ?? null,
                permissions,
              },
            }),
        }),
        create_bulletin_post: tool({
          description:
            'Create a text post in the canonical shared Bulletin after an explicit operator request. Uses the current operator as author, records normal action history, normalizes tags, and permits pinning only when their live permissions allow it.',
          inputSchema: adminAiBulletinPostSchema,
          execute: (input) =>
            createAdminAiBulletinPost(input, {
              id: session?.user?.id,
              email: actorId,
              name: actor.name?.trim() || actorId,
              permissions,
            }),
        }),
        reply_bulletin_post: tool({
          description:
            'Reply to one exact inspected Bulletin post after an explicit operator request. Uses the current operator as author and records normal action history.',
          inputSchema: adminAiBulletinReplySchema,
          execute: (input) =>
            replyToAdminAiBulletinPost(input, {
              id: session?.user?.id,
              email: actorId,
              name: actor.name?.trim() || actorId,
              permissions,
            }),
        }),
        set_bulletin_reaction: tool({
          description:
            'Idempotently add or remove one native Bulletin reaction on an exact inspected post or reply after an explicit operator request. Uses the current operator identity, the same six UI emoji choices, and canonical action history. If the desired state already exists, it returns changed false instead of toggling to the opposite state.',
          inputSchema: adminAiBulletinReactionSchema,
          execute: (input) =>
            setAdminAiBulletinReaction(input, {
              id: session?.user?.id,
              email: actorId,
              name: actor.name?.trim() || actorId,
              permissions,
            }),
        }),
        update_bulletin_post: tool({
          description:
            'Edit or pin/unpin one exact inspected Bulletin post after an explicit operator request. Omitted title, body, tags, and pinned fields are preserved; ownership and bulletin_moderate permissions, tag normalization, attachment preservation, and action history match the Bulletin UI.',
          inputSchema: adminAiBulletinPostUpdateSchema,
          execute: (input) =>
            updateAdminAiBulletinPost(input, {
              id: session?.user?.id,
              email: actorId,
              name: actor.name?.trim() || actorId,
              permissions,
            }),
        }),
        delete_bulletin_content: tool({
          description:
            'Delete one exact inspected Bulletin post or reply only after an explicit operator request. Uses the same ownership or bulletin_moderate authorization, dependent cleanup, and action history as the Bulletin UI.',
          inputSchema: adminAiBulletinDeleteSchema,
          execute: (input) =>
            deleteAdminAiBulletinContent(input, {
              id: session?.user?.id,
              email: actorId,
              name: actor.name?.trim() || actorId,
              permissions,
            }),
        }),
        ...(hasPermission(permissions, 'settings_manage')
          ? {
              inspect_administration: tool({
                description:
                  'Read the canonical role and access configuration with complete staff identities, emails, roles, permissions, and access grants.',
                inputSchema: z.object({}),
                execute: inspectAdminAdministration,
              }),
              inspect_action_history: tool({
                description:
                  'Read the native Administration action-history ledger using its current filters or exact action-log IDs. Returns actors, resources, entities, operations, semantic field changes, applied/undone state, and the currently valid permission-aware undo/redo direction. Use this before any recovery and never infer reversibility from the operation name alone.',
                inputSchema: adminAiActionHistoryInspectionSchema,
                execute: (input) => inspectAdminAiActionHistory(input, permissions),
              }),
              recover_action_history: tool({
                description:
                  'Undo or redo exact inspected action-log IDs after an explicit operator request. Revalidates domain permission, reversibility, entity history ordering, and current state immediately before each recovery; uses the canonical transactional history engine; reloads persisted results; and preserves every per-action conflict or failure.',
                inputSchema: adminAiActionHistoryRecoverySchema,
                execute: (input) => recoverAdminAiActionHistory(input, { permissions, actor }),
              }),
              set_access_grant: tool({
                description:
                  'Create or update one exact staff access grant after an explicit operator request. Assign either built-in viewer/employee access or one custom roleDefinitionId resolved from inspect_administration; canonical privileged bootstrap accounts remain code-managed.',
                inputSchema: adminAiAccessGrantSchema,
                execute: (input) => setAdminAiAccessGrant(input, actor),
              }),
              revoke_access_grants: tool({
                description:
                  'Revoke up to 20 exact access-grant IDs only after inspecting Administration and receiving an explicit operator request. Uses the same canonical deletion and action-history workflow as the Users workspace; reports every revoked identity and every missing or code-managed privileged failure.',
                inputSchema: adminAiAccessRevocationSchema,
                execute: (input) => revokeAdminAiAccessGrants(input, actor),
              }),
              set_role_definition: tool({
                description:
                  'Create a custom role or update one exact roleDefinitionId after inspecting administration. Requires the complete name, optional description, and permission set, and uses the same slug normalization, uniqueness checks, permission replacement, and action history as the Administration UI.',
                inputSchema: adminAiRoleDefinitionSchema,
                execute: (input) => setAdminAiRoleDefinition(input, actor),
              }),
              inspect_storefront_configuration: tool({
                description:
                  'Read the complete storefront contact settings, AI configuration, localized announcement bar, and environment-configured storefront model choices.',
                inputSchema: z.object({}),
                execute: inspectAdminStorefrontConfiguration,
              }),
              update_storefront_settings: tool({
                description:
                  'Directly update explicit storefront contact phone/email, address, map URL, Facebook URL, assistant enabled state, primary model, or fallback model after inspection and an explicit operator request. Supply one field/value operation per requested setting; null clears nullable fields. Every omitted setting is preserved, model IDs are checked against configured choices, and the public storefront is revalidated.',
                inputSchema: storefrontSettingsToolSchema,
                execute: updateAdminStorefrontSettingsFromTool,
              }),
              update_storefront_announcement: tool({
                description:
                  'Directly update the French and Arabic storefront announcement bar after an explicit operator request, then revalidate public storefront content.',
                inputSchema: storefrontAnnouncementMutationSchema,
                execute: (input) => updateAdminStorefrontAnnouncement(input, actor.email),
              }),
            }
          : {}),
        ...(hasPermission(permissions, 'products_write')
          ? {
              generate_product_content: tool({
                description:
                  'Create reviewable product-content proposals. Explicit scopes of at most 20 products may run inline; any larger explicit scope and every catalog-wide missing-content scope runs as one resumable background job. Use all_missing for requests such as adding Arabic titles to every active product missing one.',
                inputSchema: z.object({
                  scope: z.enum(['explicit', 'all_missing']),
                  productIds: z.array(z.number().int().positive()).max(500).default([]),
                  fields: z.array(productContentFieldSchema).min(1),
                  context: z.string().trim().max(2_000).optional(),
                }),
                execute: async ({ scope, productIds, fields, context }) => {
                  if (scope === 'explicit' && productIds.length === 0)
                    return { error: 'At least one resolved product is required.' };
                  if (scope === 'explicit' && productIds.length <= ADMIN_AI_INLINE_PRODUCT_LIMIT) {
                    const proposals = [];
                    for (const productId of productIds) {
                      proposals.push(
                        await proposeProductContent({
                          productId,
                          fields,
                          adminContext: context,
                          actorId: actor.email,
                        }),
                      );
                    }
                    return { kind: 'proposals', proposals };
                  }
                  const started = await startAiContentJob(actor.email ?? 'unknown-admin', {
                    productIds: scope === 'all_missing' ? null : productIds,
                    fields,
                    onlyMissing: scope === 'all_missing',
                    autoApply:
                      parsed.data.autoAcceptProposals &&
                      hasPermission(permissions, 'products_write'),
                    conversationId: conversation.id,
                    context,
                    actor,
                  });
                  return started;
                },
              }),
              get_product_content_job_status: tool({
                description:
                  'Retrieve the current user’s latest AI product-content job status, progress, error, and reconciled result summary. Use this whenever the user asks to check a bulk title or description task.',
                inputSchema: z.object({}),
                execute: () =>
                  getLatestExportJob(ADMIN_AI_CONTENT_QUEUE, actor.email ?? 'unknown-admin'),
              }),
            }
          : {}),
        ...(hasPermission(permissions, 'analytics_manage')
          ? {
              query_analytics: tool({
                description: ADMIN_AI_ANALYTICS_TOOL_DESCRIPTION,
                inputSchema: adminAiAnalyticsQuerySchemaForPlan(analyticsPlan),
                execute: async (input) => {
                  const queries = analyticsPlan
                    ? adminAiAnalyticsQueriesForPlan(input, analyticsPlan)
                    : [input];
                  return queryAdminAnalyticsInvestigation(
                    queries,
                    analyticsPlan?.reason ?? 'Canonical Analytics query.',
                    queryAdminAnalytics,
                  );
                },
              }),
              update_analytics_settings: tool({
                description:
                  'Persist explicit changes to the canonical Analytics planning return rate, DZD/EUR FX rate, or Friday-rest activation date. The server preserves every omitted setting and refreshes materialized facts. Use only after query_analytics has shown the current assumptions and only for an explicit operator request.',
                inputSchema: adminAiAnalyticsSettingsPatchSchemaForMessage(parsed.data.message),
                execute: (input) => updateAdminAiAnalyticsSettings(input),
              }),
              manage_analytics_costs: tool({
                description:
                  'Create, partially update, or delete exact canonical operating-cost records. Updates preserve omitted fields and every operation returns persisted or not-found evidence. Use IDs from the assumptions operating_costs query and only after an explicit operator request.',
                inputSchema: adminAiAnalyticsCostsMutationSchemaForMessage(parsed.data.message),
                execute: (input) => manageAdminAiAnalyticsCosts(input),
              }),
              manage_analytics_day_overrides: tool({
                description:
                  'Persist or reset exact calculator-day overrides for gross profit, planning return rate, confirmed orders, and operator note. Omitted fields stay unchanged; null clears an explicitly named manual value. Use only after an explicit operator request.',
                inputSchema: adminAiAnalyticsDayOverridesMutationSchemaForMessage(
                  parsed.data.message,
                ),
                execute: (input) => manageAdminAiAnalyticsDayOverrides(input),
              }),
              sync_analytics_source: tool({
                description:
                  'Synchronize an explicit Meta or Search Console date range through the same canonical integrations used by Analytics. Meta ranges are capped at 90 days. Starting this tool is the synchronous source operation itself; report its returned source result and never imply unavailable tails became zero.',
                inputSchema: adminAiAnalyticsSyncSchemaForContext(
                  parsed.data.message,
                  parsed.data.context?.section,
                ),
                execute: (input) => syncAdminAiAnalyticsSource(input),
              }),
            }
          : {}),
        ...(allowedJobTypeSchema
          ? {
              list_background_jobs: tool({
                description: `List recent background jobs only from the operator's permitted domains (${allowedJobTypes.join(', ')}), including persisted status, progress, errors, and result summaries.`,
                inputSchema: z.object({ limit: z.number().int().min(1).max(100).default(30) }),
                execute: ({ limit }) => listAdminBackgroundJobs(limit, allowedJobTypes),
              }),
              get_background_job: tool({
                description:
                  'Retrieve one exact permitted background job by registered type and job ID. Use this to verify progress or completion instead of inferring from domain records.',
                inputSchema: z.object({
                  type: allowedJobTypeSchema,
                  jobId: z.string().uuid(),
                }),
                execute: ({ type, jobId }) => getAdminBackgroundJob(type, jobId),
              }),
              stop_background_job: tool({
                description:
                  'Request cooperative cancellation of one exact queued/running job after the user explicitly asks to stop it. The tool refuses job types whose workers cannot safely honor cancellation.',
                inputSchema: z.object({
                  type: allowedJobTypeSchema,
                  jobId: z.string().uuid(),
                }),
                execute: ({ type, jobId }) => cancelAdminBackgroundJob(type, jobId),
              }),
              ...(allowedStartableJobTypeSchema
                ? {
                    start_background_job: tool({
                      description: `Start a permitted operational background job only after the user explicitly requests it. Available types: ${allowedStartableJobTypes.join(', ')}. Starting a job is not completion.`,
                      inputSchema: z.object({
                        type: allowedStartableJobTypeSchema,
                        orderMode: z.enum(['selected', 'confirmed']).optional(),
                        orderIds: z.array(z.number().int().positive()).max(500).optional(),
                      }),
                      execute: ({ type, orderMode, orderIds }) =>
                        startAdminBackgroundJob({
                          type,
                          orderMode,
                          orderIds,
                          conversationId: conversation.id,
                          actor: { email: actorId, name: actor.name },
                        }),
                    }),
                  }
                : {}),
            }
          : {}),
        ...(hasPermission(permissions, 'products_write')
          ? {
              suggest_discount: tool({
                description: 'Create a reviewable margin-safe product discount proposal.',
                inputSchema: z.object({
                  productId: z.number().int().positive(),
                  percentOff: z.number().positive().max(90),
                  minimumMargin: z.number().min(0).max(0.95).optional(),
                }),
                execute: (input) => proposeDiscount({ ...input, actorId: actor.email }),
              }),
            }
          : {}),
        ...(hasPermission(permissions, 'assets_write')
          ? {
              suggest_featured_products: tool({
                description:
                  'Create a reviewable inactive featured product group using deterministic performance ranking.',
                inputSchema: z.object({
                  name: z.string().trim().min(1).max(120),
                  limit: z.number().int().min(1).max(30).default(8),
                }),
                execute: (input) => proposeFeaturedProducts({ ...input, actorId: actor.email }),
              }),
            }
          : {}),
        ...(hasPermission(permissions, 'assets_write')
          ? {
              suggest_landing_page: tool({
                description:
                  'Create a distinct, conversion-focused landing-page document for review, grounded in verified product data and registered performance-bounded blocks. Price, stock, assets, and technical claims remain protected.',
                inputSchema: z.object({
                  productId: z.number().int().positive(),
                  locale: z.enum(['fr', 'ar']),
                  campaignAngle: z.string().trim().max(2_000).optional(),
                }),
                execute: (input) => proposeLandingPage({ ...input, actorId: actor.email }),
              }),
            }
          : {}),
        ...(hasPermission(permissions, 'products_write')
          ? {
              categorize_catalog: tool({
                description:
                  'Start one resumable background job that classifies every in-scope active product against the complete active category taxonomy and creates reviewable category-change proposals. Use this instead of find_products when the user asks to categorize all or many products. Queuing the job is not completion and does not apply changes.',
                inputSchema: z.object({
                  scope: z.enum(['all_active', 'uncategorized']).default('all_active'),
                  confidenceThreshold: z.number().min(0.5).max(0.99).default(0.75),
                  batchSize: z.number().int().min(1).max(100).default(25),
                  context: z.string().trim().max(2_000).optional(),
                }),
                execute: (input) =>
                  startAiCategorizationJob(actor.email ?? 'unknown-admin', {
                    ...input,
                    autoApply:
                      parsed.data.autoAcceptProposals &&
                      hasPermission(permissions, 'products_write'),
                    conversationId: conversation.id,
                    actor,
                  }),
              }),
              get_catalog_categorization_status: tool({
                description:
                  "Retrieve the current user's latest catalog-categorization job status, progress, error, and reconciled result summary. Use this whenever the user asks to check, poll, or report the outcome of a catalog categorization job. A queued or running job is not complete.",
                inputSchema: z.object({}),
                execute: () =>
                  getLatestExportJob(ADMIN_AI_CATEGORIZATION_QUEUE, actor.email ?? 'unknown-admin'),
              }),
              propose_product_edit: tool({
                description:
                  'Create a reviewable product edit for content, activation, stock status, brand assignment, or category assignment. Price and inventory quantity are protected by dedicated workflows.',
                inputSchema: z.object({
                  productId: z.number().int().positive(),
                  changes: AI_CATALOG_EDIT_FIELDS.products,
                }),
                execute: ({ productId, changes }) =>
                  proposeEntityEdit({
                    entityType: 'products',
                    entityId: productId,
                    changes,
                    actorId: actor.email,
                  }),
              }),
            }
          : {}),
        ...(hasPermission(permissions, 'brands_categories_write')
          ? {
              propose_brand_edit: tool({
                description:
                  'Create a reviewable brand edit. Supports name, image, active/draft status, and featured status. Resolve the brand with find_brands first.',
                inputSchema: z.object({
                  brandId: z.number().int().positive(),
                  changes: AI_CATALOG_EDIT_FIELDS.brands,
                }),
                execute: ({ brandId, changes }) =>
                  proposeEntityEdit({
                    entityType: 'brands',
                    entityId: brandId,
                    changes,
                    actorId: actor.email,
                  }),
              }),
              propose_category_edit: tool({
                description:
                  'Create a reviewable category edit. Supports localized names, image, active/draft status, featured status, and parent hierarchy. Resolve the category and any parent with find_categories first.',
                inputSchema: z.object({
                  categoryId: z.number().int().positive(),
                  changes: AI_CATALOG_EDIT_FIELDS.categories,
                }),
                execute: ({ categoryId, changes }) =>
                  proposeEntityEdit({
                    entityType: 'categories',
                    entityId: categoryId,
                    changes,
                    actorId: actor.email,
                  }),
              }),
              propose_brand_create: tool({
                description:
                  'Create a reviewable proposal for a new brand. Approval creates it as an inactive draft.',
                inputSchema: AI_TAXONOMY_CREATE_FIELDS.brands,
                execute: (values) =>
                  proposeTaxonomyCreate({ entityType: 'brands', values, actorId: actor.email }),
              }),
              propose_category_create: tool({
                description:
                  'Create a reviewable proposal for a new category. Resolve an optional parent with find_categories first. Approval creates it as an inactive draft.',
                inputSchema: AI_TAXONOMY_CREATE_FIELDS.categories,
                execute: (values) =>
                  proposeTaxonomyCreate({ entityType: 'categories', values, actorId: actor.email }),
              }),
            }
          : {}),
      },
    });

    const encoder = new TextEncoder();
    const responseStream = new ReadableStream<Uint8Array>({
      start(controller) {
        const write = (event: AdminAiChatStreamEvent) => {
          controller.enqueue(
            encoder.encode(`${JSON.stringify(adminAiChatStreamEventSchema.parse(event))}\n`),
          );
        };
        write({ type: 'status', status: 'thinking' });
        void (async () => {
          let text = '';
          const toolResults: unknown[] = [];
          const toolTraces = new Map<string, ToolTrace>();
          let anonymousToolCall = 0;
          let emptyStreamRetryCount = 0;
          let usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number } = {};
          try {
            while (true) {
              try {
                for await (const part of createResult().stream) {
                  if (part.type === 'tool-call') {
                    const toolCallId = part.toolCallId || `${part.toolName}:${anonymousToolCall++}`;
                    toolTraces.set(toolCallId, {
                      toolCallId,
                      toolName: part.toolName,
                      status: 'running',
                      input: part.input,
                      startedAt: new Date(),
                    });
                    write({
                      type: 'status',
                      status: 'working',
                      toolName: part.toolName,
                      phase: 'running',
                    });
                  }
                  if (part.type === 'tool-result') {
                    toolResults.push(part);
                    const completedAt = new Date();
                    const current = toolTraces.get(part.toolCallId);
                    toolTraces.set(part.toolCallId, {
                      toolCallId: part.toolCallId,
                      toolName: part.toolName,
                      status: 'completed',
                      input: part.input,
                      output: part.output,
                      startedAt: current?.startedAt ?? completedAt,
                      completedAt,
                    });
                    write({
                      type: 'status',
                      status: 'working',
                      toolName: part.toolName,
                      phase: 'completed',
                    });
                  }
                  if (part.type === 'tool-error') {
                    const completedAt = new Date();
                    const current = toolTraces.get(part.toolCallId);
                    toolTraces.set(part.toolCallId, {
                      toolCallId: part.toolCallId,
                      toolName: part.toolName,
                      status: 'failed',
                      input: part.input,
                      errorCode: toolErrorCode(part.error),
                      startedAt: current?.startedAt ?? completedAt,
                      completedAt,
                    });
                    write({
                      type: 'status',
                      status: 'working',
                      toolName: part.toolName,
                      phase: 'failed',
                    });
                  }
                  if (part.type === 'text-delta' && part.text) {
                    text += part.text;
                    write({ type: 'text-delta', delta: part.text });
                  }
                  if (part.type === 'finish') usage = part.totalUsage;
                  if (part.type === 'error') throw part.error;
                }
                break;
              } catch (error) {
                const canRetryWithoutRepeatingWork =
                  !request.signal.aborted &&
                  emptyStreamRetryCount === 0 &&
                  text.length === 0 &&
                  toolTraces.size === 0;
                if (!canRetryWithoutRepeatingWork) throw error;
                emptyStreamRetryCount += 1;
              }
            }
            if (!text.trim()) {
              text = 'Completed.';
              write({ type: 'text-delta', delta: text });
            }
            const [assistantMessages] = await Promise.all([
              db
                .insert(aiMessages)
                .values({
                  conversationId: conversation.id,
                  role: 'assistant',
                  content: { text, toolResults },
                })
                .returning({ id: aiMessages.id }),
              db
                .update(aiConversations)
                .set({ updatedAt: new Date() })
                .where(eq(aiConversations.id, conversation.id)),
            ]);
            if (runId !== null) {
              const completedRunId = runId;
              const completedAt = new Date();
              try {
                await db
                  .update(aiRuns)
                  .set({ status: 'completed', ...usage, completedAt })
                  .where(eq(aiRuns.id, completedRunId));
                if (toolTraces.size > 0) {
                  await db.insert(aiToolCalls).values(
                    [...toolTraces.values()].map((trace) => ({
                      runId: completedRunId,
                      toolName: trace.toolName,
                      status: trace.status,
                      input: trace.input,
                      output: trace.output,
                      errorCode: trace.errorCode,
                      startedAt: trace.startedAt,
                      completedAt: trace.completedAt ?? completedAt,
                    })),
                  );
                }
              } catch {
                // AI telemetry must never replace a successful assistant response.
              }
            }
            write({
              type: 'result',
              toolResults,
              conversation: {
                id: conversation.id,
                sessionKey: parsed.data.conversationKey,
                title: effectiveTitle,
              },
              messageId: assistantMessages[0].id,
            });
          } catch (error) {
            if (runId !== null) {
              const cancelled =
                request.signal.aborted || (error instanceof Error && error.name === 'AbortError');
              const completedAt = new Date();
              await Promise.all([
                db
                  .update(aiRuns)
                  .set({
                    status: cancelled ? 'cancelled' : 'failed',
                    errorCode: cancelled ? 'request_aborted' : toolErrorCode(error),
                    completedAt,
                  })
                  .where(eq(aiRuns.id, runId)),
                toolTraces.size > 0
                  ? db.insert(aiToolCalls).values(
                      [...toolTraces.values()].map((trace) => ({
                        runId: runId as number,
                        toolName: trace.toolName,
                        status:
                          trace.status === 'running'
                            ? cancelled
                              ? 'cancelled'
                              : 'failed'
                            : trace.status,
                        input: trace.input,
                        output: trace.output,
                        errorCode:
                          trace.errorCode ??
                          (trace.status === 'running'
                            ? cancelled
                              ? 'request_aborted'
                              : toolErrorCode(error)
                            : undefined),
                        startedAt: trace.startedAt,
                        completedAt: trace.completedAt ?? completedAt,
                      })),
                    )
                  : Promise.resolve(),
              ]).catch(() => undefined);
            }
            if (!request.signal.aborted)
              write({
                type: 'error',
                code: 'admin_ai_failed',
                ...(toolResults.length > 0 ? { toolResults } : {}),
              });
          } finally {
            controller.close();
          }
        })();
      },
    });
    return new NextResponse(responseStream, {
      headers: {
        'cache-control': 'no-cache, no-transform',
        'content-type': 'application/x-ndjson; charset=utf-8',
        'x-accel-buffering': 'no',
      },
    });
  } catch (error) {
    if (runId !== null) {
      const cancelled =
        request.signal.aborted || (error instanceof Error && error.name === 'AbortError');
      await getDb()
        .update(aiRuns)
        .set({
          status: cancelled ? 'cancelled' : 'failed',
          errorCode: cancelled
            ? 'request_aborted'
            : error instanceof Error
              ? error.name
              : 'UnknownError',
          completedAt: new Date(),
        })
        .where(eq(aiRuns.id, runId))
        .catch(() => undefined);
    }
    if (
      error instanceof Error &&
      (error.message === 'AI is disabled' || error.message.includes('is not configured'))
    ) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    return NextResponse.json({ error: 'Admin AI chat failed.' }, { status: 502 });
  }
}
