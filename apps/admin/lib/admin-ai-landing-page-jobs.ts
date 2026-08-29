import { z } from 'zod';

import type { ActionActor } from './action-history';
import {
  ADMIN_AI_LANDING_PAGE_QUEUE,
  getLatestExportJob,
  startAiLandingPageJob,
} from './background-jobs';

export const ADMIN_AI_START_LANDING_PAGE_WORK_TOOL_DESCRIPTION = [
  'Start durable landing-page creation or revision.',
  'Creation targets one exact product and language. Revision targets one exact page revision; exact block IDs can bound narrow edits and deletions.',
].join(' ');

const createWorkSchema = z
  .object({
    operation: z.literal('create'),
    productId: z.number().int().positive(),
    locale: z.enum(['fr', 'ar']),
    creativeBrief: z.string().trim().min(1).max(2_000).optional(),
    publish: z.boolean().default(false),
  })
  .strict();

const reviseWorkSchema = z
  .object({
    operation: z.literal('revise'),
    landingPageId: z.number().int().positive(),
    expectedRevision: z.number().int().positive(),
    instruction: z.string().trim().min(1).max(4_000),
    targetBlockIds: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
    deleteBlockIds: z.array(z.string().trim().min(1).max(80)).max(18).default([]),
    allowStructuralChanges: z.boolean().default(false),
    publication: z.enum(['preserve', 'publish', 'draft']).default('preserve'),
  })
  .strict();

export const adminAiLandingPageWorkSchema = z.discriminatedUnion('operation', [
  createWorkSchema,
  reviseWorkSchema,
]);

export const adminAiLandingPageJobStatusSchema = z.object({}).strict();

type LandingPageJobContext = {
  ownerKey: string;
  actor: ActionActor;
  conversationId: number;
};

export async function startAdminAiLandingPageWork(
  rawInput: z.input<typeof adminAiLandingPageWorkSchema>,
  context: LandingPageJobContext,
) {
  const work = adminAiLandingPageWorkSchema.parse(rawInput);
  const result = await startAiLandingPageJob(context.ownerKey, {
    work,
    actor: context.actor,
    conversationId: context.conversationId,
  });
  return {
    kind:
      result.kind === 'busy'
        ? ('landing_page_job_busy' as const)
        : ('landing_page_job_started' as const),
    ok: result.kind !== 'busy',
    startDisposition: result.kind,
    operation: work.operation,
    job: result.job,
  };
}

export async function getAdminAiLandingPageJobStatus(ownerKey: string) {
  return {
    kind: 'landing_page_job_status' as const,
    job: await getLatestExportJob(ADMIN_AI_LANDING_PAGE_QUEUE, ownerKey),
  };
}
