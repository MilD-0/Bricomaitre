import { z } from 'zod';

const productLinkSchema = z.coerce.number().int().positive().nullable().optional();
const optionalShortTextSchema = z
  .string()
  .trim()
  .max(80)
  .optional()
  .nullable()
  .transform((value) => {
    if (value == null) {
      return null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  });

const optionalLinkSchema = z
  .string()
  .trim()
  .max(2048)
  .optional()
  .nullable()
  .transform((value, ctx) => {
    if (value == null) {
      return null;
    }

    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    if (trimmed.startsWith('/')) {
      return trimmed;
    }

    try {
      const url = new URL(trimmed);
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        return trimmed;
      }
    } catch {}

    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Enter a valid relative path or an absolute http(s) URL.',
    });
    return z.NEVER;
  });

const optionalImageUrlSchema = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((value, ctx) => {
    if (value == null) {
      return null;
    }

    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    try {
      new URL(trimmed);
      return trimmed;
    } catch {}

    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Enter a valid image URL.',
    });
    return z.NEVER;
  });

export const assetBannerInputSchema = z.object({
  title: z.string().trim().min(1).max(120),
  titleAr: z.string().trim().min(1).max(120),
  imageUrl: optionalImageUrlSchema,
  imageUrlPortrait: optionalImageUrlSchema,
  imageUrlLandscape: optionalImageUrlSchema,
  productId: productLinkSchema,
  active: z.boolean().default(true),
});

export const assetBannerSchema = assetBannerInputSchema.transform((value, ctx) => {
  if (!value.imageUrlLandscape) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['imageUrlLandscape'],
      message: 'Add a landscape banner image.',
    });
  }

  if (!value.imageUrlPortrait) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['imageUrlPortrait'],
      message: 'Add a portrait banner image.',
    });
  }

  if (!value.imageUrlLandscape || !value.imageUrlPortrait) return z.NEVER;

  return {
    ...value,
    imageUrl: value.imageUrl ?? value.imageUrlLandscape,
  };
});

export const featuredProductGroupInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  nameAr: z.string().trim().min(1).max(120),
  cta: optionalShortTextSchema,
  ctaAr: optionalShortTextSchema,
  link: optionalLinkSchema,
  productIds: z.array(z.coerce.number().int().positive()).default([]),
  brandIds: z.array(z.coerce.number().int().positive()).default([]),
  categoryIds: z.array(z.coerce.number().int().positive()).default([]),
  prioritizeRecommendations: z.boolean().default(false),
  active: z.boolean().default(true),
});

export const featuredProductGroupSchema = featuredProductGroupInputSchema.superRefine(
  (value, ctx) => {
    if (value.productIds.length + value.brandIds.length + value.categoryIds.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['productIds'],
        message: 'Select at least one product, brand, or category.',
      });
    }

    if ((value.cta == null) !== (value.link == null)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [value.cta == null ? 'cta' : 'link'],
        message: 'CTA text and link must both be provided together.',
      });
    }
  },
);

const shortText = z.string().trim().min(1).max(80);
const shortDescription = z.string().trim().min(1).max(140);
const characteristicsSchema = z.array(z.string().trim().min(1).max(80)).min(3);

export const productCardSchema = z.object({
  productId: z.coerce.number().int().positive(),
  titleAr: shortText,
  titleFr: shortText,
  descriptionAr: shortDescription,
  descriptionFr: shortDescription,
  characteristicsAr: characteristicsSchema,
  characteristicsFr: characteristicsSchema,
  active: z.boolean().default(true),
});

export const assetReorderSchema = z.object({
  kind: z.enum(['banner', 'featured-group', 'product-card']),
  items: z
    .array(
      z.object({
        id: z.coerce.number().int().positive(),
        sortOrder: z.coerce.number().int().min(0),
      }),
    )
    .min(1),
});

export const assetMutationRequestSchema = z.strictObject({
  kind: z.string(),
  data: z.unknown(),
});

export const assetReplacementRequestSchema = z.strictObject({
  data: z.unknown(),
});

export const assetActiveToggleSchema = z.strictObject({
  active: z.boolean(),
});

export const featuredProductGroupToggleSchema = z
  .strictObject({
    active: z.boolean().optional(),
    prioritizeRecommendations: z.boolean().optional(),
  })
  .refine(
    (value) =>
      typeof value.active === 'boolean' || typeof value.prioritizeRecommendations === 'boolean',
  );

export const assetProductOptionQuerySchema = z
  .object({
    search: z.string().trim().max(120).default(''),
    ids: z.array(z.number().int().positive()).max(100).default([]),
    page: z.number().int().positive().default(1),
    limit: z.number().int().min(1).max(50).default(20),
  })
  .strict();

export type AssetBannerPayload = z.output<typeof assetBannerSchema>;
export type FeaturedProductGroupPayload = z.output<typeof featuredProductGroupSchema>;
export type ProductCardPayload = z.output<typeof productCardSchema>;

export type AssetMetaProduct = {
  id: number;
  title: string;
  slug: string;
  brandId: number | null;
  categoryId: number | null;
  images: string[];
};

export type AssetMetaBrand = {
  id: number;
  name: string;
};

export type AssetMetaCategory = {
  id: number;
  name: string;
};

export type AssetProductOption = {
  id: number;
  title: string;
  slug: string;
  sku: string | null;
  imageUrl: string | null;
  active: boolean;
};

export type AssetBannerRecord = AssetBannerPayload & {
  id: number;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type FeaturedProductGroupRecord = FeaturedProductGroupPayload & {
  id: number;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type ProductCardRecord = ProductCardPayload & {
  id: number;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type AssetsResponse = {
  banners: AssetBannerRecord[];
  featuredGroups: FeaturedProductGroupRecord[];
  productCards: ProductCardRecord[];
};
