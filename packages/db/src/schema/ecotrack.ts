import {
  bigserial,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  bigint,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { adminSchema } from './namespaces';
import { orders } from './orders';

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
  stopDeskSurcharge: numeric('stop_desk_surcharge', { precision: 10, scale: 2 })
    .notNull()
    .default('0'),
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

export const ecotrackOrderStates = adminSchema.table(
  'ecotrack_order_states',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    orderId: bigint('order_id', { mode: 'number' })
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    reference: text('reference').notNull(),
    trackingNumber: text('tracking_number').notNull(),
    provider: text('provider').notNull().default('delivro'),
    currentStatus: text('current_status').notNull(),
    currentAmount: numeric('current_amount', { precision: 14, scale: 2 }),
    currentAmountSource: text('current_amount_source'),
    deliveryTariff: numeric('delivery_tariff', { precision: 12, scale: 2 }),
    returnTariff: numeric('return_tariff', { precision: 12, scale: 2 }),
    stopDesk: boolean('stop_desk'),
    paymentId: text('payment_id'),
    statusReason: text('status_reason'),
    providerCreatedAt: timestamp('provider_created_at', { withTimezone: true }),
    providerUpdatedAt: timestamp('provider_updated_at', { withTimezone: true }),
    driverPhone: text('driver_phone'),
    estimatedFee: numeric('estimated_fee', { precision: 12, scale: 2 }),
    deskPhone: text('desk_phone'),
    deskCommune: text('desk_commune'),
    deskMapLink: text('desk_map_link'),
    deskAddress: text('desk_address'),
    rawStatusPayload: jsonb('raw_status_payload'),
    rawCreatePayload: jsonb('raw_create_payload'),
    rawLastTrackingPayload: jsonb('raw_last_tracking_payload'),
    rawLastMajPayload: jsonb('raw_last_maj_payload'),
    rawOrderPayload: jsonb('raw_order_payload'),
    lastStatusSyncedAt: timestamp('last_status_synced_at', { withTimezone: true }),
    lastTrackingSyncedAt: timestamp('last_tracking_synced_at', { withTimezone: true }),
    lastMajSyncedAt: timestamp('last_maj_synced_at', { withTimezone: true }),
    lastOrderSyncedAt: timestamp('last_order_synced_at', { withTimezone: true }),
    lastActionAt: timestamp('last_action_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('ecotrack_order_states_order_id_unique').on(t.orderId),
    uniqueIndex('ecotrack_order_states_tracking_unique').on(t.trackingNumber),
    index('idx_ecotrack_order_states_provider').on(t.provider),
    index('idx_ecotrack_order_states_current_status').on(t.currentStatus),
    index('idx_ecotrack_order_states_deleted_status_updated').on(
      t.deletedAt,
      t.currentStatus,
      t.updatedAt.desc(),
    ),
    index('idx_ecotrack_order_states_order_synced').on(t.lastOrderSyncedAt.desc()),
    index('idx_ecotrack_order_states_active_freshness')
      .on(
        sql`coalesce(${t.lastOrderSyncedAt}, ${t.lastStatusSyncedAt}, ${t.updatedAt})`,
        t.updatedAt,
      )
      .where(sql`${t.deletedAt} is null`),
    check(
      'ecotrack_order_states_current_amount_nonnegative_check',
      sql`${t.currentAmount} is null or ${t.currentAmount} >= 0`,
    ),
    check(
      'ecotrack_order_states_delivery_tariff_nonnegative_check',
      sql`${t.deliveryTariff} is null or ${t.deliveryTariff} >= 0`,
    ),
    check(
      'ecotrack_order_states_return_tariff_nonnegative_check',
      sql`${t.returnTariff} is null or ${t.returnTariff} >= 0`,
    ),
  ],
);

export const ecotrackOrderStatusObservations = adminSchema.table(
  'ecotrack_order_status_observations',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    orderId: bigint('order_id', { mode: 'number' })
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    trackingNumber: text('tracking_number').notNull(),
    status: text('status').notNull(),
    effectiveAt: timestamp('effective_at', { withTimezone: true }),
    firstObservedAt: timestamp('first_observed_at', { withTimezone: true }).notNull(),
    lastObservedAt: timestamp('last_observed_at', { withTimezone: true }).notNull(),
    source: text('source').notNull().default('orders_status'),
    sourceKey: text('source_key').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('ecotrack_order_status_observations_source_unique').on(t.orderId, t.sourceKey),
    index('idx_ecotrack_order_status_observations_order_time').on(
      t.orderId,
      t.firstObservedAt.desc(),
    ),
    index('idx_ecotrack_order_status_observations_status_time').on(
      t.status,
      t.firstObservedAt.desc(),
    ),
  ],
);

export const ecotrackOrderActivities = adminSchema.table(
  'ecotrack_order_activities',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    orderId: bigint('order_id', { mode: 'number' })
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    trackingNumber: text('tracking_number').notNull(),
    reason: text('reason'),
    details: text('details'),
    effectiveAt: timestamp('effective_at', { withTimezone: true }),
    postponedTo: date('postponed_to'),
    firstObservedAt: timestamp('first_observed_at', { withTimezone: true }).notNull(),
    lastObservedAt: timestamp('last_observed_at', { withTimezone: true }).notNull(),
    sourceKey: text('source_key').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('ecotrack_order_activities_source_unique').on(t.orderId, t.sourceKey),
    index('idx_ecotrack_order_activities_order_time').on(t.orderId, t.effectiveAt.desc()),
    index('idx_ecotrack_order_activities_postponed')
      .on(t.postponedTo)
      .where(sql`${t.postponedTo} is not null`),
  ],
);

export const ecotrackOrderMajEntries = adminSchema.table(
  'ecotrack_order_maj_entries',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    orderId: bigint('order_id', { mode: 'number' })
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    trackingNumber: text('tracking_number').notNull(),
    remarque: text('remarque').notNull(),
    station: text('station'),
    livreur: text('livreur'),
    remoteCreatedAt: timestamp('remote_created_at', { withTimezone: true }).notNull(),
    raw: jsonb('raw').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('ecotrack_order_maj_entries_unique').on(t.orderId, t.remarque, t.remoteCreatedAt),
    index('idx_ecotrack_order_maj_entries_order_created').on(t.orderId, t.remoteCreatedAt.desc()),
    index('idx_ecotrack_order_maj_entries_tracking_created').on(
      t.trackingNumber,
      t.remoteCreatedAt.desc(),
    ),
  ],
);

export const ecotrackOrderTrackingEvents = adminSchema.table(
  'ecotrack_order_tracking_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    orderId: bigint('order_id', { mode: 'number' })
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    trackingNumber: text('tracking_number').notNull(),
    eventDate: date('event_date').notNull(),
    eventTime: text('event_time').notNull(),
    status: text('status').notNull(),
    scanLocation: text('scan_location'),
    raw: jsonb('raw').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('ecotrack_order_tracking_events_unique').on(
      t.orderId,
      t.eventDate,
      t.eventTime,
      t.status,
      sql`coalesce(${t.scanLocation}, '')`,
    ),
    index('idx_ecotrack_order_tracking_events_order_date_time').on(
      t.orderId,
      t.eventDate.desc(),
      t.eventTime.desc(),
    ),
    index('idx_ecotrack_order_tracking_events_tracking_date_time').on(
      t.trackingNumber,
      t.eventDate.desc(),
      t.eventTime.desc(),
    ),
    index('idx_ecotrack_order_tracking_events_status').on(t.status),
    index('idx_ecotrack_order_tracking_events_date_status').on(t.eventDate, t.status),
  ],
);
