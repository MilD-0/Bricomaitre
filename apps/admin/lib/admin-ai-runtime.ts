import { z } from 'zod';

import { ADMIN_AI_STATS_SEMANTIC_CONTRACT } from './admin-ai-ai-stats';
import { ADMIN_AI_CATALOG_KNOWLEDGE } from './admin-ai-catalog-knowledge';
import { ADMIN_AI_ORDERS_KNOWLEDGE } from './admin-ai-orders-knowledge';
import {
  ADMIN_AI_ANALYTICS_SEMANTIC_CONTRACT,
  ADMIN_AI_ANALYTICS_PROFIT_KNOWLEDGE,
} from './admin-ai-analytics-contract';
import { ADMIN_AI_CORE_INSTRUCTIONS } from './admin-ai-core-instructions';
import { adminAiOperatorVoiceInstructions } from './admin-ai-operator-voice';
import {
  ADMIN_AI_DEFAULT_MODEL,
  adminAiModelIdSchema,
  adminAiReasoningEffortSchema,
  getDefaultAdminAiReasoningEffort,
  supportsAdminAiReasoningEffort,
} from './admin-ai-models';
import { adminAiSurfaceContextSchema } from './admin-ai-context';
import { dayInTimezone } from './analytics/date-range';

export const ADMIN_AI_CHAT_PROMPT_VERSION = 'admin-chat-model-led-v6';

export const adminAiChatRequestSchema = z
  .object({
    message: z.string().trim().min(1).max(4_000),
    conversationKey: z.uuid(),
    context: adminAiSurfaceContextSchema.optional(),
    autoAcceptProposals: z.boolean().optional().default(false),
    model: adminAiModelIdSchema.optional().default(ADMIN_AI_DEFAULT_MODEL),
    reasoningEffort: adminAiReasoningEffortSchema.optional(),
  })
  .strict()
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

const ADMIN_AI_GUIDANCE_TOPIC_VALUES = [
  'analytics_profit',
  'analytics_order_lifecycle',
  'analytics_sources_and_coverage',
  'analytics_dates_and_comparisons',
  'analytics_storefront_and_attribution',
  'ai_stats_operations',
  'ai_stats_shopping',
  'catalog',
  'orders',
  'storefront',
  'assets',
  'landing_pages',
] as const;

export type AdminAiGuidanceTopic = (typeof ADMIN_AI_GUIDANCE_TOPIC_VALUES)[number];

export function adminAiGuidanceRequestSchemaForTopics(
  topics: readonly [AdminAiGuidanceTopic, ...AdminAiGuidanceTopic[]],
) {
  return z
    .object({
      topics: z
        .array(z.enum(topics))
        .min(1)
        .max(topics.length)
        .describe('Application-owned topics relevant to the operator’s question.'),
    })
    .strict();
}

export const adminAiGuidanceRequestSchema = adminAiGuidanceRequestSchemaForTopics(
  ADMIN_AI_GUIDANCE_TOPIC_VALUES,
);

export const ADMIN_AI_GUIDANCE_TOOL_DESCRIPTION = [
  'Read concise implementation-backed Bricomaitre definitions and interpretation boundaries.',
  'This returns system knowledge, not current business state. Select the relevant topics and combine it with live evidence when useful.',
].join(' ');

