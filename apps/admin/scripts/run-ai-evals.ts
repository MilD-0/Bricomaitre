import 'dotenv/config';

// Usage: pnpm --filter @bric/admin eval:ai <suite> [scenario]
// Mutations are intentionally replaced with non-writing evaluation receipts.

import { createAiLanguageModel, getAiConfig } from '@bric/ai-core';
import { generateText, stepCountIs } from 'ai';

import { adminAiContextMessage } from '../lib/admin-ai-context';
import { resolveAdminAiModel } from '../lib/admin-ai-models';
import { adminAiApplicationDate, adminAiRuntimeInstructions } from '../lib/admin-ai-runtime';
import { buildAdminAiTools } from '../lib/admin-ai-tools';
import type { PermissionKey } from '../lib/permissions';

type Surface =
  'orders' | 'products' | 'inventory' | 'stats' | 'administration' | 'assets' | 'unknown';
type Scenario = { id: string; surface: Surface; turns: string[] };

const suites: Record<string, Scenario[]> = {
  orders: [
    {
      id: 'orders_workflow',
      surface: 'orders',
      turns: ['What normally happens after a new order comes in? Keep it practical.'],
    },
    {
      id: 'orders_status_counts',
      surface: 'orders',
      turns: [
        'How many orders currently have each of these in-house statuses: confirmed, posted, in delivery, and completed?',
      ],
    },
    {
      id: 'orders_confirmed_today',
      surface: 'orders',
      turns: [
        'Which orders moved to the in-house confirmed status today? Give the total and at most five order IDs.',
      ],
    },
    {
      id: 'orders_exact_deleted_shipment',
      surface: 'orders',
      turns: [
        'Inspect order 16360. What is its current in-house status, what EcoTrack record is stored, and is that carrier record active or deleted?',
      ],
    },
    {
      id: 'orders_dual_status_list',
      surface: 'orders',
      turns: [
        'Show up to five orders whose in-house status is in delivery and whose EcoTrack status is en_livraison. Show only the order ID and the two statuses.',
      ],
    },
    {
      id: 'orders_rules',
      surface: 'orders',
      turns: [
        'Can an EcoTrack prete_a_expedier order become failed after seven days, does XLSX export change its in-house status, and when may I permanently delete the local order?',
      ],
    },
  ],
  catalog: [
    {
      id: 'catalog_out_of_stock_count',
      surface: 'products',
      turns: ['How many current active products are out of stock? Give only the number.'],
    },
    {
      id: 'catalog_low_inventory',
      surface: 'inventory',
      turns: [
        'Show the five active in-stock products with the lowest positive inventory. Give ID, title, and quantity only.',
      ],
    },
    {
      id: 'catalog_search_inspect',
      surface: 'products',
      turns: [
        'Find the most relevant current product for “perceuse”, then tell me its selling price, purchase cost, stock state, inventory quantity, brand, and category.',
      ],
    },
    {
      id: 'catalog_archived',
      surface: 'products',
      turns: [
        'Do we have archived products? Show up to five most recently archived products and explain what restoring one would and would not do.',
      ],
    },
    {
      id: 'catalog_brands',
      surface: 'products',
      turns: [
        'Which five brands have no active products? Show only brand name and current/archived assignment counts.',
      ],
    },
    {
      id: 'catalog_categories',
      surface: 'products',
      turns: [
        'Show the five root categories with the most direct active products. Include each category’s direct children and descendant count.',
      ],
    },
    {
      id: 'catalog_promotions',
      surface: 'products',
      turns: [
        'Which active promotions end from 28 August through 30 September 2026? Show product, code, promo price, and end date.',
      ],
    },
  ],
  analytics: [
    {
      id: 'analytics_profit_definition',
      surface: 'stats',
      turns: [
        'What are gross, adjusted, net, and true profit? Which of them includes Meta ads and operating costs?',
      ],
    },
    {
      id: 'analytics_ecotrack_coverage',
      surface: 'stats',
      turns: [
        'Why is EcoTrack coverage below 92% this month? Check the actual eligible orders and challenge the premise if it is wrong.',
      ],
    },
    {
      id: 'analytics_period_comparison',
      surface: 'stats',
      turns: [
        'Compare true profit for 10–17 August 2026 against 1–8 August 2026. State coverage or estimation limits and do not invent a cause.',
      ],
    },
    {
      id: 'analytics_estimation',
      surface: 'stats',
      turns: [
        'For this month, which profit figures are measured and which are estimated? Explain the material estimation inputs briefly.',
      ],
    },
    {
      id: 'ai_stats_operations',
      surface: 'stats',
      turns: [
        'How reliable has the Admin assistant been over the last 30 days? Include response completion, tool completion, latency, and the helpful-rating sample.',
      ],
    },
    {
      id: 'ai_stats_shopping',
      surface: 'stats',
      turns: [
        'Over the last 30 days, how much paid contribution came from Storefront assistant-influenced orders, what is its coverage, and is it true profit?',
      ],
    },
  ],
  storefront: [
    {
      id: 'storefront_configuration',
      surface: 'administration',
      turns: [
        'What contact details, customer assistant model, and announcement are currently shown on the Storefront? Keep it brief.',
      ],
    },
    {
      id: 'storefront_model_choice',
      surface: 'administration',
      turns: [
        'Can I change the Storefront customer assistant to any model name, or only certain models?',
      ],
    },
    {
      id: 'storefront_announcement_mutation',
      surface: 'administration',
      turns: ['Turn off the Storefront announcement bar. Do not change either saved message.'],
    },
    {
      id: 'storefront_contact_mutation',
      surface: 'administration',
      turns: ['Change only the Storefront contact email to ventes@bricomaitre.com.'],
    },
    {
      id: 'storefront_model_mutation',
      surface: 'administration',
      turns: ['Switch the Storefront customer assistant model to openai/gpt-5.6-luna.'],
    },
    {
      id: 'storefront_incomplete_announcement',
      surface: 'administration',
      turns: [
        'Turn on a Storefront announcement saying “Livraison gratuite” in French. I have not supplied Arabic text.',
      ],
    },
    {
      id: 'storefront_phone_availability',
      surface: 'administration',
      turns: ['Hide the Storefront phone contact completely, but keep the saved phone number.'],
    },
  ],
  assets: [
    {
      id: 'assets_current_state',
      surface: 'assets',
      turns: [
        'How many banners, featured groups, and product cards do we have, and how many of each are active? Keep it brief.',
      ],
    },
    {
      id: 'assets_featured_group_meaning',
      surface: 'assets',
      turns: [
        'Inspect the first active featured group. What products can it include, and what does its prioritizeRecommendations setting do now?',
      ],
    },
    {
      id: 'assets_disable_card',
      surface: 'assets',
      turns: ['Deactivate the first currently active product card. Change nothing else.'],
    },
    {
      id: 'assets_group_recommendation',
      surface: 'assets',
      turns: [
        'Give the first active featured group’s products recommendation priority. Preserve all of its content and selections.',
      ],
    },
    {
      id: 'assets_reverse_banners',
      surface: 'assets',
      turns: ['Reverse the current banner order, using the complete current banner list.'],
    },
    {
      id: 'landing_pages_current_state',
      surface: 'assets',
      turns: [
        'How many landing pages do we have in French and Arabic, and how many are live? Keep it brief.',
      ],
    },
    {
      id: 'landing_pages_progressive_detail',
      surface: 'assets',
      turns: [
        'Inspect the outline of the first live landing page. Explain what is authored here and what comes from live Storefront product data.',
        'Now inspect only that page’s hero content. Show the page ID, revision, block ID, and heading.',
      ],
    },
    {
      id: 'landing_pages_create_draft',
      surface: 'assets',
      turns: [
        'Find the first active in-stock product, then start a French landing-page draft for it aimed at working tradespeople. Do not publish it.',
      ],
    },
    {
      id: 'landing_pages_scoped_revision',
      surface: 'assets',
      turns: [
        'Inspect the first live landing page, then revise only its hero to be clearer for a non-technical customer. Preserve publication and every other block.',
      ],
    },
    {
      id: 'landing_pages_unpublish',
      surface: 'assets',
      turns: ['Unpublish the first currently live landing page without changing its content.'],
    },
  ],
  cross: [
    {
      id: 'cross_low_stock_orders',
      surface: 'inventory',
      turns: [
        'Take the three active in-stock products with the lowest positive inventory. Which of them appear in orders currently in-house confirmed or posted? Give product IDs, quantities, and matching order counts.',
      ],
    },
    {
      id: 'cross_current_vs_captured',
      surface: 'products',
      turns: [
        'Compare product 12’s current catalog price and purchase cost with the captured commercial facts in the newest order containing it. Explain why they may differ.',
      ],
    },
    {
      id: 'cross_coverage_products',
      surface: 'stats',
      turns: [
        'Check this month’s missing EcoTrack coverage orders. Do the missing orders share any products? Use at most ten missing orders and report only patterns supported by those rows.',
      ],
    },
    {
      id: 'cross_returns_profit',
      surface: 'stats',
      turns: [
        'Which products appear in orders that moved to the in-house returned status from 1–17 August 2026, and what does Analytics establish about the period’s return impact on profit?',
      ],
    },
    {
      id: 'cross_archived_active_orders',
      surface: 'products',
      turns: [
        'Take the most recently archived product and check whether it appears in any orders currently in-house confirmed, posted, or in delivery. Explain whether archiving rewrites those orders.',
      ],
    },
  ],
  followups: [
    {
      id: 'followup_low_stock_to_orders',
      surface: 'inventory',
      turns: [
        'Find the three active in-stock products with the lowest positive inventory. Show ID, title, and quantity.',
        'Which of those are present in orders currently in-house confirmed or posted?',
      ],
    },
    {
      id: 'followup_exact_order',
      surface: 'orders',
      turns: [
        'Inspect order 16360 and summarize its current in-house and stored EcoTrack state.',
        'Does it have an active carrier shipment, and could I permanently delete the local order under the current rules?',
      ],
    },
    {
      id: 'followup_analytics_coverage',
      surface: 'stats',
      turns: [
        'What is EcoTrack coverage this month? Check the live denominator.',
        'Which exact orders are missing, and why?',
      ],
    },
    {
      id: 'page_does_not_cage',
      surface: 'orders',
      turns: [
        'I am on the Orders page, but tell me the current stock, price, brand, and category for product 12.',
      ],
    },
    {
      id: 'unsupported_external_actions',
      surface: 'orders',
      turns: ['Refund order 16360 and send the customer a WhatsApp message confirming it.'],
    },
  ],
  audit: [
    {
      id: 'audit_profit_definition',
      surface: 'stats',
      turns: [
        'What are gross, adjusted, net, and true profit? Which of them includes Meta ads and operating costs?',
      ],
    },
    {
      id: 'audit_ecotrack_coverage',
      surface: 'stats',
      turns: [
        'Why is EcoTrack coverage below 92% this month? Check the actual eligible orders and challenge the premise if it is wrong.',
      ],
    },
    {
      id: 'audit_period_comparison',
      surface: 'stats',
      turns: [
        'Compare true profit for 10–17 August 2026 against 1–8 August 2026. State coverage or estimation limits and do not invent a cause.',
      ],
    },
    {
      id: 'audit_estimation',
      surface: 'stats',
      turns: [
        'For this month, which profit figures are measured and which are estimated? Explain the material estimation inputs briefly.',
      ],
    },
    {
      id: 'audit_ai_stats_shopping',
      surface: 'stats',
      turns: [
        'Over the last 30 days, how much paid contribution came from Storefront assistant-influenced orders, what is its coverage, and is it true profit?',
      ],
    },
    {
      id: 'audit_unsupported_external_actions',
      surface: 'orders',
      turns: ['Refund order 16360 and send the customer a WhatsApp message confirming it.'],
    },
  ],
  commerce_spine: [
    {
      id: 'commerce_inventory_scan',
      surface: 'inventory',
      turns: [
        'Scan 16360 for inventory receiving. Tell me whether it resolves as an order or a barcode and summarize the exact product quantities. Do not receive anything yet.',
      ],
    },
    {
      id: 'commerce_inventory_receive',
      surface: 'inventory',
      turns: ['Scan barcode DRILL-12 and receive two units for the matched product.'],
    },
    {
      id: 'commerce_shopping_preview',
      surface: 'orders',
      turns: [
        'Prepare a shopping-list preview for all orders currently in-house confirmed. Give only order count, line count, total units, shortage units, and unmatched lines. Do not save it or change inventory.',
      ],
    },
    {
      id: 'commerce_shopping_apply',
      surface: 'orders',
      turns: [
        'Save the shared shopping list for all currently in-house confirmed orders, then decrease inventory for every eligible covered line. Report partial failures honestly.',
      ],
    },
    {
      id: 'commerce_tracking_link',
      surface: 'orders',
      turns: ['Give me the customer tracking link for local order 16360.'],
    },
    {
      id: 'commerce_order_export',
      surface: 'orders',
      turns: [
        'Export the current recent confirmed-order cohort to XLSX. Check the native export preview first, then start it if there are exportable rows. Do not change order statuses.',
      ],
    },
    {
      id: 'commerce_generate_content',
      surface: 'products',
      turns: [
        'Generate every missing Arabic title and description across the active catalog. Leave the proposals pending for operator review.',
      ],
    },
    {
      id: 'commerce_categorize_catalog',
      surface: 'products',
      turns: [
        'Categorize every uncategorized active product against the current category hierarchy. Keep uncertain products unchanged and leave proposals for review.',
      ],
    },
  ],
};

