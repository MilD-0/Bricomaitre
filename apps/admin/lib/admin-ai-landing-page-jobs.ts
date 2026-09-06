import { z } from 'zod';

import {
  adminAiLandingPageCreateSchema,
  adminAiLandingPageEditSchema,
} from './admin-ai-landing-pages';

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

const createWorkSchema = adminAiLandingPageCreateSchema
  .omit({ active: true })
  .extend({
    operation: z.literal('create'),
    publish: z.boolean().default(false),
  })
  .strict();
const reviseWorkSchema = adminAiLandingPageEditSchema
  .omit({ active: true })
  .extend({
    operation: z.literal('revise'),
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
    ...(result.kind === 'busy' ? {} : { operation: work.operation }),
    job: result.job,
  };
}

export async function getAdminAiLandingPageJobStatus(ownerKey: string) {
  return {
    kind: 'landing_page_job_status' as const,
    job: await getLatestExportJob(ADMIN_AI_LANDING_PAGE_QUEUE, ownerKey),
  };
}