const guidanceByTopic = {
  analytics_profit: {
    owner: 'Analytics economics engine',
    facts: ADMIN_AI_ANALYTICS_PROFIT_KNOWLEDGE,
  },
  analytics_order_lifecycle: {
    owner: 'Analytics order and EcoTrack lifecycle',
    facts: {
      lifecycle: ADMIN_AI_ANALYTICS_SEMANTIC_CONTRACT.lifecycle,
      returnPolicy: ADMIN_AI_ANALYTICS_SEMANTIC_CONTRACT.returnPolicy,
    },
  },
  analytics_sources_and_coverage: {
    owner: 'Analytics source and estimation contract',
    facts: {
      sourcePrecedence: ADMIN_AI_ANALYTICS_SEMANTIC_CONTRACT.sourcePrecedence,
      availability: ADMIN_AI_ANALYTICS_SEMANTIC_CONTRACT.availability,
      missingCosts: ADMIN_AI_ANALYTICS_SEMANTIC_CONTRACT.missingCosts,
      materializedFacts: ADMIN_AI_ANALYTICS_SEMANTIC_CONTRACT.materializedFacts,
    },
  },
  analytics_dates_and_comparisons: {
    owner: 'Analytics time and comparison contract',
    facts: {
      timezone: ADMIN_AI_ANALYTICS_SEMANTIC_CONTRACT.timezone,
      dateBases: ADMIN_AI_ANALYTICS_SEMANTIC_CONTRACT.dateBases,
      fridayAccounting: ADMIN_AI_ANALYTICS_SEMANTIC_CONTRACT.fridayAccounting,
      availability: ADMIN_AI_ANALYTICS_SEMANTIC_CONTRACT.availability,
      projection: ADMIN_AI_ANALYTICS_SEMANTIC_CONTRACT.projection,
    },
  },
  analytics_storefront_and_attribution: {
    owner: 'Analytics Storefront, Meta, and Search interpretation contract',
    facts: {
      storefront: ADMIN_AI_ANALYTICS_SEMANTIC_CONTRACT.storefront,
      metaAttribution: ADMIN_AI_ANALYTICS_SEMANTIC_CONTRACT.metaAttribution,
      interpretation: ADMIN_AI_ANALYTICS_SEMANTIC_CONTRACT.interpretation,
    },
  },
  ai_stats_operations: {
    owner: 'AI Stats operations workspace',
    facts: {
      ...ADMIN_AI_STATS_SEMANTIC_CONTRACT.operations,
      availability: ADMIN_AI_STATS_SEMANTIC_CONTRACT.availability,
    },
  },
  ai_stats_shopping: {
    owner: 'AI Stats shopping workspace',
    facts: {
      ...ADMIN_AI_STATS_SEMANTIC_CONTRACT.shopping,
      availability: ADMIN_AI_STATS_SEMANTIC_CONTRACT.availability,
    },
  },
  catalog: {
    owner: 'Catalog system',
    facts: ADMIN_AI_CATALOG_KNOWLEDGE,
  },
  orders: {
    owner: 'Orders and EcoTrack system',
    facts: ADMIN_AI_ORDERS_KNOWLEDGE,
  },
  storefront: {
    owner: 'Storefront configuration',
    facts: {
      phone:
        'Storefront phone support stays enabled; contactPhone changes the customer-facing number.',
      assistant:
        'Storefront AI models must be selected from the configured model choices returned by the configuration read.',
      announcement:
        'An active announcement needs both the French and Arabic messages; both languages share one active state.',
    },
  },
  assets: {
    owner: 'Storefront assets',
    facts: {
      visibility: 'Only active assets appear on Storefront, ordered by sortOrder.',
      featuredGroups:
        'A featured group combines its directly selected products with active products from its selected brands and categories.',
      productCards:
        'Product cards are bilingual editorial cards on the homepage, each tied to one product.',
      recommendation:
        'prioritizeRecommendations gives a featured group’s selected products priority ahead of normal recommendation signals in the Products recommended order.',
    },
  },
  landing_pages: {
    owner: 'Storefront landing pages',
    facts: {
      identity:
        'A product and language may have multiple landing pages. Use the exact page ID and current revision when changing one.',
      publication:
        'New pages are drafts unless published. Revising an active page with publication preserved updates its live revision immediately.',
      storefront:
        'Authored blocks form the campaign; live Storefront product data supplies price, availability, cart controls, and the order form.',
      discovery:
        'Landing pages are non-indexable direct-link campaigns and stay out of Storefront sitemap discovery.',
      structure:
        'Blocks are ordered and have stable IDs. A page must retain one product hero and one final CTA.',
    },
  },
} as const satisfies Record<AdminAiGuidanceTopic, unknown>;

export function readAdminAiGuidance(raw: unknown) {
  const input = adminAiGuidanceRequestSchema.parse(raw);
  return {
    kind: 'admin_system_guidance' as const,
    responseContractVersion: 1 as const,
    topics: [...new Set(input.topics)].map((topic) => ({
      topic,
      ...guidanceByTopic[topic],
    })),
  };
}

