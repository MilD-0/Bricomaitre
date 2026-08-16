import {
  bigint,
  bigserial,
  boolean,
  check,
  foreignKey,
  index,
  jsonb,
  numeric,
  pgTable,
  pgEnum,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { categories } from './categories';
import { products } from './products';

export const productAttributeDataTypeEnum = pgEnum('product_attribute_data_type', [
  'text',
  'number',
  'boolean',
  'enum',
  'multi_enum',
]);
export const productKnowledgeSourceEnum = pgEnum('product_knowledge_source', [
  'manufacturer',
  'admin',
  'algorithm',
  'ai',
  'customer_behavior',
]);
export const productKnowledgeReviewStatusEnum = pgEnum('product_knowledge_review_status', [
  'proposed',
  'verified',
  'rejected',
  'expired',
]);
export const productRelationTypeEnum = pgEnum('product_relation_type', [
  'compatible_with',
  'requires',
  'alternative_to',
  'accessory_for',
  'frequently_bought_with',
]);
export const productProjectSuitabilityEnum = pgEnum('product_project_suitability', [
  'recommended',
  'suitable',
  'conditional',
  'unsuitable',
]);
export const productEvidenceTypeEnum = pgEnum('product_evidence_type', [
  'manufacturer_document',
  'manufacturer_page',
  'admin_note',
  'sales_data',
  'other',
]);

export const productAttributeDefinitions = pgTable(
  'product_attribute_definitions',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    key: text('key').notNull(),
    name: text('name').notNull(),
    nameAr: text('name_ar'),
    description: text('description'),
    dataType: productAttributeDataTypeEnum('data_type').notNull(),
    unit: text('unit'),
    allowedValues: jsonb('allowed_values'),
    categoryId: bigint('category_id', { mode: 'number' }).references(() => categories.id, {
      onDelete: 'cascade',
    }),
    required: boolean('required').notNull().default(false),
    filterable: boolean('filterable').notNull().default(false),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('product_attribute_definitions_key_category_unique').on(
      t.key,
      sql`coalesce(${t.categoryId}, 0)`,
    ),
    index('idx_product_attribute_definitions_category').on(t.categoryId),
    index('idx_product_attribute_definitions_active').on(t.active),
  ],
);

export const productAttributeValues = pgTable(
  'product_attribute_values',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    productId: bigint('product_id', { mode: 'number' })
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    definitionId: bigint('definition_id', { mode: 'number' })
      .notNull()
      .references(() => productAttributeDefinitions.id, { onDelete: 'cascade' }),
    value: jsonb('value').notNull(),
    source: productKnowledgeSourceEnum('source').notNull().default('admin'),
    confidence: numeric('confidence', { precision: 5, scale: 4 }),
    reviewStatus: productKnowledgeReviewStatusEnum('review_status').notNull().default('verified'),
    evidenceSummary: text('evidence_summary'),
    createdBy: text('created_by'),
    reviewedBy: text('reviewed_by'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('product_attribute_values_product_definition_unique').on(
      t.productId,
      t.definitionId,
    ),
    index('idx_product_attribute_values_definition').on(t.definitionId),
    index('idx_product_attribute_values_review').on(t.reviewStatus),
    check(
      'product_attribute_values_confidence_check',
      sql`${t.confidence} is null or (${t.confidence} >= 0 and ${t.confidence} <= 1)`,
    ),
  ],
);

export const projectTypes = pgTable(
  'project_types',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    nameAr: text('name_ar'),
    description: text('description'),
    parentId: bigint('parent_id', { mode: 'number' }),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('project_types_slug_unique').on(t.slug),
    index('idx_project_types_parent').on(t.parentId),
    index('idx_project_types_active').on(t.active),
    foreignKey({
      columns: [t.parentId],
      foreignColumns: [t.id],
      name: 'project_types_parent_id_fkey',
    }).onDelete('set null'),
  ],
);

export const productProjectUses = pgTable(
  'product_project_uses',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    productId: bigint('product_id', { mode: 'number' })
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    projectTypeId: bigint('project_type_id', { mode: 'number' })
      .notNull()
      .references(() => projectTypes.id, { onDelete: 'cascade' }),
    suitability: productProjectSuitabilityEnum('suitability').notNull().default('suitable'),
    source: productKnowledgeSourceEnum('source').notNull().default('admin'),
    confidence: numeric('confidence', { precision: 5, scale: 4 }),
    reviewStatus: productKnowledgeReviewStatusEnum('review_status').notNull().default('verified'),
    evidenceSummary: text('evidence_summary'),
    createdBy: text('created_by'),
    reviewedBy: text('reviewed_by'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('product_project_uses_product_project_unique').on(t.productId, t.projectTypeId),
    index('idx_product_project_uses_project').on(t.projectTypeId),
    index('idx_product_project_uses_review').on(t.reviewStatus),
    check(
      'product_project_uses_confidence_check',
      sql`${t.confidence} is null or (${t.confidence} >= 0 and ${t.confidence} <= 1)`,
    ),
  ],
);

export const productRelations = pgTable(
  'product_relations',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    sourceProductId: bigint('source_product_id', { mode: 'number' })
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    targetProductId: bigint('target_product_id', { mode: 'number' })
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    relationType: productRelationTypeEnum('relation_type').notNull(),
    source: productKnowledgeSourceEnum('source').notNull().default('admin'),
    confidence: numeric('confidence', { precision: 5, scale: 4 }),
    reviewStatus: productKnowledgeReviewStatusEnum('review_status').notNull().default('verified'),
    createdBy: text('created_by'),
    reviewedBy: text('reviewed_by'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('product_relations_source_target_type_unique').on(
      t.sourceProductId,
      t.targetProductId,
      t.relationType,
    ),
    index('idx_product_relations_target').on(t.targetProductId),
    index('idx_product_relations_type_review').on(t.relationType, t.reviewStatus),
    check(
      'product_relations_distinct_products_check',
      sql`${t.sourceProductId} <> ${t.targetProductId}`,
    ),
    check(
      'product_relations_confidence_check',
      sql`${t.confidence} is null or (${t.confidence} >= 0 and ${t.confidence} <= 1)`,
    ),
  ],
);

export const productRelationEvidence = pgTable(
  'product_relation_evidence',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    relationId: bigint('relation_id', { mode: 'number' })
      .notNull()
      .references(() => productRelations.id, { onDelete: 'cascade' }),
    evidenceType: productEvidenceTypeEnum('evidence_type').notNull(),
    sourceUrl: text('source_url'),
    sourceLabel: text('source_label'),
    excerpt: text('excerpt'),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_product_relation_evidence_relation').on(t.relationId)],
);
