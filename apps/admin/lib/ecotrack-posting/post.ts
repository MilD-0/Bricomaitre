import {
  EcotrackMutationRejectedError,
  EcotrackRateLimitError,
  readEcotrackRejected,
  type EcotrackExtendedRateLimitSnapshot,
} from '@bric/storefront-core/ecotrack-client';
import { type EcotrackCatalogRecord } from '../ecotrack-catalog';
import { applySavedEcotrackMutation } from '../ecotrack-mutation-apply';
import {
  claimEcotrackMutation,
  markEcotrackMutationUncertain,
  recordEcotrackMutationResult,
  type CarrierMutation,
} from '../ecotrack-mutations';
import {
  chunkArray,
  getEcotrackProviderEnv,
  sleep,
  type EcotrackProvider,
} from '../ecotrack-provider';
import {
  type Database,
  type EcotrackOrderInput,
  type EcotrackOrderPreviewItem,
  type EcotrackPostingResultItem,
  type EcotrackPostingSummary,
  type EcotrackPreviewResult,
} from './contract';
import { classifyOrdersForEcotrackPosting, validateEcotrackToken } from './preview';
import { createEcotrackOrdersBatch } from './transport';

function createPostingSummary(
  preview: EcotrackPreviewResult,
  provider: EcotrackProvider,
): EcotrackPostingSummary {
  return {
    provider,
    totalRequested: preview.totalRequested,
    eligible: preview.eligible.length,
    created: 0,
    skippedAlreadyPosted: preview.skipped.length,
    invalid: preview.invalid.length,
    failed: 0,
    rateLimits: [],
    results: [
      ...preview.skipped.map((item): EcotrackPostingResultItem => ({
        orderId: item.orderId,
        reference: String(item.orderId),
        tracking: null,
        status: 'skipped',
        message: item.reason,
      })),
      ...preview.invalid.map((item): EcotrackPostingResultItem => ({
        orderId: item.orderId,
        reference: String(item.orderId),
        tracking: null,
        status: 'invalid',
        message: item.message,
      })),
    ],
  };
}

type EcotrackPostingHooks = {
  throwIfCancelled?: () => Promise<void>;
  updateProgress?: (progress: { phase: string; current: number; total: number }) => Promise<void>;
  updateSummary?: (summary: EcotrackPostingSummary) => Promise<void>;
};

function withLatestRateLimit(
  summary: EcotrackPostingSummary,
  rateLimit: EcotrackExtendedRateLimitSnapshot,
) {
  summary.rateLimits = [
    ...summary.rateLimits.filter((entry) => entry.path !== rateLimit.path),
    rateLimit,
  ];
}

async function flushPostingState(
  hooks: EcotrackPostingHooks,
  phase: string,
  current: number,
  total: number,
  summary: EcotrackPostingSummary,
) {
  await hooks.updateProgress?.({ phase, current, total });
  await hooks.updateSummary?.(summary);
}

