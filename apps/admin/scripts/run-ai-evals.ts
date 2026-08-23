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
import { adminAiGroundingTool } from '../lib/admin-ai-tool-plan';
import { permissionCatalog } from '../lib/permissions';
import type { AiEvalScenario } from '@bric/ai-core/evals';

const descriptions: Record<string, string> = {
  inspect_orders: 'Read complete live order, customer, delivery, product, value, and status data.',
  update_order_status: 'Update exact inspected orders through the canonical order workflow.',
  inspect_inventory: 'Read current inventory levels, movements, and low-stock products.',
  adjust_inventory: 'Increase or decrease exact resolved inventory quantities.',
  inspect_assets: 'Read current asset inventory, usage, size, and missing media state.',
  inspect_ai_proposals: 'Read the current AI proposal review inbox.',
  inspect_administration: 'Read staff accounts, exact permissions, roles, and access grants.',
  inspect_storefront_configuration:
    'Read storefront contacts, AI settings, configured models, and bilingual announcement content.',
  update_storefront_announcement:
    'Update the French and Arabic storefront announcement after an explicit operator request.',
  inspect_bulletin: 'Read complete Bulletin posts, replies, attachments, reactions, and authors.',
  query_analytics: 'Query the canonical analytics workspace and return resolved metrics.',
  categorize_catalog: 'Start exactly one resumable full-catalog categorization job.',
  generate_product_content: 'Start one bulk product-content generation job.',
  find_products: 'Resolve product names to current exact product records and IDs.',
  suggest_discount: 'Create one reviewable product discount proposal.',
  find_brands: 'Resolve current brands by name before taxonomy changes.',
  propose_brand_create: 'Create one reviewable inactive brand proposal.',
  list_background_jobs: 'Read current server-owned background job queues and progress.',
  propose_product_edit: 'Create one reviewable product edit proposal.',
};

const fixtureByTool: Record<string, unknown> = {
  find_products: { matches: [{ id: 12, title: 'Perceuse Bosch 18 V', price: '15000.00' }] },
  find_brands: { matches: [] },
  inspect_orders: { orders: [{ id: 91, customer: { name: 'Client Exemple' }, status: 'pending' }] },
  inspect_inventory: { lowStock: [{ productId: 12, quantity: 2 }] },
  inspect_assets: { missing: [{ productId: 12, title: 'Perceuse Bosch 18 V' }] },
  inspect_ai_proposals: { proposals: [{ id: 44, status: 'proposed' }] },
  inspect_administration: { accessGrants: [{ email: 'operator@example.com', role: 'orders' }] },
  inspect_storefront_configuration: {
    settings: { aiAssistantEnabled: true, aiModel: 'openai/gpt-5.6-luna' },
    announcement: { messageFr: '', messageAr: '', active: false },
  },
  inspect_bulletin: { posts: [{ id: 7, title: 'Suivi', replies: [] }] },
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
  const groundingTool = adminAiGroundingTool({
    message: scenario.input.message,
    surface: scenario.input.surface,
    permissions: permissionCatalog,
  });
  const result = await generateText({
    model: createAiLanguageModel(config, 'admin', {
      model: selectedModel.model,
      openRouterRequestBody: selectedModel.openRouterRequestBody,
    }),
    instructions: ADMIN_AI_CHAT_INSTRUCTIONS,
    prompt: `Current admin surface: ${scenario.input.surface}\nOperator: ${scenario.input.message}`,
    tools,
    stopWhen: stepCountIs(8),
    prepareStep: ({ stepNumber }) =>
      stepNumber === 0 && groundingTool
        ? {
            activeTools: [groundingTool],
            toolChoice: { type: 'tool', toolName: groundingTool },
          }
        : undefined,
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
