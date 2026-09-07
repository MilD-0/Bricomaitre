import {
  landingPageBenefitsBlockSchema,
  landingPageCommercePanelBlockSchema,
  landingPageComparisonBlockSchema,
  landingPageDocumentSchema,
  landingPageEditorialIntroBlockSchema,
  landingPageFaqBlockSchema,
  landingPageFinalCtaBlockSchema,
  landingPageHeroBlockSchema,
  landingPageImageGalleryBlockSchema,
  landingPageMediaFeatureBlockSchema,
  landingPageProcessBlockSchema,
  landingPageSpecificationsBlockSchema,
  landingPageTrustBandBlockSchema,
  landingPageUseCasesBlockSchema,
  type LandingPageBlock,
  type LandingPageDocument,
} from '@bric/storefront-core/landing-pages';
import { z } from 'zod';
import {
  type LandingPageGenerationInput,
  type LandingPageGenerationResult,
  type LandingPageGenerator,
} from './contract';

export async function generateLandingPageDraft(input: {
  generator: LandingPageGenerator;
  generationInput: LandingPageGenerationInput;
}): Promise<LandingPageGenerationResult> {
  const generated = await input.generator.generate(input.generationInput);
  return {
    ...generated,
    document: normalizeGeneratedLandingPage(
      generated.document,
      input.generationInput.product.images,
    ),
  };
}

export function normalizeGeneratedLandingPage(
  rawDocument: unknown,
  verifiedImages: readonly string[],
): LandingPageDocument {
  const document = landingPageDocumentSchema.parse(rawDocument);
  const allowedImages = new Set(verifiedImages);

  return landingPageDocumentSchema.parse({
    ...document,
    schemaVersion: 2,
    seo: { ...document.seo, indexable: false },
    blocks: document.blocks.map((block) => {
      if (block.type === 'image-gallery') {
        return {
          ...block,
          images: block.images.map((item) =>
            item.imageUrl == null || allowedImages.has(item.imageUrl)
              ? item
              : { ...item, imageUrl: null },
          ),
        };
      }
      if (!('imageUrl' in block) || block.imageUrl == null || allowedImages.has(block.imageUrl))
        return block;
      return { ...block, imageUrl: null };
    }),
  });
}

export function blockSchemaFor(type: LandingPageBlock['type']): z.ZodTypeAny {
  switch (type) {
    case 'product-hero':
      return landingPageHeroBlockSchema;
    case 'benefit-grid':
      return landingPageBenefitsBlockSchema;
    case 'media-feature':
      return landingPageMediaFeatureBlockSchema;
    case 'specifications':
      return landingPageSpecificationsBlockSchema;
    case 'faq':
      return landingPageFaqBlockSchema;
    case 'editorial-intro':
      return landingPageEditorialIntroBlockSchema;
    case 'image-gallery':
      return landingPageImageGalleryBlockSchema;
    case 'use-cases':
      return landingPageUseCasesBlockSchema;
    case 'comparison':
      return landingPageComparisonBlockSchema;
    case 'process':
      return landingPageProcessBlockSchema;
    case 'trust-band':
      return landingPageTrustBandBlockSchema;
    case 'commerce-panel':
      return landingPageCommercePanelBlockSchema;
    case 'final-cta':
      return landingPageFinalCtaBlockSchema;
  }
}
