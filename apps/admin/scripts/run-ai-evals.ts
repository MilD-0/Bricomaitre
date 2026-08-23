import {
  createAiLanguageModel,
  getAiConfig,
  runAiEvalSuite,
  type AiEvalTranscript,
} from '@bric/ai-core';
import { generateText, stepCountIs, tool } from 'ai';
import { z } from 'zod';

import { ADMIN_AI_CHAT_INSTRUCTIONS } from '../lib/ai-admin-chat';
import { ADMIN_AI_EVAL_SCENARIOS, type AdminAiEvalInput } from '../lib/ai-eval-scenarios';
import {
  ADMIN_AI_DEFAULT_MODEL,
  ADMIN_AI_MAX_OUTPUT_TOKENS,
  resolveAdminAiModel,
} from '../lib/admin-ai-models';
import { adminAiGroundingTool, adminAiMutationTool } from '../lib/admin-ai-tool-plan';
import { permissionCatalog } from '../lib/permissions';
import type { AiEvalScenario } from '@bric/ai-core/evals';

const descriptions: Record<string, string> = {
  inspect_orders: 'Read complete live order, customer, delivery, product, value, and status data.',
  update_order_status: 'Update exact inspected orders through the canonical order workflow.',
  update_order_details:
    'Correct exact inspected order customer, delivery, address, note, or product-line details.',
  inspect_inventory: 'Read current inventory levels, movements, and low-stock products.',
  adjust_inventory: 'Increase or decrease exact resolved inventory quantities.',
  inspect_assets: 'Read current asset inventory, usage, size, and missing media state.',
  inspect_landing_pages:
    'Read complete current landing-page documents, revisions, publication state, and ordered blocks.',
  create_landing_page:
    'Generate and persist one complete validated landing page for an exact resolved product.',
  edit_landing_page:
    'Apply a staged, revision-safe landing-page edit while preserving unaffected blocks.',
  update_asset_state: 'Activate, deactivate, or place exact inspected merchandising assets.',
  reorder_assets: 'Persist an explicit complete ordering for one inspected asset kind.',
  manage_assets:
    'Create, completely replace, or delete one exact banner, featured group, or product card.',
  inspect_ai_proposals: 'Read the current AI proposal review inbox.',
  review_ai_proposals: 'Approve or reject exact inspected proposals through canonical workflows.',
  inspect_administration: 'Read staff accounts, exact permissions, roles, and access grants.',
  set_access_grant: 'Create or update one exact canonical staff access grant.',
  set_role_definition: 'Create or update one complete custom staff role definition.',
  inspect_storefront_configuration:
    'Read storefront contacts, AI settings, configured models, and bilingual announcement content.',
  update_storefront_announcement:
    'Update the French and Arabic storefront announcement after an explicit operator request.',
  inspect_bulletin: 'Read complete Bulletin posts, replies, attachments, reactions, and authors.',
  create_bulletin_post: 'Create a canonical Bulletin post as the current operator.',
  reply_bulletin_post: 'Reply to one exact inspected Bulletin thread as the current operator.',
  update_bulletin_post:
    'Edit or pin one exact inspected Bulletin post with omitted fields preserved.',
  delete_bulletin_content:
    'Delete one exact inspected Bulletin post or reply through ownership and moderation rules.',
  query_analytics: 'Query the canonical analytics workspace and return resolved metrics.',
  categorize_catalog: 'Start exactly one resumable full-catalog categorization job.',
  generate_product_content: 'Start one bulk product-content generation job.',
  find_products: 'Resolve product names to current exact product records and IDs.',
  inspect_products:
    'Read complete current product content, identifiers, commercial fields, taxonomy, images, inventory, and promo rules.',
  update_products:
    'Directly update exact inspected products through canonical merged-record validation.',
  suggest_discount: 'Create one reviewable product discount proposal.',
  find_brands: 'Resolve current brands by name before taxonomy changes.',
  propose_brand_create: 'Create one reviewable inactive brand proposal.',
  list_background_jobs: 'Read current server-owned background job queues and progress.',
  propose_product_edit: 'Create one reviewable product edit proposal.',
};

