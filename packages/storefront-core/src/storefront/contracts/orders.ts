import { z } from 'zod';
import {
  deliveryTypeSchema,
  orderStatusSchema,
  productPromosSchema,
  storefrontOrderCreateSchema,
} from '../../orders-support';
import { storefrontOrderMarketingSchema } from '../marketing-contracts';
import { storefrontOrderMetaResponseSchema, storefrontOrderMetaSchema } from '../meta-contracts';
import { isoTimestampSchema } from './primitives';

export const storefrontOrderCreateRequestSchema = storefrontOrderCreateSchema
  .extend({
    expectedProductSubtotal: z.number().finite().nonnegative().optional(),
    meta: storefrontOrderMetaSchema.optional(),
    marketing: storefrontOrderMarketingSchema.optional(),
  })
  .superRefine((value, context) => {
    if (
      value.meta &&
      value.marketing &&
      (value.meta.leadEventId !== value.marketing.eventId ||
        value.meta.eventSourceUrl !== value.marketing.eventSourceUrl)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['marketing', 'eventId'],
        message: 'Meta and multi-destination order events must share identity and source.',
      });
    }
  });

export const storefrontEcotrackCatalogResponseSchema = z.object({
  wilayas: z.array(
    z.object({
      wilayaId: z.number().int().positive(),
      name: z.string(),
    }),
  ),
  communes: z.array(
    z.object({
      // Ecotrack's source data includes the valid external commune identifier 0
      // (Abadla, Wilaya 08), so this must accept a non-negative external id.
      communeId: z.number().int().nonnegative(),
      wilayaId: z.number().int().positive(),
      name: z.string(),
      postalCode: z.string().nullable(),
      hasStopDesk: z.boolean(),
    }),
  ),
  serviceFees: z.array(
    z.object({
      serviceType: z.string(),
      wilayaId: z.number().int().positive(),
      homeFee: z.string(),
      stopDeskFee: z.string(),
    }),
  ),
  weightFees: z.array(
    z.object({
      serviceType: z.string(),
      homeSurcharge: z.string(),
      stopDeskSurcharge: z.string(),
      perAdditionalKg: z.string(),
      startsAtKg: z.string(),
    }),
  ),
  lastSync: z.object({}).passthrough().nullable(),
});

export const storefrontOrderStatusHistorySchema = z.object({
  id: z.number().int().positive(),
  status: orderStatusSchema,
  noAnswerCount: z.number().int().min(0),
  changedAt: isoTimestampSchema,
});

export const storefrontOrderResponseItemSchema = z.object({
  id: z.number().int().positive(),
  publicToken: z.string().nullable(),
  purchaseEventId: z.string().min(1).max(120).nullable().default(null),
  variant: z.string().nullable().optional(),
  isDegradedCapture: z.boolean().optional(),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  fullName: z.string(),
  email: z.string().email().nullable(),
  phoneNumber1: z.string(),
  phoneNumber2: z.string().nullable(),
  cartProducts: z.array(z.string()),
  orderProducts: z.array(
    z.object({
      productId: z.number().int().positive().nullable(),
      brandId: z.number().int().nullable().optional(),
      rawValue: z.string(),
      slug: z.string().nullable().optional(),
      title: z.string(),
      titleAr: z.string().nullable().optional(),
      unitPrice: z.number(),
      quantity: z.number().int().positive(),
      lineTotal: z.number(),
      thumbnailUrl: z.string().nullable(),
      missing: z.boolean(),
    }),
  ),
  delivery: deliveryTypeSchema,
  state: z.number().int().nullable(),
  city: z.string().nullable(),
  homeAddress: z.string().nullable(),
  productSubtotal: z.number(),
  deliveryFee: z.number(),
  totalAmount: z.number(),
  promoCode: z.string().nullable().default(null),
  productPromos: productPromosSchema.optional(),
  promoProductId: z.number().int().positive().nullable().default(null),
  promoOriginalSubtotal: z.number().nullable().default(null),
  promoDiscountAmount: z.number().default(0),
  promoFinalSubtotal: z.number().nullable().default(null),
  note: z.string().nullable(),
  inHouseStatus: orderStatusSchema,
  noAnswerCount: z.number().int().min(0),
  confirmedAt: isoTimestampSchema.nullable(),
  hasStatusHistory: z.boolean(),
  statusHistory: z.array(storefrontOrderStatusHistorySchema),
});

export const storefrontCreateOrderResponseSchema = z.object({
  ok: z.literal(true),
  item: storefrontOrderResponseItemSchema,
  meta: storefrontOrderMetaResponseSchema.optional(),
  coalesced: z.boolean().optional().default(false),
});

export const storefrontReadOrderResponseSchema = z.object({
  item: storefrontOrderResponseItemSchema,
});

export const storefrontPatchOrderResponseSchema = z.object({
  ok: z.literal(true),
  item: storefrontOrderResponseItemSchema,
});

export const storefrontProductPromoResponseSchema = z.object({
  ok: z.boolean(),
  promo: z
    .object({
      code: z.string(),
      productId: z.number().int().positive(),
      originalPrice: z.number(),
      promoPrice: z.number(),
      discountAmount: z.number(),
    })
    .nullable(),
});

export type StorefrontEcotrackCatalogResponse = z.infer<
  typeof storefrontEcotrackCatalogResponseSchema
>;

export type StorefrontOrderCreateRequest = z.infer<typeof storefrontOrderCreateRequestSchema>;

export type StorefrontOrderResponseItem = z.infer<typeof storefrontOrderResponseItemSchema>;
