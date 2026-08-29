import { z } from 'zod';

import { buildEcotrackOrderPayload } from './ecotrack';
import type { OrderRecord } from './orders';

const nullableNonNegativeAmountSchema = z
  .union([z.number(), z.string(), z.null()])
  .transform((value) => {
    if (value === null) {
      return null;
    }

    const parsed = typeof value === 'number' ? value : Number.parseFloat(value.trim());
    if (!Number.isFinite(parsed) || parsed < 0) {
      return Number.NaN;
    }

    return Number(parsed.toFixed(2));
  });

const ecotrackShipmentUpdateDraftSchema = z
  .object({
    firstName: z.string().trim().min(1).max(80),
    lastName: z.string().trim().max(80).default(''),
    phoneNumber1: z.string().trim().min(1).max(50),
    phoneNumber2: z.string().trim().max(50).nullable().optional().default(null),
    delivery: z.union([z.literal(0), z.literal(1)]),
    state: z.number().int().min(1).max(58).nullable(),
    city: z.string().trim().min(1).max(120),
    homeAddress: z.string().trim().max(300),
    note: z.string().trim().max(500).nullable().optional().default(null),
    cartProducts: z.array(z.string().trim().min(1).max(160)).max(50).optional(),
    deliveryFee: nullableNonNegativeAmountSchema.optional().default(null),
    subtotalOverride: nullableNonNegativeAmountSchema.optional().default(null),
  })
  .superRefine((value, ctx) => {
    if (value.delivery === 0 && value.homeAddress.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Delivery address is required.',
        path: ['homeAddress'],
      });
    }

    if (value.deliveryFee !== null && Number.isNaN(value.deliveryFee)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Delivery fee must be a non-negative amount.',
        path: ['deliveryFee'],
      });
    }

    if (value.subtotalOverride !== null && Number.isNaN(value.subtotalOverride)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Subtotal override must be a non-negative amount.',
        path: ['subtotalOverride'],
      });
    }
  });

const ecotrackMajCreateRequestSchema = z.object({
  content: z.string().trim().min(1).max(255),
});

const ecotrackDispatchRequestSchema = z.object({
  askCollection: z.boolean().default(false),
});

const ecotrackBulkActionSchema = z.object({
  orderIds: z.array(z.number().int().positive()).min(1).max(100),
});

const ecotrackBulkDispatchRequestSchema = ecotrackBulkActionSchema.extend({
  askCollection: z.boolean().default(false),
});

export type EcotrackOrderUpdateDraft = z.infer<typeof ecotrackShipmentUpdateDraftSchema>;
export type EcotrackDispatchRequest = z.infer<typeof ecotrackDispatchRequestSchema>;

export function buildUpdatePayload(
  record: OrderRecord,
  trackingNumber: string,
  catalog: Parameters<typeof buildEcotrackOrderPayload>[1],
) {
  const payload = buildEcotrackOrderPayload(record, catalog);

  return {
    tracking: trackingNumber,
    reference: payload.reference,
    client: payload.nom_client,
    tel: payload.telephone,
    tel2: payload.telephone_2 ?? undefined,
    adresse: payload.adresse,
    code_postal: payload.code_postal ?? undefined,
    commune: payload.commune,
    wilaya: payload.code_wilaya ? Number(payload.code_wilaya) : undefined,
    montant: payload.montant,
    remarque: payload.remarque ?? undefined,
    product: payload.produit ?? undefined,
    boutique: 'Bricomaitre',
    type: 1,
    stop_desk: payload.stop_desk,
    fragile: 0,
    gps_link: 'https://www.google.com/maps',
  };
}

export function parseEcotrackShipmentUpdateDraft(input: unknown) {
  return ecotrackShipmentUpdateDraftSchema.parse(input);
}

export function parseEcotrackMajCreateRequest(input: unknown) {
  return ecotrackMajCreateRequestSchema.parse(input);
}

export function parseEcotrackDispatchRequest(input: unknown) {
  return ecotrackDispatchRequestSchema.parse(input);
}

export function parseEcotrackBulkAction(input: unknown) {
  return ecotrackBulkActionSchema.parse(input);
}

export function parseEcotrackBulkDispatchRequest(input: unknown) {
  return ecotrackBulkDispatchRequestSchema.parse(input);
}
