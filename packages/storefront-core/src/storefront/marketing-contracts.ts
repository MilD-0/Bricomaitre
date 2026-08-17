import { z } from 'zod';

export const MARKETING_SEMANTICS_VERSION = 'multi_destination_v1' as const;
export const ORDER_ACQUISITION_SEMANTICS_VERSION = 'order_acquisition_v2' as const;
export const ORDER_AI_INFLUENCE_SEMANTICS_VERSION = 'order_ai_influence_v1' as const;

const nullableIdentifier = z.string().trim().min(1).max(250).optional().nullable();

export const storefrontAcquisitionTouchSchema = z
  .object({
    sessionId: z.string().trim().min(1).max(120),
    journeyId: z.string().trim().min(1).max(120),
    landingPath: z.string().trim().startsWith('/').max(2048),
    referrer: z.string().url().max(500).optional().nullable(),
    utmSource: nullableIdentifier,
    utmMedium: nullableIdentifier,
    utmCampaign: z.string().trim().min(1).max(180).optional().nullable(),
    utmTerm: z.string().trim().min(1).max(180).optional().nullable(),
    utmContent: z.string().trim().min(1).max(180).optional().nullable(),
    hasMetaClickId: z.boolean().default(false),
    hasGoogleClickId: z.boolean().default(false),
    hasTikTokClickId: z.boolean().default(false),
    capturedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export const storefrontOrderMarketingSchema = z
  .object({
    semanticsVersion: z.literal(MARKETING_SEMANTICS_VERSION),
    eventId: z.string().trim().min(1).max(120),
    eventSourceUrl: z.string().url().max(2048),
    sessionEntry: storefrontAcquisitionTouchSchema.optional(),
    lastNonDirectTouch: storefrontAcquisitionTouchSchema.optional(),
    acquisition: z
      .object({
        landingPath: z.string().trim().startsWith('/').max(2048),
        utmSource: nullableIdentifier,
        utmMedium: nullableIdentifier,
        utmCampaign: z.string().trim().min(1).max(180).optional().nullable(),
        utmTerm: z.string().trim().min(1).max(180).optional().nullable(),
        utmContent: z.string().trim().min(1).max(180).optional().nullable(),
        capturedAt: z.string().datetime({ offset: true }),
      })
      .strict()
      .optional(),
    assistant: z
      .object({
        sourceSessionId: z.string().trim().min(1).max(120),
        journeyId: z.string().trim().min(1).max(120),
        openedAt: z.string().datetime({ offset: true }).optional().nullable(),
        engagedAt: z.string().datetime({ offset: true }).optional().nullable(),
        recommendationClickedAt: z.string().datetime({ offset: true }).optional().nullable(),
        clickedProductIds: z.array(z.number().int().positive()).max(20).default([]),
        capturedAt: z.string().datetime({ offset: true }),
      })
      .strict()
      .optional(),
    google: z
      .object({
        clientId: nullableIdentifier,
        sessionId: nullableIdentifier,
        gclid: nullableIdentifier,
        gbraid: nullableIdentifier,
        wbraid: nullableIdentifier,
      })
      .strict()
      .optional(),
    tiktok: z
      .object({
        clickId: nullableIdentifier,
        cookieId: nullableIdentifier,
      })
      .strict()
      .optional(),
  })
  .strict();

export type StorefrontOrderMarketing = z.infer<typeof storefrontOrderMarketingSchema>;
export type StorefrontAcquisitionTouch = z.infer<typeof storefrontAcquisitionTouchSchema>;