export async function postOrdersToEcotrack(
  db: Database,
  items: EcotrackOrderInput[],
  catalog: EcotrackCatalogRecord,
  actor: { email?: string | null; name?: string | null },
  options: {
    fetchImpl?: typeof fetch;
    env?: NodeJS.ProcessEnv;
    batchSize?: number;
    mutatingDelayMs?: number;
    provider?: EcotrackProvider;
  } & EcotrackPostingHooks = {},
) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const provider = options.provider ?? 'delivro';
  const env = getEcotrackProviderEnv(provider, options.env ?? process.env);
  const batchSize = Math.min(Math.max(options.batchSize ?? 100, 1), 100);
  const mutatingDelayMs = Math.max(
    options.mutatingDelayMs ?? Number(env.ECOTRACK_MUTATING_DELAY_MS ?? 250),
    0,
  );
  const preview = classifyOrdersForEcotrackPosting(items, catalog);
  const summary = createPostingSummary(preview, provider);
  const inputById = new Map(items.map((item) => [item.row.id, item]));

  await flushPostingState(options, 'validating-token', 0, preview.eligible.length, summary);
  await options.throwIfCancelled?.();

  const tokenValidation = await validateEcotrackToken({ fetchImpl, env });
  withLatestRateLimit(summary, tokenValidation.rateLimit);
  await options.updateSummary?.(summary);

  if (!tokenValidation.success) {
    throw new Error(tokenValidation.message ?? 'ECOTRACK token validation failed.');
  }

  await flushPostingState(
    options,
    'classifying',
    preview.eligible.length,
    preview.eligible.length,
    summary,
  );

  const batches = chunkArray(preview.eligible, batchSize);
  let createdCount = 0;
  let processedCount = 0;

  const publish = async () => {
    // Reporting outages must not strand a successful carrier response.
    try {
      await options.updateSummary?.(summary);
    } catch (error) {
      console.error('Unable to publish carrier progress', error);
    }
  };
  for (const [batchIndex, batch] of batches.entries()) {
    await options.throwIfCancelled?.();
    const claimed: Array<{ item: EcotrackOrderPreviewItem; operation: CarrierMutation }> = [];
    for (const item of batch) {
      const input = inputById.get(item.orderId)!;
      try {
        const operation = await claimEcotrackMutation(db, {
          orderId: item.orderId,
          orderUpdatedAt: input.row.updatedAt,
          kind: 'post',
          provider,
          request: { payload: item.payload, record: input.record },
          actor,
        });
        claimed.push({ item, operation });
      } catch (error) {
        summary.failed += 1;
        summary.results.push({
          orderId: item.orderId,
          reference: item.payload.reference,
          tracking: null,
          status: 'failed',
          failureKind: 'not_sent',
          message: error instanceof Error ? error.message : 'Unable to claim order.',
        });
      }
    }
    if (!claimed.length) continue;
    let createResponse: Awaited<ReturnType<typeof createEcotrackOrdersBatch>>;
    try {
      createResponse = await createEcotrackOrdersBatch(
        claimed.map(({ item }) => item.payload),
        {
          fetchImpl,
          env,
          deadlineAt:
            Math.min(...claimed.map(({ operation }) => operation.createdAt.getTime())) + 120_000,
        },
      );
    } catch (error) {
      const savedOutcomes = await Promise.allSettled(
        claimed.map(({ operation }) =>
          error instanceof EcotrackMutationRejectedError || error instanceof EcotrackRateLimitError
            ? recordEcotrackMutationResult(db, operation, { message: error.message }, false)
            : markEcotrackMutationUncertain(db, operation, error),
        ),
      );
      for (const [index, { item }] of claimed.entries()) {
        const rejectionRecorded =
          (error instanceof EcotrackMutationRejectedError ||
            error instanceof EcotrackRateLimitError) &&
          savedOutcomes[index]?.status === 'fulfilled';
        summary.failed += 1;
        summary.results.push({
          orderId: item.orderId,
          reference: item.payload.reference,
          tracking: null,
          status: 'failed',
          failureKind: rejectionRecorded ? 'provider_rejected' : 'recovery_required',
          message: error instanceof Error ? error.message : 'Carrier outcome needs reconciliation.',
        });
      }
      await publish();
      throw error;
    }
    withLatestRateLimit(summary, createResponse.rateLimit);
    // Finish every response in this issued batch before honoring cancellation.
    for (const { item, operation } of claimed) {
      const result = createResponse.results.get(item.payload.reference);
      let failureKind: EcotrackPostingResultItem['failureKind'] = 'recovery_required';
      try {
        if (
          !result?.raw ||
          (!result.success && !readEcotrackRejected(result.raw)) ||
          (result.success && !result.tracking)
        ) {
          await markEcotrackMutationUncertain(
            db,
            operation,
            new Error('Carrier outcome needs reconciliation.'),
          );
          throw new Error(
            'Carrier outcome needs reconciliation. Open carrier recovery before retrying.',
          );
        }
        const saved = await recordEcotrackMutationResult(db, operation, result, result.success);
        if (!result.success) {
          failureKind = 'provider_rejected';
          throw new Error(result.message ?? 'Carrier rejected the order.');
        }
        await applySavedEcotrackMutation(db, saved);
        createdCount += 1;
        summary.created = createdCount;
        summary.results.push({
          orderId: item.orderId,
          reference: item.payload.reference,
          tracking: result.tracking,
          status: 'created',
          message: result.message ?? 'Created successfully.',
        });
      } catch (error) {
        summary.failed += 1;
        summary.results.push({
          orderId: item.orderId,
          reference: item.payload.reference,
          tracking: result?.tracking ?? null,
          status: 'failed',
          failureKind,
          message: error instanceof Error ? error.message : 'Local carrier recovery is required.',
        });
      }
      processedCount += 1;
    }
    await publish();
    try {
      await options.updateProgress?.({
        phase: 'creating',
        current: processedCount,
        total: preview.eligible.length,
      });
    } catch (error) {
      console.error('Unable to publish carrier progress', error);
    }
    if (mutatingDelayMs > 0 && batchIndex < batches.length - 1) await sleep(mutatingDelayMs);
  }

  await publish();
  return summary;
}
