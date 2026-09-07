import { startOwnedJob } from '@bric/runtime/jobs';
import { createAdminAiLandingPage, editAdminAiLandingPage } from '../admin-ai-landing-pages';
import {
  ADMIN_AI_LANDING_PAGE_QUEUE,
  type AiLandingPagePayload,
  type QueueJobMeta,
  assistantJobOrigin,
  toClientJob,
} from '../background-job-contract';

export async function startAiLandingPageJob(
  ownerKey: string,
  payload: Omit<AiLandingPagePayload, keyof QueueJobMeta>,
  requestId?: string,
) {
  const result = await startOwnedJob<AiLandingPagePayload>({
    queueName: ADMIN_AI_LANDING_PAGE_QUEUE,
    kind: `ai-landing-page:${payload.work.operation}`,
    ownerKey,
    origin: assistantJobOrigin(payload),
    conversationId: payload.conversationId,
    requestId,
    data: payload as AiLandingPagePayload,
  });
  return { kind: result.kind, job: toClientJob(result.job) };
}

export type AiLandingPageJobDependencies = {
  create: typeof createAdminAiLandingPage;
  revise: typeof editAdminAiLandingPage;
};

const aiLandingPageJobDependencies: AiLandingPageJobDependencies = {
  create: createAdminAiLandingPage,
  revise: editAdminAiLandingPage,
};

function landingPageJobSummary(
  operation: AiLandingPagePayload['work']['operation'],
  result: Awaited<ReturnType<typeof createAdminAiLandingPage>>,
) {
  const stages = result.generation.stages as {
    status?: string;
    failures?: unknown[];
    [key: string]: unknown;
  } | null;
  return {
    operation,
    complete: stages?.status === 'completed',
    partial: stages?.status === 'partial-fallback',
    landingPageId: result.id,
    productId: result.productId,
    locale: result.locale,
    slug: result.slug,
    active: result.active,
    currentRevision: result.currentRevision,
    generation: {
      model: result.generation.model,
      stages,
      groundingNotes: result.generation.groundingNotes,
    },
  };
}

export async function runAiLandingPageJob(
  payload: AiLandingPagePayload,
  helpers: {
    updateProgress: (progress: { phase: string; current: number; total: number }) => Promise<void>;
    updateSummary: (summary: Record<string, unknown>) => Promise<void>;
    throwIfCancelled: () => Promise<void>;
  },
  dependencies: AiLandingPageJobDependencies = aiLandingPageJobDependencies,
) {
  await helpers.throwIfCancelled();
  await helpers.updateProgress({ phase: 'generating', current: 0, total: 1 });
  const result =
    payload.work.operation === 'create'
      ? await dependencies.create(
          {
            productId: payload.work.productId,
            locale: payload.work.locale,
            creativeBrief: payload.work.creativeBrief,
            active: payload.work.publish,
          },
          payload.actor,
        )
      : await dependencies.revise(
          {
            landingPageId: payload.work.landingPageId,
            expectedRevision: payload.work.expectedRevision,
            instruction: payload.work.instruction,
            targetBlockIds: payload.work.targetBlockIds,
            deleteBlockIds: payload.work.deleteBlockIds,
            allowStructuralChanges: payload.work.allowStructuralChanges,
            active:
              payload.work.publication === 'preserve'
                ? null
                : payload.work.publication === 'publish',
          },
          payload.actor,
        );
  const summary = landingPageJobSummary(payload.work.operation, result);
  await helpers.updateProgress({ phase: 'completed', current: 1, total: 1 });
  await helpers.updateSummary(summary);
  return summary;
}
