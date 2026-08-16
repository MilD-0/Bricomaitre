import { z } from 'zod';

export const META_SEMANTICS_VERSION = 'confirmed_purchase_v1' as const;
export const META_BROWSER_EVENT_NAMES = [
  'PageView',
  'ViewContent',
  'AddToCart',
  'InitiateCheckout',
  'Search',
] as const;

export const metaBrowserEventNameSchema = z.enum(META_BROWSER_EVENT_NAMES);

export const metaBrowserEventSchema = z
  .object({
    eventId: z.string().trim().min(1).max(120),
    eventName: metaBrowserEventNameSchema,
    occurredAt: z.string().datetime({ offset: true }).optional(),
    eventSourceUrl: z.string().url().max(2048),
    visitId: z.string().trim().min(1).max(120).optional().nullable(),
    journeyId: z.string().trim().min(1).max(120).optional().nullable(),
    sessionId: z.string().trim().min(1).max(120).optional().nullable(),
    promoCode: z.string().trim().min(1).max(120).optional().nullable(),
    searchTerm: z.string().trim().min(1).max(250).optional().nullable(),
    items: z
      .array(
        z
          .object({
            productId: z.number().int().positive(),
            quantity: z.number().int().positive().max(50),
          })
          .strict(),
      )
      .max(50)
      .optional()
      .default([]),
  })
  .strict()
  .superRefine((event, context) => {
    if (event.eventName === 'Search' && !event.searchTerm) {
      context.addIssue({
        code: 'custom',
        path: ['searchTerm'],
        message: 'searchTerm is required for Search events.',
      });
    }
  });

export const storefrontOrderMetaSchema = z.object({
  semanticsVersion: z.literal(META_SEMANTICS_VERSION),
  leadEventId: z.string().trim().min(1).max(120),
  eventSourceUrl: z.string().url().max(2048),
});

export const storefrontOrderMetaResponseSchema = z.object({
  eventName: z.literal('Purchase'),
  eventId: z.string(),
  value: z.number(),
  currency: z.literal('DZD'),
  contents: z.array(
    z.object({
      id: z.string(),
      quantity: z.number().int().positive(),
      item_price: z.number().nonnegative(),
    }),
  ),
});

export type MetaBrowserEvent = z.infer<typeof metaBrowserEventSchema>;
export type StorefrontOrderMeta = z.infer<typeof storefrontOrderMetaSchema>;
export type StorefrontOrderMetaResponse = z.infer<typeof storefrontOrderMetaResponseSchema>;
