import { z } from "zod";

export const MARKETING_SEMANTICS_VERSION = "multi_destination_v1" as const;

const nullableIdentifier = z.string().trim().min(1).max(250).optional().nullable();

export const storefrontOrderMarketingSchema = z.object({
  semanticsVersion: z.literal(MARKETING_SEMANTICS_VERSION),
  eventId: z.string().trim().min(1).max(120),
  eventSourceUrl: z.string().url().max(2048),
  google: z.object({
    clientId: nullableIdentifier,
    sessionId: nullableIdentifier,
    gclid: nullableIdentifier,
    gbraid: nullableIdentifier,
    wbraid: nullableIdentifier,
  }).strict().optional(),
  tiktok: z.object({
    clickId: nullableIdentifier,
    cookieId: nullableIdentifier,
  }).strict().optional(),
}).strict();

export type StorefrontOrderMarketing = z.infer<typeof storefrontOrderMarketingSchema>;