export function readAdminAiGuidanceForTopics(
  topics: readonly [AdminAiGuidanceTopic, ...AdminAiGuidanceTopic[]],
  raw: unknown,
) {
  return readAdminAiGuidance(adminAiGuidanceRequestSchemaForTopics(topics).parse(raw));
}

export function adminAiApplicationDate(now = new Date()) {
  return dayInTimezone(now, 'Africa/Algiers');
}

export function adminAiRuntimeInstructions(input: {
  locale: 'en' | 'fr' | 'ar';
  currentDate?: string;
}) {
  return [
    ADMIN_AI_CORE_INSTRUCTIONS,
    `Current application date in Africa/Algiers: ${input.currentDate ?? adminAiApplicationDate()}.`,
    adminAiOperatorVoiceInstructions(input.locale),
  ].join('\n\n');
}

export function adminAiConversationTitle(message: string) {
  const title = message.replace(/\s+/gu, ' ').trim();
  return title.length > 80 ? `${title.slice(0, 77)}…` : title;
}

export function adminAiToolErrorCode(error: unknown) {
  if (error instanceof Error) return error.name || 'Error';
  if (typeof error === 'string' && error.trim()) return error.slice(0, 200);
  return 'UnknownError';
}

export function adminAiReliableAnswerFailure(locale: 'en' | 'fr' | 'ar', hasToolEvidence: boolean) {
  if (locale === 'fr') {
    return hasToolEvidence
      ? 'J’ai récupéré les données de l’application, mais je n’ai pas pu en produire une réponse fiable. Réessayez.'
      : 'Je n’ai pas pu produire une réponse fiable. Réessayez.';
  }
  if (locale === 'ar') {
    return hasToolEvidence
      ? 'استرجعت بيانات التطبيق، لكنني لم أتمكن من صياغة إجابة موثوقة. حاول مرة أخرى.'
      : 'لم أتمكن من صياغة إجابة موثوقة. حاول مرة أخرى.';
  }
  return hasToolEvidence
    ? "I retrieved the application data, but I couldn't produce a reliable answer. Please try again."
    : "I couldn't produce a reliable answer. Please try again.";
}

export function adminAiCompletedMutationNarrationFailure(
  locale: 'en' | 'fr' | 'ar',
  toolResults: unknown[] = [],
) {
  let applied = 0,
    skipped = 0;
  let hasBatch = false;
  for (const result of toolResults) {
    if (!result || typeof result !== 'object') continue;
    const record = result as { toolName?: string; output?: Record<string, unknown> };
    if (
      !record.output ||
      !['adjust_inventory', 'receive_inventory', 'update_inventory_state'].includes(
        record.toolName ?? '',
      )
    )
      continue;
    const receipt = record.output;
    if (!Array.isArray(receipt.items)) continue;
    hasBatch = true;
    applied += receipt.items.length;
    skipped += Array.isArray(receipt.skipped)
      ? receipt.skipped.length
      : Array.isArray(receipt.failed)
        ? receipt.failed.length
        : 0;
  }
  const counts = hasBatch
    ? locale === 'fr'
      ? `${applied} article(s) modifié(s), ${skipped} ignoré(s) ou en échec. `
      : locale === 'ar'
        ? `تم تعديل ${applied} عنصر، وتجاوز أو فشل ${skipped} عنصر. `
        : `${applied} item(s) applied, ${skipped} skipped or failed. `
    : '';
  if (locale === 'fr') {
    return (
      counts +
      'Des modifications ont été enregistrées, mais je n’ai pas pu terminer le compte rendu. Consultez le résultat de chaque action avant de réessayer uniquement les éléments en échec.'
    );
  }
  if (locale === 'ar') {
    return (
      counts +
      'تم حفظ تغييرات، لكنني لم أتمكن من إكمال التقرير. راجع نتيجة كل إجراء قبل إعادة محاولة العناصر التي فشلت فقط.'
    );
  }
  return (
    counts +
    "Changes were saved, but I couldn't finish the report. Review each action result before retrying only the failed items."
  );
}
