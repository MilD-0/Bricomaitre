import {
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  primaryKey,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import { adminSchema } from './namespaces';

export const ecotrackWilayas = adminSchema.table(
  'ecotrack_wilayas',
  {
    wilayaId: integer('wilaya_id').primaryKey(),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_ecotrack_wilayas_name').on(t.name)],
);

export const ecotrackCommunes = adminSchema.table(
  'ecotrack_communes',
  {
    communeId: integer('commune_id').primaryKey(),
    wilayaId: integer('wilaya_id')
      .notNull()
      .references(() => ecotrackWilayas.wilayaId, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    postalCode: text('postal_code'),
    hasStopDesk: boolean('has_stop_desk').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_ecotrack_communes_wilaya').on(t.wilayaId),
    index('idx_ecotrack_communes_name').on(t.name),
  ],
);

export const ecotrackServiceFees = adminSchema.table(
  'ecotrack_service_fees',
  {
    serviceType: text('service_type').notNull(),
    wilayaId: integer('wilaya_id')
      .notNull()
      .references(() => ecotrackWilayas.wilayaId, { onDelete: 'cascade' }),
    homeFee: numeric('home_fee', { precision: 10, scale: 2 }).notNull().default('0'),
    stopDeskFee: numeric('stop_desk_fee', { precision: 10, scale: 2 }).notNull().default('0'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.serviceType, t.wilayaId] }),
    index('idx_ecotrack_service_fees_wilaya').on(t.wilayaId),
  ],
);

export const ecotrackWeightFees = adminSchema.table('ecotrack_weight_fees', {
  serviceType: text('service_type').primaryKey(),
  homeSurcharge: numeric('home_surcharge', { precision: 10, scale: 2 }).notNull().default('0'),
  stopDeskSurcharge: numeric('stop_desk_surcharge', { precision: 10, scale: 2 }).notNull().default('0'),
  perAdditionalKg: numeric('per_additional_kg', { precision: 10, scale: 2 }).notNull().default('0'),
  startsAtKg: numeric('starts_at_kg', { precision: 10, scale: 2 }).notNull().default('0'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const ecotrackSyncRuns = adminSchema.table(
  'ecotrack_sync_runs',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    trigger: text('trigger').notNull(),
    status: text('status').notNull(),
    requestCount: integer('request_count').notNull().default(0),
    wilayaCount: integer('wilaya_count').notNull().default(0),
    communeCount: integer('commune_count').notNull().default(0),
    serviceFeeCount: integer('service_fee_count').notNull().default(0),
    weightFeeCount: integer('weight_fee_count').notNull().default(0),
    rateLimitSnapshot: jsonb('rate_limit_snapshot'),
    errorMessage: text('error_message'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_ecotrack_sync_runs_started_at').on(t.startedAt),
    index('idx_ecotrack_sync_runs_status').on(t.status),
  ],
);
