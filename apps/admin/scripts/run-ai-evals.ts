import { createAiLanguageModel, getAiConfig } from '@bric/ai-core';
import { generateText } from 'ai';
import type { ToolSet } from 'ai';
import 'dotenv/config';
import { adminAiContextMessage } from '../lib/admin-ai-context';
import { adminAiGenerationOptions } from '../lib/admin-ai-generation-options';
import {
  ADMIN_AI_CONTEXT_QUERY_LIMIT,
  buildAdminAiConversationContext,
} from '../lib/admin-ai-conversation-context';
import { adminAiReasoningEffortSchema, resolveAdminAiModel } from '../lib/admin-ai-models';
import { adminAiApplicationDate, adminAiRuntimeInstructions } from '../lib/admin-ai-runtime';
import { buildAdminAiTools } from '../lib/admin-ai-tools';
import type { PermissionKey } from '../lib/permissions';
import { compactEvidenceForLog, evidenceSummary, savedEvidence } from './ai-eval-evidence';
import { type Scenario, suites, type Surface } from './ai-eval-scenarios';
import { scenarioToolCoverage, type EvalToolReceipt } from './ai-eval-coverage';

const config = getAiConfig();

const defaultReasoningEffort = adminAiReasoningEffortSchema.parse(
  process.env.ADMIN_AI_EVAL_EFFORT ?? 'medium',
);
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

export async function runScenario(
  scenario: Scenario,
  options: {
    tools?: ToolSet;
    onTurn?: (result: Record<string, unknown>) => void | Promise<void>;
  } = {},
) {
  const reasoningEffort = (process.env.ADMIN_AI_EVAL_HIGH_SCENARIOS ?? '')
    .split(',')
    .includes(scenario.id)
    ? 'high'
    : defaultReasoningEffort;
  const selectedModel = resolveAdminAiModel('gpt-5.6-luna', reasoningEffort, config.provider);
  const model = createAiLanguageModel(config, 'admin', {
    model: selectedModel.model,
    chatRequestBody: selectedModel.chatRequestBody,
  });
  const history: Array<{ role: 'user' | 'assistant'; content: unknown }> = [];
  const receipts: EvalToolReceipt[] = [];
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
          ...buildAdminAiConversationContext(
            [...history].reverse().slice(0, ADMIN_AI_CONTEXT_QUERY_LIMIT),
            {
              characterLimit: config.adminContextCharacterLimit,
              toolEvidenceCharacterLimit: config.adminToolEvidenceCharacterLimit,
            },
          ),
          { role: 'user', content: context(scenario.surface) },
          { role: 'user', content: prompt },
        ],
        tools: options.tools ?? tools,
        toolChoice: 'auto',
        ...adminAiGenerationOptions(config),
      });
      const calls = result.steps.flatMap((step) =>
        step.toolCalls.map((call) => ({ toolName: call.toolName, input: call.input })),
      );
      receipts.push(
        ...result.steps.flatMap((step) =>
          step.toolResults.map(({ toolName, output }) => ({ toolName, output })),
        ),
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
        model: selectedModel.model,
        reasoningEffort,
        scenario: scenario.id,
        turn: turn + 1,
        prompt,
        durationMs: Date.now() - startedAt,
        calls,
        evidence,
        errors,
        text: result.text,
        ...(turn === scenario.turns.length - 1
          ? { coverage: scenarioToolCoverage(scenario.expectedTools ?? [], receipts) }
          : {}),
      };
      const logged =
        process.env.ADMIN_AI_EVAL_COMPACT === '1'
          ? { ...logResult, evidence: compactEvidenceForLog(evidence) }
          : logResult;
      if (options.onTurn) await options.onTurn(logged);
      else console.log(JSON.stringify(logged));
      history.push(
        { role: 'user', content: prompt },
        {
          role: 'assistant',
          content: { text: result.text, toolResults: savedEvidence(result) },
        },
      );
    } catch (error) {
      failedTurns += 1;
      const logged = {
        suite: process.argv[2],
        scenario: scenario.id,
        turn: turn + 1,
        prompt,
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
        ...(turn === scenario.turns.length - 1
          ? { coverage: scenarioToolCoverage(scenario.expectedTools ?? [], receipts) }
          : {}),
      };
      if (options.onTurn) await options.onTurn(logged);
      else console.log(JSON.stringify(logged));
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

if (process.env.ADMIN_AI_EVAL_HARNESS !== '1')
  void main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
