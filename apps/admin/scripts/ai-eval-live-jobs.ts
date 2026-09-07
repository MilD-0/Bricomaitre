import { createQueueWorker, getLatestOwnedJob, getQueue, getQueueEvents } from '@bric/runtime/jobs';
import { closeRedisConnections } from '@bric/runtime/redis';
import {
  ADMIN_AI_CONTENT_QUEUE,
  ADMIN_AI_CATEGORIZATION_QUEUE,
  ADMIN_AI_LANDING_PAGE_QUEUE,
  ADMIN_ORDER_ECOTRACK_QUEUE,
  ADMIN_ORDER_EXPORT_QUEUE,
  runAiContentJob,
  runAiCategorizationJob,
  runAiLandingPageJob,
  runOrderEcotrackJob,
  runOrderExportJob,
} from '../lib/background-jobs';
import { matrixActor } from './ai-eval-live-fixtures';

export function startMatrixWorkers() {
  const workers = [
    createQueueWorker(ADMIN_AI_CONTENT_QUEUE, runAiContentJob),
    createQueueWorker(ADMIN_AI_CATEGORIZATION_QUEUE, runAiCategorizationJob),
    createQueueWorker(ADMIN_AI_LANDING_PAGE_QUEUE, runAiLandingPageJob),
    createQueueWorker(ADMIN_ORDER_ECOTRACK_QUEUE, runOrderEcotrackJob),
    createQueueWorker(ADMIN_ORDER_EXPORT_QUEUE, runOrderExportJob),
  ];
  const queues = [
    ADMIN_AI_CONTENT_QUEUE,
    ADMIN_AI_CATEGORIZATION_QUEUE,
    ADMIN_AI_LANDING_PAGE_QUEUE,
    ADMIN_ORDER_ECOTRACK_QUEUE,
    ADMIN_ORDER_EXPORT_QUEUE,
  ];
  return {
    async settle() {
      const deadline = Date.now() + 120_000;
      for (;;) {
        const jobs = await Promise.all(
          queues.map((queue) => getLatestOwnedJob(queue, matrixActor.email)),
        );
        if (jobs.every((job) => !job || !['queued', 'running'].includes(job.status)))
          return jobs.filter((job) => job !== null);
        if (Date.now() > deadline) throw new Error('Matrix background work exceeded two minutes');
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    },
    async close() {
      await Promise.all(workers.map((worker) => worker.close()));
      await Promise.all(
        queues.flatMap((queue) => [getQueue(queue).close(), getQueueEvents(queue).close()]),
      );
      await closeRedisConnections();
    },
  };
}