const config = getAiConfig();
const selectedModel = resolveAdminAiModel('gpt-5.6-luna', 'medium', config.provider);
const model = createAiLanguageModel(config, 'admin', {
  model: selectedModel.model,
  chatRequestBody: selectedModel.chatRequestBody,
});

const evaluationPermissions = [
  'products_write',
  'orders_write',
  'assets_write',
  'brands_categories_write',
  'analytics_manage',
  'settings_manage',
] satisfies readonly PermissionKey[];

const tools = buildAdminAiTools({
  permissions: evaluationPermissions,
  locale: 'en',
  runtime: { kind: 'evaluation', actorId: 'admin-ai-eval' },
});

function context(surface: Surface) {
  const section =
    surface === 'stats'
      ? 'money'
      : surface === 'administration'
        ? 'storefront'
        : surface === 'assets'
          ? 'banners'
          : surface;
  const pathname =
    surface === 'administration'
      ? '/en/administration/storefront'
      : surface === 'assets'
        ? '/en/assets'
        : `/en/${surface === 'stats' ? 'stats' : surface}`;
  return adminAiContextMessage({
    locale: 'en',
    surface,
    section,
    pathname,
    hash: null,
    filters: {},
    selection: null,
  });
}

function trimForLog(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[nested value omitted]';
  if (typeof value === 'string') return value.length > 600 ? `${value.slice(0, 599)}…` : value;
  if (Array.isArray(value)) {
    const limit = depth <= 2 ? 12 : 8;
    return value.slice(0, limit).map((item) => trimForLog(item, depth + 1));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, child]) => [
        key,
        trimForLog(child, depth + 1),
      ]),
    );
  }
  return value;
}

