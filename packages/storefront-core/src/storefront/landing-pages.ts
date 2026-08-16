import { z } from 'zod';

import { storefrontProductDetailResponseItemSchema } from './contracts';

export const landingPageLocaleSchema = z.enum(['fr', 'ar']);
export const landingPageSlugSchema = z
  .string()
  .trim()
  .min(2)
  .max(160)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const landingPageBlockIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9-]+$/);

const localizedTextSchema = z.string().trim().min(1).max(1_000);
const optionalTextSchema = z.string().trim().max(4_000).default('');
const imageUrlSchema = z.string().trim().url().max(2_000).nullable().default(null);

const baseBlockSchema = z.object({
  id: landingPageBlockIdSchema,
  surface: z.enum(['plain', 'white', 'soft', 'dark', 'accent']).default('plain'),
  width: z.enum(['narrow', 'wide', 'full']).default('wide'),
});

const campaignIconSchema = z.enum([
  'power',
  'shield',
  'delivery',
  'tool',
  'phone',
  'payment',
  'check',
  'layers',
  'target',
  'sparkles',
]);

export const landingPageHeroBlockSchema = baseBlockSchema.extend({
  type: z.literal('product-hero'),
  variant: z
    .enum(['media-left', 'media-right', 'media-background', 'product-stage', 'editorial'])
    .default('media-left'),
  heading: localizedTextSchema,
  subheading: optionalTextSchema,
  imageUrl: imageUrlSchema,
  imageAlt: z.string().trim().max(300).default(''),
  primaryCtaLabel: localizedTextSchema,
  showAddToCart: z.boolean().default(true),
});

export const landingPageBenefitsBlockSchema = baseBlockSchema.extend({
  type: z.literal('benefit-grid'),
  variant: z.enum(['icons', 'numbered', 'compact']).default('icons'),
  heading: localizedTextSchema,
  items: z
    .array(
      z.object({
        title: localizedTextSchema,
        description: z.string().trim().min(1).max(800),
        icon: campaignIconSchema.default('tool'),
      }),
    )
    .min(2)
    .max(6),
});

export const landingPageMediaFeatureBlockSchema = baseBlockSchema.extend({
  type: z.literal('media-feature'),
  variant: z.enum(['media-left', 'media-right']).default('media-left'),
  heading: localizedTextSchema,
  body: z.string().trim().min(1).max(4_000),
  imageUrl: imageUrlSchema,
  imageAlt: z.string().trim().max(300).default(''),
  bullets: z.array(z.string().trim().min(1).max(300)).max(6).default([]),
});

export const landingPageSpecificationsBlockSchema = baseBlockSchema.extend({
  type: z.literal('specifications'),
  variant: z.enum(['table', 'cards']).default('table'),
  heading: localizedTextSchema,
  items: z
    .array(
      z.object({
        label: localizedTextSchema,
        value: localizedTextSchema,
      }),
    )
    .min(1)
    .max(20),
});

export const landingPageFaqBlockSchema = baseBlockSchema.extend({
  type: z.literal('faq'),
  variant: z.literal('accordion').default('accordion'),
  heading: localizedTextSchema,
  items: z
    .array(
      z.object({
        question: localizedTextSchema,
        answer: z.string().trim().min(1).max(2_000),
      }),
    )
    .min(1)
    .max(12),
});

export const landingPageEditorialIntroBlockSchema = baseBlockSchema.extend({
  type: z.literal('editorial-intro'),
  variant: z.enum(['centered', 'split', 'statement']).default('centered'),
  eyebrow: z.string().trim().max(120).default(''),
  heading: localizedTextSchema,
  body: z.string().trim().min(1).max(4_000),
  highlights: z.array(z.string().trim().min(1).max(240)).max(4).default([]),
});

export const landingPageImageGalleryBlockSchema = baseBlockSchema.extend({
  type: z.literal('image-gallery'),
  variant: z.enum(['spotlight', 'mosaic', 'filmstrip']).default('spotlight'),
  heading: localizedTextSchema,
  images: z
    .array(
      z.object({
        imageUrl: imageUrlSchema,
        imageAlt: z.string().trim().max(300).default(''),
        caption: z.string().trim().max(500).default(''),
      }),
    )
    .min(2)
    .max(8),
});

export const landingPageUseCasesBlockSchema = baseBlockSchema.extend({
  type: z.literal('use-cases'),
  variant: z.enum(['cards', 'editorial', 'mosaic']).default('cards'),
  heading: localizedTextSchema,
  body: optionalTextSchema,
  items: z
    .array(
      z.object({
        title: localizedTextSchema,
        description: z.string().trim().min(1).max(1_000),
        icon: campaignIconSchema.default('target'),
      }),
    )
    .min(2)
    .max(6),
});

export const landingPageComparisonBlockSchema = baseBlockSchema.extend({
  type: z.literal('comparison'),
  variant: z.enum(['table', 'spotlight']).default('table'),
  heading: localizedTextSchema,
  productLabel: localizedTextSchema,
  alternativeLabel: localizedTextSchema,
  items: z
    .array(
      z.object({
        label: localizedTextSchema,
        productValue: localizedTextSchema,
        alternativeValue: localizedTextSchema,
      }),
    )
    .min(2)
    .max(8),
  footnote: z.string().trim().max(1_000).default(''),
});

