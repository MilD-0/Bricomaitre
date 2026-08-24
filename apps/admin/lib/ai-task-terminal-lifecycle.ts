import { isFinalJobAttempt } from '@bric/runtime/jobs';

import type { AiTaskTerminalStatus } from './ai-task-followups';

export type AiTaskLifecycleJob = {
  id?: string;
  name: string;
  data: { conversationId?: number };
  attemptsMade: number;
  opts: { attempts?: number };
};

export type AiTaskLifecycleWorker = {
  name: string;
  on: {
    (event: 'completed', listener: (job: AiTaskLifecycleJob) => void): unknown;
    (
      event: 'failed',
      listener: (job: AiTaskLifecycleJob | undefined, error: Error) => void,
    ): unknown;
  };
};

type TaskSnapshot = {
  status: string;
  progress: { current?: number; total?: number; phase?: string } | null;
  resultSummary: Record<string, unknown> | null;
  errorMessage: string | null;
  downloadPath?: string | null;
  downloadUrl?: string | null;
};

type PublishTerminalMessage = (input: {
  conversationId?: number;
  jobId: string;
  kind: string;
  status: AiTaskTerminalStatus;
  progress: TaskSnapshot['progress'];
  summary: Record<string, unknown> | null;
  errorMessage: string | null;
  downloadPath: string | null;
  attemptsMade: number;
}) => Promise<unknown>;

export function attachAiTaskTerminalFollowups(
  worker: AiTaskLifecycleWorker,
  dependencies: {
    getSnapshot: (queueName: string, jobId: string) => Promise<TaskSnapshot | null>;
    publish: PublishTerminalMessage;
    onError?: (error: unknown, event: 'completed' | 'failed') => void;
  },
) {
  const publishState = async (
    job: AiTaskLifecycleJob,
    status: AiTaskTerminalStatus,
    errorMessage?: string,
    loadedSnapshot?: TaskSnapshot | null,
  ) => {
    if (!job.id || !job.data.conversationId) return;
    const snapshot = loadedSnapshot ?? (await dependencies.getSnapshot(worker.name, job.id));
    await dependencies.publish({
      conversationId: job.data.conversationId,
      jobId: job.id,
      kind: job.name,
      status,
      progress: snapshot?.progress ?? null,
      summary: snapshot?.resultSummary ?? null,
      errorMessage: errorMessage ?? snapshot?.errorMessage ?? null,
      downloadPath: snapshot?.downloadPath ?? snapshot?.downloadUrl ?? null,
      attemptsMade: job.attemptsMade,
    });
  };

  worker.on('completed', (job) => {
    void (async () => {
      if (!job.id) return;
      const snapshot = await dependencies.getSnapshot(worker.name, job.id);
      await publishState(
        job,
        snapshot?.status === 'cancelled' ? 'cancelled' : 'completed',
        undefined,
        snapshot,
      );
    })().catch((error) => dependencies.onError?.(error, 'completed'));
  });

  worker.on('failed', (job, error) => {
    if (!job || !isFinalJobAttempt(job)) return;
    const status = error.message === 'Job cancelled.' ? 'cancelled' : 'failed';
    void publishState(job, status, error.message).catch((publishError) =>
      dependencies.onError?.(publishError, 'failed'),
    );
  });
}
