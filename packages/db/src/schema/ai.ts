import {
  bigint,
  bigserial,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  numeric,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const aiSurfaceEnum = pgEnum('ai_surface', ['admin', 'storefront']);
export const aiRunStatusEnum = pgEnum('ai_run_status', [
  'running',
  'completed',
  'failed',
  'cancelled',
]);
export const aiProposalStatusEnum = pgEnum('ai_proposal_status', [
  'proposed',
  'approved',
  'rejected',
  'applied',
  'expired',
  'failed',
]);

export const aiConversations = pgTable(
  'ai_conversations',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    surface: aiSurfaceEnum('surface').notNull(),
    actorId: text('actor_id'),
    sessionKey: text('session_key'),
    title: text('title'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
  },
  (t) => [
    index('idx_ai_conversations_actor_updated').on(t.actorId, t.updatedAt),
    index('idx_ai_conversations_session').on(t.sessionKey),
    index('idx_ai_conversations_expires').on(t.expiresAt),
  ],
);

export const aiMessages = pgTable(
  'ai_messages',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    conversationId: bigint('conversation_id', { mode: 'number' })
      .notNull()
      .references(() => aiConversations.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    content: jsonb('content').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('idx_ai_messages_conversation_created').on(t.conversationId, t.createdAt)],
);

export const aiRuns = pgTable(
  'ai_runs',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    conversationId: bigint('conversation_id', { mode: 'number' }).references(
      () => aiConversations.id,
      { onDelete: 'set null' },
    ),
    surface: aiSurfaceEnum('surface').notNull(),
    task: text('task').notNull(),
    status: aiRunStatusEnum('status').notNull().default('running'),
    model: text('model').notNull(),
    promptVersion: text('prompt_version').notNull(),
    actorId: text('actor_id'),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    totalTokens: integer('total_tokens'),
    errorCode: text('error_code'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => [
    index('idx_ai_runs_actor_started').on(t.actorId, t.startedAt),
    index('idx_ai_runs_status_started').on(t.status, t.startedAt),
    index('idx_ai_runs_conversation').on(t.conversationId),
  ],
);

export const aiToolCalls = pgTable(
  'ai_tool_calls',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    runId: bigint('run_id', { mode: 'number' })
      .notNull()
      .references(() => aiRuns.id, { onDelete: 'cascade' }),
    toolName: text('tool_name').notNull(),
    status: text('status').notNull(),
    input: jsonb('input'),
    output: jsonb('output'),
    errorCode: text('error_code'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => [
    index('idx_ai_tool_calls_run').on(t.runId),
    index('idx_ai_tool_calls_tool_started').on(t.toolName, t.startedAt),
  ],
);

export const aiProposals = pgTable(
  'ai_proposals',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    runId: bigint('run_id', { mode: 'number' })
      .notNull()
      .references(() => aiRuns.id, { onDelete: 'restrict' }),
    proposalType: text('proposal_type').notNull(),
    status: aiProposalStatusEnum('status').notNull().default('proposed'),
    entityType: text('entity_type').notNull(),
    entityId: bigint('entity_id', { mode: 'number' }).notNull(),
    sourceUpdatedAt: timestamp('source_updated_at', { withTimezone: true }),
    payload: jsonb('payload').notNull(),
    reasoning: text('reasoning'),
    evidence: jsonb('evidence')
      .$type<Array<{ label: string; url?: string; excerpt?: string }>>()
      .notNull()
      .default([]),
    confidence: numeric('confidence', { precision: 5, scale: 4 }),
    requestedBy: text('requested_by'),
    reviewedBy: text('reviewed_by'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    appliedAt: timestamp('applied_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_ai_proposals_run').on(t.runId),
    index('idx_ai_proposals_entity_status').on(t.entityType, t.entityId, t.status),
    index('idx_ai_proposals_requested_created').on(t.requestedBy, t.createdAt),
    index('idx_ai_proposals_expires').on(t.expiresAt),
    check(
      'ai_proposals_confidence_check',
      sql`${t.confidence} is null or (${t.confidence} >= 0 and ${t.confidence} <= 1)`,
    ),
  ],
);