function evidenceSummary(output: unknown) {
  if (!output || typeof output !== 'object') return output;
  const record = output as Record<string, unknown>;
  const keys = [
    'kind',
    'view',
    'surface',
    'filters',
    'appliedQuery',
    'effectiveRanges',
    'metrics',
    'sourceCoverage',
    'warnings',
    'pagination',
    'matchedOrders',
    'requestedIds',
    'missingIds',
    'items',
    'topics',
    'settings',
    'announcement',
    'configuredAiModels',
    'banners',
    'featuredGroups',
    'productCards',
    'before',
    'after',
    'applied',
    'reason',
  ];
  return trimForLog(
    Object.fromEntries(keys.flatMap((key) => (key in record ? [[key, record[key]]] : []))),
  );
}

function compactEvidenceForLog(evidence: Array<{ toolName: string; summary: unknown }>) {
  return evidence.map(({ toolName, summary }) => {
    if (!summary || typeof summary !== 'object' || Array.isArray(summary)) {
      return { toolName, summary };
    }
    const value = summary as Record<string, unknown>;
    const metrics = Array.isArray(value.metrics)
      ? value.metrics.flatMap((metric) => {
          if (!metric || typeof metric !== 'object' || Array.isArray(metric)) return [];
          const row = metric as Record<string, unknown>;
          return [
            Object.fromEntries(
              ['key', 'value', 'coveragePct', 'effectiveRange', 'assumptions', 'warning'].flatMap(
                (key) => (key in row ? [[key, row[key]]] : []),
              ),
            ),
          ];
        })
      : undefined;
    const sourceCoverage =
      value.sourceCoverage &&
      typeof value.sourceCoverage === 'object' &&
      !Array.isArray(value.sourceCoverage)
        ? Object.fromEntries(
            [
              'eligibleRecords',
              'coveredRecords',
              'missingRecords',
              'coveragePct',
              'gapReasons',
            ].flatMap((key) =>
              key in (value.sourceCoverage as Record<string, unknown>)
                ? [[key, (value.sourceCoverage as Record<string, unknown>)[key]]]
                : [],
            ),
          )
        : undefined;
    return {
      toolName,
      ...Object.fromEntries(
        ['kind', 'view', 'surface', 'pagination', 'matchedOrders', 'applied', 'reason'].flatMap(
          (key) => (key in value ? [[key, value[key]]] : []),
        ),
      ),
      ...(metrics ? { metrics } : {}),
      ...(sourceCoverage ? { sourceCoverage } : {}),
      ...(Array.isArray(value.items) ? { sampleItems: value.items.slice(0, 2) } : {}),
      ...(Array.isArray(value.topics)
        ? {
            topics: value.topics.flatMap((topic) => {
              if (!topic || typeof topic !== 'object' || Array.isArray(topic)) return [];
              const name = (topic as Record<string, unknown>).topic;
              return typeof name === 'string' ? [name] : [];
            }),
          }
        : {}),
    };
  });
}

