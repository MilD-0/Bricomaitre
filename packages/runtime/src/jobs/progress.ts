import { UnrecoverableError } from 'bullmq';
import { getRedis } from '../redis';
import { getCancellationKey, nowIso } from './keys';
import { getJobSnapshot, updateSnapshot } from './snapshots';

export async function updateJobProgress(
  queueName: string,
  jobId: string,
  progress: { phase: string; current: number; total: number },
) {
  const safeTotal = Math.max(progress.total, 0);
  const safeCurrent = Math.max(0, Math.min(progress.current, safeTotal || progress.current));
  return updateSnapshot(queueName, jobId, (snapshot) => ({
    ...snapshot,
    progress: {
      phase: progress.phase,
      current: safeCurrent,
      total: safeTotal,
      percentage: safeTotal === 0 ? 0 : Math.round((safeCurrent / safeTotal) * 100),
    },
    updatedAt: nowIso(),
  }));
}

export async function markJobRunning(queueName: string, jobId: string) {
  return updateSnapshot(queueName, jobId, (snapshot) => ({
    ...snapshot,
    status: 'running',
    updatedAt: nowIso(),
  }));
}

export async function markJobCompleted(
  queueName: string,
  jobId: string,
  payload?: { downloadUrl?: string | null; resultSummary?: Record<string, unknown> | null },
) {
  return updateSnapshot(queueName, jobId, (snapshot) => ({
    ...snapshot,
    status: 'completed',
    completedAt: nowIso(),
    updatedAt: nowIso(),
    downloadUrl: payload?.downloadUrl ?? snapshot.downloadUrl,
    resultSummary: payload?.resultSummary ?? snapshot.resultSummary,
  }));
}

export async function markJobFailed(queueName: string, jobId: string, errorMessage: string) {
  return updateSnapshot(queueName, jobId, (snapshot) => ({
    ...snapshot,
    status: snapshot.cancelRequested ? 'cancelled' : 'failed',
    completedAt: nowIso(),
    updatedAt: nowIso(),
    errorMessage,
  }));
}

export async function updateJobSummary(
  queueName: string,
  jobId: string,
  resultSummary: Record<string, unknown>,
) {
  return updateSnapshot(queueName, jobId, (snapshot) => ({
    ...snapshot,
    resultSummary,
    updatedAt: nowIso(),
  }));
}

export async function updateJobDownloadUrl(queueName: string, jobId: string, downloadUrl: string) {
  return updateSnapshot(queueName, jobId, (snapshot) => ({
    ...snapshot,
    downloadUrl,
    updatedAt: nowIso(),
  }));
}

export async function throwIfJobCancelled(queueName: string, jobId: string) {
  const redis = getRedis();
  const [snapshot, cancellationRequested] = await Promise.all([
    getJobSnapshot(queueName, jobId),
    redis.exists(getCancellationKey(queueName, jobId)),
  ]);
  if (snapshot?.cancelRequested || cancellationRequested === 1) {
    throw new UnrecoverableError('Job cancelled.');
  }
}

export function isFinalJobAttempt(
  job: { attemptsMade: number; opts: { attempts?: number } },
  error?: unknown,
) {
  return (
    error instanceof UnrecoverableError ||
    isJobCancellationError(error) ||
    job.attemptsMade >= (job.opts.attempts ?? 1)
  );
}

export function isJobCancellationError(error: unknown) {
  return error instanceof Error && error.message === 'Job cancelled.';
}