export const landingPageProcessBlockSchema = baseBlockSchema.extend({
  type: z.literal('process'),
  variant: z.enum(['horizontal', 'vertical', 'timeline']).default('horizontal'),
  heading: localizedTextSchema,
  body: optionalTextSchema,
  steps: z
    .array(
      z.object({
        title: localizedTextSchema,
        description: z.string().trim().min(1).max(1_000),
      }),
    )
    .min(2)
    .max(6),
});

export const landingPageTrustBandBlockSchema = baseBlockSchema.extend({
  type: z.literal('trust-band'),
  variant: z.enum(['ribbon', 'cards', 'minimal']).default('ribbon'),
  heading: z.string().trim().max(1_000).default(''),
  items: z
    .array(
      z.object({
        title: localizedTextSchema,
        description: z.string().trim().max(800).default(''),
        icon: campaignIconSchema.default('shield'),
      }),
    )
    .min(2)
    .max(5),
});

export const landingPageCommercePanelBlockSchema = baseBlockSchema.extend({
  type: z.literal('commerce-panel'),
  variant: z.enum(['spotlight', 'compact', 'image-led']).default('spotlight'),
  heading: localizedTextSchema,
  body: optionalTextSchema,
  bullets: z.array(z.string().trim().min(1).max(300)).max(5).default([]),
  imageUrl: imageUrlSchema,
  imageAlt: z.string().trim().max(300).default(''),
  primaryCtaLabel: localizedTextSchema,
  showAddToCart: z.boolean().default(true),
});

export const landingPageFinalCtaBlockSchema = baseBlockSchema.extend({
  type: z.literal('final-cta'),
  variant: z.enum(['solid', 'split']).default('solid'),
  heading: localizedTextSchema,
  body: optionalTextSchema,
  primaryCtaLabel: localizedTextSchema,
  imageUrl: imageUrlSchema,
  imageAlt: z.string().trim().max(300).default(''),
});

export const landingPageBlockSchema = z.discriminatedUnion('type', [
  landingPageHeroBlockSchema,
  landingPageBenefitsBlockSchema,
  landingPageMediaFeatureBlockSchema,
  landingPageSpecificationsBlockSchema,
  landingPageFaqBlockSchema,
  landingPageEditorialIntroBlockSchema,
  landingPageImageGalleryBlockSchema,
  landingPageUseCasesBlockSchema,
  landingPageComparisonBlockSchema,
  landingPageProcessBlockSchema,
  landingPageTrustBandBlockSchema,
  landingPageCommercePanelBlockSchema,
  landingPageFinalCtaBlockSchema,
]);

export const landingPageDocumentSchema = z
  .object({
    schemaVersion: z.union([z.literal(1), z.literal(2)]).default(2),
    theme: z
      .object({
        accent: z.enum(['orange', 'teal', 'graphite']).default('orange'),
        density: z.enum(['compact', 'comfortable', 'spacious']).default('comfortable'),
        shell: z.literal('campaign').default('campaign'),
      })
      .default({ accent: 'orange', density: 'comfortable', shell: 'campaign' }),
    seo: z.object({
      title: z.string().trim().min(1).max(70),
      description: z.string().trim().min(1).max(170),
      indexable: z.boolean().default(false),
    }),
    blocks: z.array(landingPageBlockSchema).min(1).max(20),
  })
  .superRefine((document, context) => {
    const ids = new Set<string>();
    for (const [index, block] of document.blocks.entries()) {
      if (ids.has(block.id))
        context.addIssue({
          code: 'custom',
          path: ['blocks', index, 'id'],
          message: 'Block IDs must be unique.',
        });
      ids.add(block.id);
    }
    if (!document.blocks.some((block) => block.type === 'product-hero')) {
      context.addIssue({
        code: 'custom',
        path: ['blocks'],
        message: 'A product hero is required.',
      });
    }
    if (!document.blocks.some((block) => block.type === 'final-cta')) {
      context.addIssue({ code: 'custom', path: ['blocks'], message: 'A final CTA is required.' });
    }
  });

export const landingPageCreateSchema = z.object({
  productId: z.number().int().positive(),
  locale: landingPageLocaleSchema,
  document: landingPageDocumentSchema,
});

export const landingPageRecordSchema = z.object({
  id: z.number().int().positive(),
  productId: z.number().int().positive(),
  locale: landingPageLocaleSchema,
  slug: landingPageSlugSchema,
  status: z.enum(['draft', 'published', 'archived']),
  draftRevision: z.number().int().positive(),
  publishedRevision: z.number().int().positive().nullable(),
  updatedAt: z.string().datetime(),
  document: landingPageDocumentSchema,
});

export const storefrontLandingPageResponseSchema = z.object({
  id: z.number().int().positive(),
  slug: landingPageSlugSchema,
  locale: landingPageLocaleSchema,
  revision: z.number().int().positive(),
  publishedAt: z.string().datetime().nullable(),
  document: landingPageDocumentSchema,
  product: storefrontProductDetailResponseItemSchema,
});

export const storefrontLandingPageSitemapResponseSchema = z.object({
  items: z.array(
    z.object({
      slug: landingPageSlugSchema,
      locale: landingPageLocaleSchema,
      updatedAt: z.string().datetime(),
    }),
  ),
});

export type LandingPageBlock = z.infer<typeof landingPageBlockSchema>;
export type LandingPageDocument = z.infer<typeof landingPageDocumentSchema>;
export type LandingPageCreateInput = z.infer<typeof landingPageCreateSchema>;
export type LandingPageRecord = z.infer<typeof landingPageRecordSchema>;
export type StorefrontLandingPageResponse = z.infer<typeof storefrontLandingPageResponseSchema>;