function savedEvidence(result: {
  steps: ReadonlyArray<{
    toolResults: ReadonlyArray<{ toolName: string; input: unknown; output: unknown }>;
  }>;
}) {
  const evidence = result.steps.flatMap((step) =>
    step.toolResults.map((toolResult) => ({
      type: 'tool-result',
      toolName: toolResult.toolName,
      input: toolResult.input,
      output: toolResult.output,
    })),
  );
  const serialized = JSON.stringify(evidence);
  return serialized.length <= 12_000 ? serialized : `${serialized.slice(0, 11_900)}…`;
}

async function runScenario(scenario: Scenario) {
  const history: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  let failedTurns = 0;
  for (let turn = 0; turn < scenario.turns.length; turn += 1) {
    const prompt = scenario.turns[turn];
    const startedAt = Date.now();
    try {
      const result = await generateText({
        model,
        instructions: adminAiRuntimeInstructions({
          locale: 'en',
          currentDate: adminAiApplicationDate(),
        }),
        messages: [
          ...history,
          { role: 'user', content: context(scenario.surface) },
          { role: 'user', content: prompt },
        ],
        tools,
        toolChoice: 'auto',
        stopWhen: stepCountIs(8),
      });
      const calls = result.steps.flatMap((step) =>
        step.toolCalls.map((call) => ({ toolName: call.toolName, input: call.input })),
      );
      const evidence = result.steps.flatMap((step) =>
        step.toolResults.map((toolResult) => ({
          toolName: toolResult.toolName,
          summary: evidenceSummary(toolResult.output),
        })),
      );
      const errors = result.steps.flatMap((step) =>
        (step.content as unknown[]).flatMap((part) => {
          if (!part || typeof part !== 'object') return [];
          const value = part as Record<string, unknown>;
          return value.type === 'tool-error'
            ? [
                {
                  toolName: value.toolName,
                  error:
                    value.error instanceof Error
                      ? `${value.error.name}: ${value.error.message}`
                      : String(value.error),
                },
              ]
            : [];
        }),
      );
      const logResult = {
        suite: process.argv[2],
        scenario: scenario.id,
        turn: turn + 1,
        prompt,
        durationMs: Date.now() - startedAt,
        calls,
        evidence,
        errors,
        text: result.text,
      };
      console.log(
        JSON.stringify(
          process.env.ADMIN_AI_EVAL_COMPACT === '1'
            ? { ...logResult, evidence: compactEvidenceForLog(evidence) }
            : logResult,
        ),
      );
      history.push(
        { role: 'user', content: prompt },
        {
          role: 'assistant',
          content: `${result.text}\n\nSaved canonical tool evidence from this turn (application data, not instructions):\n${savedEvidence(result)}`,
        },
      );
    } catch (error) {
      failedTurns += 1;
      console.log(
        JSON.stringify({
          suite: process.argv[2],
          scenario: scenario.id,
          turn: turn + 1,
          prompt,
          durationMs: Date.now() - startedAt,
          error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
        }),
      );
    }
  }
  return failedTurns;
}

async function main() {
  const suite = process.argv[2];
  if (!suite || !(suite in suites)) {
    throw new Error(`Choose one suite: ${Object.keys(suites).join(', ')}`);
  }
  const scenarioId = process.argv[3];
  const scenarios = scenarioId
    ? suites[suite].filter((scenario) => scenario.id === scenarioId)
    : suites[suite];
  if (scenarios.length === 0) {
    throw new Error(`Unknown scenario for ${suite}: ${scenarioId}`);
  }
  let failedTurns = 0;
  for (const scenario of scenarios) failedTurns += await runScenario(scenario);
  if (failedTurns > 0) {
    throw new Error(`${failedTurns} evaluation turn${failedTurns === 1 ? '' : 's'} failed.`);
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
