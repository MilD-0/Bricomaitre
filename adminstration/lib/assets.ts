import { z } from 'zod';

const productLinkSchema = z.coerce.number().int().positive().nullable().optional();
const optionalShortTextSchema = z.string().trim().max(80).optional().nullable().transform((value) => {
  if (value == null) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
});

const optionalLinkSchema = z.string().trim().max(2048).optional().nullable().transform((value, ctx) => {
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

const optionalImageUrlSchema = z.string().trim().optional().nullable().transform((value, ctx) => {
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

export const assetBannerSchema = z.object({
  title: z.string().trim().min(1).max(120),
  titleAr: z.string().trim().min(1).max(120),
  imageUrl: optionalImageUrlSchema,
  imageUrlPortrait: optionalImageUrlSchema,
  imageUrlLandscape: optionalImageUrlSchema,
  productId: productLinkSchema,
  active: z.boolean().default(true),
}).transform((value, ctx) => {
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

export const featuredProductGroupSchema = z.object({
  name: z.string().trim().min(1).max(120),
  nameAr: z.string().trim().min(1).max(120),
  cta: optionalShortTextSchema,
  ctaAr: optionalShortTextSchema,
  link: optionalLinkSchema,
  productIds: z.array(z.coerce.number().int().positive()).default([]),
  brandIds: z.array(z.coerce.number().int().positive()).default([]),
  categoryIds: z.array(z.coerce.number().int().positive()).default([]),
  showAtTopOfProductsPage: z.boolean().default(false),
  active: z.boolean().default(true),
}).superRefine((value, ctx) => {
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
});

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
  items: z.array(
    z.object({
      id: z.coerce.number().int().positive(),
      sortOrder: z.coerce.number().int().min(0),
    }),
  ).min(1),
});

export type AssetBannerInput = z.input<typeof assetBannerSchema>;
export type AssetBannerPayload = z.output<typeof assetBannerSchema>;
export type FeaturedProductGroupInput = z.input<typeof featuredProductGroupSchema>;
export type FeaturedProductGroupPayload = z.output<typeof featuredProductGroupSchema>;
export type ProductCardInput = z.input<typeof productCardSchema>;
export type ProductCardPayload = z.output<typeof productCardSchema>;
export type AssetReorderPayload = z.output<typeof assetReorderSchema>;

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
