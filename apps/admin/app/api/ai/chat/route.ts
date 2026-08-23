import { createAiLanguageModel, getAiConfig, productContentFieldSchema } from '@bric/ai-core';
import { stepCountIs, streamText, tool } from 'ai';
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
import { queryAdminAnalytics } from '../../../../lib/ai-analytics';
import {
  findAdminBrands,
  findAdminCategories,
  findAdminProducts,
  inspectAdminAdministration,
  inspectAdminAssets,
  inspectAdminBulletin,
  inspectAdminInventory,
  inspectAdminOrders,
  inspectAdminProposals,
} from '../../../../lib/admin-ai-domain';
import {
  adminAiCapabilityInstructions,
  adminAiContextMessage,
} from '../../../../lib/admin-ai-capabilities';
import { adminAiSurfaceContextSchema } from '../../../../lib/admin-ai-context';
import { analytics2QuerySchema } from '../../../../lib/analytics2';
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
  ADMIN_AI_DEFAULT_MODEL,
  ADMIN_AI_DEFAULT_REASONING_EFFORT,
  adminAiModelIdSchema,
  adminAiReasoningEffortSchema,
  resolveAdminAiModel,
  supportsAdminAiReasoningEffort,
} from '../../../../lib/admin-ai-models';

const requestSchema = z
  .object({
    message: z.string().trim().min(1).max(4_000),
    conversationKey: z.uuid(),
    context: adminAiSurfaceContextSchema.optional(),
    autoAcceptProposals: z.boolean().optional().default(false),
    model: adminAiModelIdSchema.optional().default(ADMIN_AI_DEFAULT_MODEL),
    reasoningEffort: adminAiReasoningEffortSchema
      .optional()
      .default(ADMIN_AI_DEFAULT_REASONING_EFFORT),
  })
  .refine((input) => supportsAdminAiReasoningEffort(input.model, input.reasoningEffort), {
    message: 'The selected reasoning effort is not supported by this model.',
    path: ['reasoningEffort'],
  });

export const ADMIN_AI_CHAT_PROMPT_VERSION = 'admin-chat-v2';
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

function storedMessageText(content: unknown) {
  if (typeof content === 'string') return content;
  if (
    content &&
    typeof content === 'object' &&
    typeof (content as { text?: unknown }).text === 'string'
  ) {
    return (content as { text: string }).text;
  }
  return null;
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
    const allowedStartableJobTypes = allowedStartableAdminBackgroundJobTypes(permissions);
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
      .limit(20);
    const previousMessages = previousRows
      .reverse()
      .flatMap((row): Array<{ role: 'user' | 'assistant'; content: string }> => {
        const content = storedMessageText(row.content);
        return content && (row.role === 'user' || row.role === 'assistant')
          ? [{ role: row.role, content }]
          : [];
      });
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
    const result = streamText({
      model: createAiLanguageModel(config, 'admin', {
        model: selectedModel.model,
        openRouterRequestBody: selectedModel.openRouterRequestBody,
      }),
      instructions: parsed.data.context
        ? `${ADMIN_AI_CHAT_INSTRUCTIONS} ${adminAiCapabilityInstructions(parsed.data.context, permissions)}`
        : ADMIN_AI_CHAT_INSTRUCTIONS,
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
      abortSignal: request.signal,
      stopWhen: stepCountIs(6),
      tools: {
        ...(hasAnyPermission(permissions, productLookupPermissions)
          ? {
              find_products: tool({
                description:
                  'Read catalog products through the canonical product option service. Resolve either exact IDs from the current selection or a title, SKU, or barcode search; results include pagination totals and are not limited to an arbitrary catalog subset.',
                inputSchema: z
                  .object({
                    query: z.string().trim().max(200).default(''),
                    productIds: z.array(z.number().int().positive()).max(100).default([]),
                    page: z.number().int().positive().default(1),
                    limit: z.number().int().min(1).max(50).default(10),
                  })
                  .refine((input) => input.query.length > 0 || input.productIds.length > 0, {
                    message: 'Provide a search query or at least one product ID.',
                  }),
                execute: findAdminProducts,
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
            }
          : {}),
        ...(hasPermission(permissions, 'products_write')
          ? {
              inspect_inventory: tool({
                description:
                  'Read the canonical Inventory workspace by current product IDs, barcode, SKU, or title, including real quantities and availability state.',
                inputSchema: z.object({
                  productIds: z.array(z.number().int().positive()).max(100).default([]),
                  query: z.string().trim().max(200).default(''),
                  page: z.number().int().positive().default(1),
                  limit: z.number().int().min(1).max(50).default(20),
                }),
                execute: inspectAdminInventory,
              }),
            }
          : {}),
        ...(hasPermission(permissions, 'assets_write')
          ? {
              inspect_assets: tool({
                description:
                  'Read current banners, featured groups, and product cards through the canonical Assets service before suggesting merchandising changes.',
                inputSchema: z.object({
                  kind: z.enum(['all', 'banners', 'featuredGroups', 'productCards']).default('all'),
                  ids: z.array(z.number().int().positive()).max(100).default([]),
                  limit: z.number().int().min(1).max(50).default(20),
                }),
                execute: inspectAdminAssets,
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
        ...(hasPermission(permissions, 'settings_manage')
          ? {
              inspect_administration: tool({
                description:
                  'Read the canonical role and access configuration with complete staff identities, emails, roles, permissions, and access grants.',
                inputSchema: z.object({}),
                execute: inspectAdminAdministration,
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
                description:
                  'Read the canonical Analytics workspace. Choose command, money, acquisition, fulfillment, storefront, search, catalog, or assumptions; use the same range and grain controls as the UI. Every metric includes its canonical previous-period value and change when available. Raw SQL is never accepted.',
                inputSchema: analytics2QuerySchema,
                execute: queryAdminAnalytics,
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
          let usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number } = {};
          try {
            for await (const part of result.stream) {
              if (part.type === 'tool-call') {
                const toolCallId = part.toolCallId || `${part.toolName}:${anonymousToolCall++}`;
                toolTraces.set(toolCallId, {
                  toolCallId,
                  toolName: part.toolName,
                  status: 'running',
                  input: part.input,
                  startedAt: new Date(),
                });
                write({ type: 'status', status: 'working' });
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
              }
              if (part.type === 'text-delta' && part.text) {
                text += part.text;
                write({ type: 'text-delta', delta: part.text });
              }
              if (part.type === 'finish') usage = part.totalUsage;
              if (part.type === 'error') throw part.error;
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
            if (!request.signal.aborted) write({ type: 'error', code: 'admin_ai_failed' });
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
