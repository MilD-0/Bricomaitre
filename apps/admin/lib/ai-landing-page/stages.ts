import { createAiLanguageModel, strictStructuredOutputSchema, type AiConfig } from '@bric/ai-core';
import { landingPageBlockSchema, type LandingPageBlock } from '@bric/storefront-core/landing-pages';
import { generateText, Output } from 'ai';
import { blockSchemaFor } from './blocks';
import {
  LANDING_PAGE_GENERATION_INSTRUCTIONS,
  LANDING_PAGE_STAGE_ATTEMPTS,
  landingPagePlanSchema,
  type LandingPageGenerationInput,
  type LandingPageGenerationStages,
  type LandingPageStageRunner,
  type PlannedSection,
  type TokenUsage,
} from './contract';

export function createModelStageRunner(config: AiConfig): LandingPageStageRunner {
  const model = createAiLanguageModel(config, 'content');
  return {
    async generatePlan(input) {
      const result = await generateText({
        model,
        instructions: `${LANDING_PAGE_GENERATION_INSTRUCTIONS} Return only the compact creative plan requested by the schema.`,
        prompt: JSON.stringify(input),
        output: Output.object({
          schema: strictStructuredOutputSchema(landingPagePlanSchema),
          name: 'storefront_landing_page_plan',
        }),
        maxRetries: config.maxRetries,
        ...(config.landingPageRequestTimeoutMs
          ? { timeout: config.landingPageRequestTimeoutMs }
          : {}),
      });
      return { plan: landingPagePlanSchema.parse(await result.output), usage: result.usage };
    },
    async generateBlock({ generationInput, section, index }) {
      const schema = blockSchemaFor(section.type);
      const result = await generateText({
        model,
        instructions: `${LANDING_PAGE_GENERATION_INSTRUCTIONS} Write exactly one ${section.type} block for the supplied planned section. Return the block only. Its type must be ${section.type}.`,
        prompt: JSON.stringify({
          product: generationInput.product,
          locale: generationInput.locale,
          campaignAngle: generationInput.campaignAngle,
          plannedSection: section,
        }),
        output: Output.object({
          schema: strictStructuredOutputSchema(schema),
          name: `storefront_landing_page_${section.type.replaceAll('-', '_')}`,
        }),
        maxRetries: config.maxRetries,
        ...(config.landingPageRequestTimeoutMs
          ? { timeout: config.landingPageRequestTimeoutMs }
          : {}),
      });
      const rawBlock = schema.parse(await result.output) as Record<string, unknown>;
      const block = landingPageBlockSchema.parse({
        ...rawBlock,
        id: `section-${index + 1}-${section.type}`,
        type: section.type,
        surface: section.surface,
        width: section.width,
      });
      return { block, usage: result.usage };
    },
  };
}

export function addUsage(total: TokenUsage, next: TokenUsage) {
  for (const key of ['inputTokens', 'outputTokens', 'totalTokens'] as const) {
    if (next[key] != null) total[key] = (total[key] ?? 0) + next[key]!;
  }
}

export function landingPageFailureReason(
  error: unknown,
): LandingPageGenerationStages['failures'][number]['reason'] {
  const name = error instanceof Error ? error.name.toLocaleLowerCase() : '';
  const message = error instanceof Error ? error.message.toLocaleLowerCase() : '';
  if (name.includes('timeout') || message.includes('timeout') || message.includes('timed out')) {
    return 'timeout';
  }
  if (
    name.includes('noobjectgenerated') ||
    name.includes('typevalidation') ||
    message.includes('schema') ||
    message.includes('validation') ||
    message.includes('invalid generated') ||
    message.includes('malformed')
  ) {
    return 'invalid-structured-output';
  }
  return 'provider-error';
}

export type LandingPageStageAttempt<T> =
  | { status: 'fulfilled'; value: T; attempts: number }
  | { status: 'rejected'; reason: unknown; attempts: number };

export async function attemptLandingPageStage<T>(operation: () => Promise<T>) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= LANDING_PAGE_STAGE_ATTEMPTS; attempt += 1) {
    try {
      return {
        status: 'fulfilled' as const,
        value: await operation(),
        attempts: attempt,
      } satisfies LandingPageStageAttempt<T>;
    } catch (error) {
      lastError = error;
    }
  }
  return {
    status: 'rejected' as const,
    reason: lastError,
    attempts: LANDING_PAGE_STAGE_ATTEMPTS,
  } satisfies LandingPageStageAttempt<T>;
}

export async function generateSections(
  runner: LandingPageStageRunner,
  generationInput: LandingPageGenerationInput,
  sections: PlannedSection[],
) {
  const results: Array<LandingPageStageAttempt<{ block: LandingPageBlock; usage: TokenUsage }>> =
    [];
  for (let offset = 0; offset < sections.length; offset += 2) {
    const batch = sections.slice(offset, offset + 2);
    results.push(
      ...(await Promise.all(
        batch.map((section, index) =>
          attemptLandingPageStage(() =>
            runner.generateBlock({ generationInput, section, index: offset + index }),
          ),
        ),
      )),
    );
  }
  return results;
}
