import { z } from 'zod';
import { toStorefrontContactSettings } from '../settings';
import {
  storefrontBrandResponseItemSchema,
  storefrontCategoryResponseItemSchema,
  storefrontProductResponseItemSchema,
} from './catalog';
import { isoTimestampSchema } from './primitives';

export const storefrontAssetsResponseSchema = z.object({
  banners: z.array(
    z.object({
      id: z.number().int().positive(),
      title: z.string(),
      titleAr: z.string().nullable(),
      imageUrl: z.string(),
      imageUrlPortrait: z.string().nullable(),
      imageUrlLandscape: z.string().nullable(),
      productId: z.number().int().positive().nullable(),
      sortOrder: z.number().int(),
      active: z.boolean(),
      createdAt: isoTimestampSchema,
      updatedAt: isoTimestampSchema,
    }),
  ),
  featuredGroups: z.array(
    z.object({
      id: z.number().int().positive(),
      name: z.string(),
      nameAr: z.string().nullable(),
      cta: z.string().nullable(),
      ctaAr: z.string().nullable(),
      link: z.string().nullable(),
      sortOrder: z.number().int(),
      prioritizeRecommendations: z.boolean(),
      active: z.boolean(),
      productIds: z.array(z.number().int()),
      brandIds: z.array(z.number().int()),
      categoryIds: z.array(z.number().int()),
      createdAt: isoTimestampSchema,
      updatedAt: isoTimestampSchema,
    }),
  ),
  productCards: z.array(
    z.object({
      id: z.number().int().positive(),
      productId: z.number().int().positive(),
      titleAr: z.string(),
      titleFr: z.string(),
      descriptionAr: z.string(),
      descriptionFr: z.string(),
      characteristicsAr: z.array(z.string()),
      characteristicsFr: z.array(z.string()),
      sortOrder: z.number().int(),
      active: z.boolean(),
      createdAt: isoTimestampSchema,
      updatedAt: isoTimestampSchema,
    }),
  ),
});

export const storefrontSettingsResponseSchema = z.object({
  phoneDisplay: z.string().min(1),
  phoneHref: z.string().startsWith('tel:+'),
  phoneEnabled: z.boolean(),
  aiAssistantEnabled: z.boolean().default(true),
  contactEmail: z.string().email().nullable().default(null),
  address: z.string().nullable().default(null),
  mapUrl: z.string().url().nullable().default(null),
  facebookUrl: z.string().url().nullable().default(null),
  aiModel: z.string().default('openai/gpt-5.6-luna'),
  aiFallbackModel: z.string().nullable().default(null),
});

export const storefrontAnnouncementSchema = z.object({
  message: z.string(),
});

export const storefrontContentResponseSchema = z.object({
  announcement: storefrontAnnouncementSchema.nullable(),
});

export const defaultStorefrontSettingsResponse = storefrontSettingsResponseSchema.parse(
  toStorefrontContactSettings({
    contactPhone: '0795342826',
    phoneEnabled: true,
    aiAssistantEnabled: true,
    contactEmail: 'bricomaitre@gmail.com',
    address: 'BT N20, Cité 08 Mai 45, Bab Ezzouar 16024, Alger',
    mapUrl: 'https://maps.app.goo.gl/MpAM58nHS2G5JBah8',
    facebookUrl: 'https://www.facebook.com/profile.php?id=61562272954715',
    aiModel: 'openai/gpt-5.6-luna',
    aiFallbackModel: null,
  }),
);

export const storefrontHomepageResponseSchema = z.object({
  banners: storefrontAssetsResponseSchema.shape.banners,
  topProducts: z.array(storefrontProductResponseItemSchema),
  categories: z.array(storefrontCategoryResponseItemSchema),
  productCards: z.array(
    storefrontAssetsResponseSchema.shape.productCards.element.extend({
      product: storefrontProductResponseItemSchema,
    }),
  ),
  brands: z.array(storefrontBrandResponseItemSchema),
  featuredGroups: z.array(
    storefrontAssetsResponseSchema.shape.featuredGroups.element.extend({
      products: z.array(storefrontProductResponseItemSchema),
    }),
  ),
});

export const storefrontHomepageFeaturedGroupProductsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(24).default(12),
});

export const storefrontHomepageFeaturedGroupProductsResponseSchema = z.object({
  items: z.array(storefrontProductResponseItemSchema),
  total: z.number().int().nonnegative(),
});

export type StorefrontAssetsResponse = z.infer<typeof storefrontAssetsResponseSchema>;

export type StorefrontSettingsResponse = z.infer<typeof storefrontSettingsResponseSchema>;

export type StorefrontContentResponse = z.infer<typeof storefrontContentResponseSchema>;

export type StorefrontHomepageResponse = z.infer<typeof storefrontHomepageResponseSchema>;

export type StorefrontHomepageFeaturedGroupProductsQuery = z.infer<
  typeof storefrontHomepageFeaturedGroupProductsQuerySchema
>;

export type StorefrontHomepageFeaturedGroupProductsResponse = z.infer<
  typeof storefrontHomepageFeaturedGroupProductsResponseSchema
>;
