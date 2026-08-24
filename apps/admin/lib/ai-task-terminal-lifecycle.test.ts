import { describe, expect, it, vi } from 'vitest';

import {
  attachAiTaskTerminalFollowups,
  type AiTaskLifecycleJob,
} from './ai-task-terminal-lifecycle';

function fakeWorker() {
  const listeners: {
    completed?: (job: AiTaskLifecycleJob) => void;
    failed?: (job: AiTaskLifecycleJob | undefined, error: Error) => void;
  } = {};
  return {
    worker: {
      name: 'admin-order-ecotrack',
      on(event: 'completed' | 'failed', listener: never) {
        Object.assign(listeners, { [event]: listener });
      },
    },
    listeners,
  };
}

const job = {
  id: 'job-12',
  name: 'order-ecotrack:selected',
  data: { conversationId: 91 },
  attemptsMade: 1,
  opts: { attempts: 3 },
};

describe('AI task terminal lifecycle', () => {
  it('publishes the reconciled snapshot and retry count after completion', async () => {
    const { worker, listeners } = fakeWorker();
    const publish = vi.fn(async () => undefined);
    const getSnapshot = vi.fn(async () => ({
      status: 'completed',
      progress: { current: 2, total: 2, phase: 'completed' },
      resultSummary: { created: 1, failed: 1 },
      errorMessage: null,
      downloadPath: '/api/orders/export/download?jobId=job-12',
    }));
    attachAiTaskTerminalFollowups(worker, { getSnapshot, publish });

    listeners.completed?.(job);

    await vi.waitFor(() => expect(publish).toHaveBeenCalledOnce());
    expect(getSnapshot).toHaveBeenCalledOnce();
    expect(publish).toHaveBeenCalledWith({
      conversationId: 91,
      jobId: 'job-12',
      kind: 'order-ecotrack:selected',
      status: 'completed',
      progress: { current: 2, total: 2, phase: 'completed' },
      summary: { created: 1, failed: 1 },
      errorMessage: null,
      downloadPath: '/api/orders/export/download?jobId=job-12',
      attemptsMade: 1,
    });
  });

  it('waits for the final BullMQ attempt before publishing a failure', async () => {
    const { worker, listeners } = fakeWorker();
    const publish = vi.fn(async () => undefined);
    attachAiTaskTerminalFollowups(worker, {
      getSnapshot: async () => ({
        status: 'failed',
        progress: null,
        resultSummary: null,
        errorMessage: 'Provider unavailable',
        downloadPath: null,
      }),
      publish,
    });

    listeners.failed?.({ ...job, attemptsMade: 1 }, new Error('Provider unavailable'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(publish).not.toHaveBeenCalled();

    listeners.failed?.({ ...job, attemptsMade: 3 }, new Error('Provider unavailable'));
    await vi.waitFor(() => expect(publish).toHaveBeenCalledOnce());
    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed', attemptsMade: 3 }),
    );
  });
});