const fixtureByTool: Record<string, unknown> = {
  find_products: { matches: [{ id: 12, title: 'Perceuse Bosch 18 V', price: '15000.00' }] },
  inspect_products: {
    items: [
      {
        id: 12,
        title: 'Perceuse Bosch 18 V',
        slug: 'perceuse-bosch-18-v',
        sku: 'PB-1',
        price: 15_000,
        purchasePrice: 9_500,
        active: true,
        inStock: true,
        availabilityStatus: 'in_stock',
        inventoryQuantity: 2,
        brandId: 2,
        categoryId: 3,
        images: ['https://cdn.example.com/perceuse.jpg'],
        promoCodes: [],
      },
    ],
  },
  find_brands: { matches: [] },
  inspect_orders: { orders: [{ id: 91, customer: { name: 'Client Exemple' }, status: 'pending' }] },
  inspect_inventory: { lowStock: [{ productId: 12, quantity: 2 }] },
  inspect_assets: {
    featuredGroups: [
      {
        id: 7,
        name: 'Sélection atelier',
        active: false,
        showAtTopOfProductsPage: false,
        productIds: [12, 18],
      },
    ],
    missing: [{ productId: 12, title: 'Perceuse Bosch 18 V' }],
  },
  inspect_landing_pages: {
    items: [
      {
        id: 41,
        productId: 12,
        productTitle: 'Perceuse Bosch 18 V',
        locale: 'fr',
        slug: 'perceuse-bosch-18-v-41',
        status: 'draft',
        draftRevision: 3,
        document: {
          schemaVersion: 2,
          theme: { accent: 'orange', density: 'comfortable', shell: 'campaign' },
          seo: { title: 'Perceuse Bosch 18 V', description: 'Perceuse pour vos travaux.' },
          blocks: [
            { id: 'hero', type: 'product-hero', heading: 'Perceuse Bosch 18 V' },
            { id: 'benefits', type: 'benefit-grid', heading: 'Les avantages' },
            { id: 'final', type: 'final-cta', heading: 'Commander' },
          ],
        },
      },
    ],
  },
  inspect_ai_proposals: { proposals: [{ id: 44, status: 'proposed' }] },
  inspect_administration: { accessGrants: [{ email: 'operator@example.com', role: 'orders' }] },
  inspect_storefront_configuration: {
    settings: { aiAssistantEnabled: true, aiModel: 'openai/gpt-5.6-luna' },
    announcement: { messageFr: '', messageAr: '', active: false },
  },
  inspect_bulletin: {
    posts: [
      {
        id: 7,
        title: 'Suivi',
        pinned: false,
        permissions: { canEdit: true, canDelete: true, canPin: true },
        replies: [{ id: 9, body: 'Ancienne réponse', permissions: { canDelete: true } }],
      },
    ],
  },
  query_analytics: { range: 'current_month', metrics: [{ name: 'revenue', value: 120000 }] },
  list_background_jobs: {
    jobs: [{ id: 5, type: 'product_export', status: 'running', progress: 60 }],
  },
};

const inputSchema = z.object({}).catchall(z.unknown());
const tools = Object.fromEntries(
  Object.entries(descriptions).map(([name, description]) => [
    name,
    tool({
      description,
      inputSchema,
      execute: async () => fixtureByTool[name] ?? { status: 'proposed', id: 100 },
    }),
  ]),
);

async function executeScenario(
  scenario: AiEvalScenario<AdminAiEvalInput>,
): Promise<AiEvalTranscript> {
  const config = getAiConfig();
  const selectedModel = resolveAdminAiModel(ADMIN_AI_DEFAULT_MODEL, 'medium');
  const [surface, section] = scenario.input.surface.split('/', 2);
  const groundingTool = adminAiGroundingTool({
    message: scenario.input.message,
    surface,
    section,
    permissions: permissionCatalog,
  });
  const mutationTool = adminAiMutationTool({
    message: scenario.input.message,
    surface,
    section,
    permissions: permissionCatalog,
  });
  const result = await generateText({
    model: createAiLanguageModel(config, 'admin', {
      model: selectedModel.model,
      openRouterRequestBody: selectedModel.openRouterRequestBody,
    }),
    instructions: ADMIN_AI_CHAT_INSTRUCTIONS,
    prompt: `Current admin surface: ${surface}${section ? `/${section}` : ''}\nOperator: ${scenario.input.message}`,
    tools,
    stopWhen: stepCountIs(8),
    prepareStep: ({ stepNumber }) => {
      if (stepNumber === 0 && groundingTool) {
        return {
          activeTools: [groundingTool],
          toolChoice: { type: 'tool', toolName: groundingTool },
        };
      }
      if (mutationTool && stepNumber === (groundingTool ? 1 : 0)) {
        return {
          activeTools: [mutationTool],
          toolChoice: { type: 'tool', toolName: mutationTool },
        };
      }
      return undefined;
    },
    maxRetries: config.maxRetries,
    maxOutputTokens: ADMIN_AI_MAX_OUTPUT_TOKENS,
    timeout: config.requestTimeoutMs,
  });
  const steps = await result.steps;
  return {
    status: 'completed',
    answer: await result.text,
    toolCalls: steps.flatMap((step) =>
      step.toolCalls.map((call) => ({ name: call.toolName, status: 'completed' as const })),
    ),
  };
}

async function main() {
  const report = await runAiEvalSuite({
    scenarios: [...ADMIN_AI_EVAL_SCENARIOS],
    execute: executeScenario,
    concurrency: Number(process.env.AI_EVAL_CONCURRENCY ?? 1),
  });

  console.log(JSON.stringify(report, null, 2));
  const threshold = Number(process.env.AI_EVAL_PASS_RATE ?? 0.85);
  if (report.passRate < threshold) process.exitCode = 1;
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
