import { getAiConfig, resolveAiModel, type AiConfig } from '@bric/ai-core';
import {
  landingPageDocumentSchema,
  type LandingPageBlock,
} from '@bric/storefront-core/landing-pages';
import {
  landingPageGenerationInputSchema,
  type LandingPageGenerationStages,
  type LandingPageGenerator,
  type LandingPageStageRunner,
  type TokenUsage,
} from './contract';
import {
  addUsage,
  attemptLandingPageStage,
  createModelStageRunner,
  generateSections,
  landingPageFailureReason,
} from './stages';

export function createLandingPageGenerator(
  config: AiConfig = getAiConfig(),
  stageRunner?: LandingPageStageRunner,
): LandingPageGenerator {
  const runner = stageRunner ?? createModelStageRunner(config);
  return {
    async generate(rawInput) {
      const input = landingPageGenerationInputSchema.parse(rawInput);
      const planned = await attemptLandingPageStage(() => runner.generatePlan(input));
      if (planned.status === 'rejected') throw planned.reason;
      const { plan, usage: planUsage } = planned.value;
      const eligibleSections = plan.sections.filter(
        (section) => section.type !== 'image-gallery' || new Set(input.product.images).size >= 2,
      );
      const sectionResults = await generateSections(runner, input, eligibleSections);
      const usage: TokenUsage = {};
      addUsage(usage, planUsage);
      let retryCount = planned.attempts - 1;

      const generatedBlocks: LandingPageBlock[] = [];
      for (const result of sectionResults) {
        retryCount += result.attempts - 1;
        if (result.status !== 'fulfilled') continue;
        generatedBlocks.push(result.value.block);
        addUsage(usage, result.value.usage);
      }

      const failures: LandingPageGenerationStages['failures'] = [
        ...plan.sections
          .filter((section) => !eligibleSections.includes(section))
          .map((section) => ({
            stage: 'block' as const,
            type: section.type,
            reason: 'insufficient-assets' as const,
          })),
        ...sectionResults.flatMap((result, index) =>
          result.status === 'rejected'
            ? [
                {
                  stage: 'block' as const,
                  type: eligibleSections[index]!.type,
                  reason: landingPageFailureReason(result.reason),
                },
              ]
            : [],
        ),
      ];

      const imageUrl = input.product.images[0] ?? null;
      const title =
        input.locale === 'ar' && input.product.titleAr
          ? input.product.titleAr
          : input.product.title;
      const document = landingPageDocumentSchema.parse({
        schemaVersion: 2,
        theme: { ...plan.theme, shell: 'campaign' },
        seo: { ...plan.seo, indexable: false },
        blocks: [
          {
            id: 'hero',
            type: 'product-hero',
            ...plan.hero,
            surface: 'plain',
            width: 'wide',
            imageUrl,
            imageAlt: title,
            showAddToCart: true,
          },
          ...generatedBlocks,
          {
            id: 'final',
            type: 'final-cta',
            ...plan.finalCta,
            surface: 'accent',
            width: 'wide',
            imageUrl,
            imageAlt: title,
          },
        ],
      });
      const skippedSections = plan.sections.length - generatedBlocks.length;
      const status = skippedSections > 0 ? 'partial-fallback' : 'completed';

      return {
        document,
        reasoning: plan.reasoning,
        groundingNotes: [
          ...plan.groundingNotes,
          `Staged generation produced ${generatedBlocks.length} of ${plan.sections.length} planned middle section(s).`,
        ],
        usage,
        model: resolveAiModel(config, 'content'),
        stages: {
          status,
          plannedSections: plan.sections.length,
          generatedSections: generatedBlocks.length,
          fallbackSections: 0,
          skippedSections,
          retryCount,
          failures,
        },
      };
    },
  };
}
