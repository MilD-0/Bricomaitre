import { z } from 'zod';

export const ecotrackMajEntrySchema = z
  .object({
    remarque: z.string().trim(),
    station: z.string().trim().optional().nullable(),
    livreur: z.string().trim().optional().nullable(),
    created_at: z.string().trim(),
    tracking: z.string().trim(),
  })
  .passthrough();

const ecotrackTrackingInfoActivitySchema = z
  .object({
    date: z.string().trim().min(1),
    time: z.string().trim().min(1),
    status: z.string().trim().min(1),
    scanLocation: z.string().trim().optional().nullable(),
  })
  .passthrough();

const ecotrackOrderInfoSchema = z
  .object({
    tracking: z.string().trim().min(1),
    reference: z.union([z.string(), z.number()]).optional().nullable(),
    montant: z.union([z.string(), z.number()]).optional().nullable(),
    tarif_prestation: z.union([z.string(), z.number()]).optional().nullable(),
    tarif_retour: z.union([z.string(), z.number()]).optional().nullable(),
    stop_desk: z.union([z.boolean(), z.string(), z.number()]).optional().nullable(),
    payment_id: z.union([z.string(), z.number()]).optional().nullable(),
    status_reason: z.string().trim().optional().nullable(),
    created_at: z.string().trim().optional().nullable(),
    last_updated_at: z.string().trim().optional().nullable(),
    livred_at: z.string().trim().optional().nullable(),
  })
  .passthrough();

export const ecotrackTrackingInfoSchema = z
  .object({
    recipientName: z.string().trim().optional().nullable(),
    shippedBy: z.string().trim().optional().nullable(),
    originCity: z.union([z.number(), z.string()]).optional().nullable(),
    destLocationCity: z.union([z.number(), z.string()]).optional().nullable(),
    status: z.string().trim().optional().nullable(),
    OrderInfo: ecotrackOrderInfoSchema.optional().nullable(),
    deliveryAttempts: z.array(z.unknown()).default([]),
    activity: z.array(ecotrackTrackingInfoActivitySchema).default([]),
  })
  .passthrough();

const ecotrackStatusActivitySchema = z
  .object({
    reason: z.string().trim().optional().nullable(),
    details: z.string().trim().optional().nullable(),
    station: z.string().trim().optional().nullable(),
    driver: z.string().trim().optional().nullable(),
    date: z.string().trim().optional().nullable(),
    time: z.string().trim().optional().nullable(),
    postponed_to: z.union([z.string(), z.null()]).optional(),
  })
  .passthrough();

export const ecotrackStatusItemSchema = z
  .object({
    status: z.string().trim().min(1),
    order_id: z.union([z.string(), z.number()]).optional().nullable(),
    desk_phone: z.string().trim().optional().nullable(),
    desk_commune: z.string().trim().optional().nullable(),
    desk_map_link: z.string().trim().optional().nullable(),
    desk_address: z.string().trim().optional().nullable(),
    driver_phone: z.string().trim().optional().nullable(),
    estimated_fee: z.union([z.string(), z.number()]).optional().nullable(),
    activity: z.array(ecotrackStatusActivitySchema).default([]),
  })
  .passthrough();

const ecotrackOrderSummarySchema = ecotrackOrderInfoSchema.extend({
  status: z.string().trim().min(1),
});

export const ecotrackOrdersPageSchema = z
  .object({
    current_page: z.union([z.string(), z.number()]).optional(),
    last_page: z.union([z.string(), z.number()]).optional(),
    next_page_url: z.string().nullable().optional(),
    data: z.array(ecotrackOrderSummarySchema),
  })
  .passthrough();

export type EcotrackMajEntry = z.infer<typeof ecotrackMajEntrySchema>;

export type EcotrackTrackingInfo = z.infer<typeof ecotrackTrackingInfoSchema>;

export type EcotrackStatusItem = z.infer<typeof ecotrackStatusItemSchema>;

export type EcotrackOrderInfo = z.infer<typeof ecotrackOrderInfoSchema>;

export type EcotrackOrderSummary = z.infer<typeof ecotrackOrderSummarySchema>;

export type EcotrackOrdersPage = z.infer<typeof ecotrackOrdersPageSchema>;
