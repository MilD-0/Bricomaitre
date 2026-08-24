import 'dotenv/config';

import { afterAll, describe, expect, it, vi } from 'vitest';

import { createQueueWorker, getJobSnapshot, startOwnedJob } from '@bric/runtime/jobs';
import { closeRedisConnections, getRedis } from '@bric/runtime/redis';

import {
  attachAiTaskTerminalFollowups,
  type AiTaskLifecycleWorker,
} from '../lib/ai-task-terminal-lifecycle';

const runId = crypto.randomUUID();
const queueName = `admin-ai-ecotrack-test-${runId}`;
const ownerKey = `test-owner-${runId}`;
let worker: ReturnType<typeof createQueueWorker<{ conversationId: number }>> | null = null;

async function removeTestKeys() {
  const redis = getRedis();
  let cursor = '0';
  do {
    const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', `*${queueName}*`, 'COUNT', 100);
    cursor = nextCursor;
    if (keys.length > 0) await redis.unlink(...keys);
  } while (cursor !== '0');
}

afterAll(async () => {
  await worker?.close();
  await removeTestKeys();
  await closeRedisConnections();
});

describe('EcoTrack assistant worker terminal delivery with Redis', () => {
  it('carries per-order terminal evidence from a real queued job into its conversation hook', async () => {
    const publish = vi.fn(async () => undefined);
    worker = createQueueWorker<{ conversationId: number }>(queueName, async (_payload, context) => {
      const summary = {
        provider: 'emir',
        totalRequested: 3,
        eligible: 2,
        created: 1,
        skippedAlreadyPosted: 0,
        invalid: 1,
        failed: 1,
        results: [
          {
            orderId: 11,
            reference: '11',
            tracking: 'EM-11',
            status: 'created',
            message: 'Created successfully.',
          },
          {
            orderId: 12,
            reference: '12',
            tracking: null,
            status: 'invalid',
            message: 'Commune is missing.',
          },
          {
            orderId: 13,
            reference: '13',
            tracking: null,
            status: 'failed',
            message: 'Telephone rejected.',
          },
        ],
      };
      await context.updateProgress({ phase: 'creating', current: 2, total: 2 });
      await context.updateSummary(summary);
      return summary;
    });
    attachAiTaskTerminalFollowups(worker as unknown as AiTaskLifecycleWorker, {
      getSnapshot: getJobSnapshot,
      publish,
    });
    await worker.waitUntilReady();

    const started = await startOwnedJob({
      queueName,
      kind: 'order-ecotrack:selected',
      ownerKey,
      data: { conversationId: 812 },
      activeScope: 'owner',
      queueOptions: { attempts: 1 },
    });
    expect(started.kind).toBe('started');

    await vi.waitFor(() => expect(publish).toHaveBeenCalledOnce(), { timeout: 15_000 });
    const snapshot = await getJobSnapshot(queueName, started.job.id);
    expect(snapshot).toMatchObject({
      status: 'completed',
      progress: { phase: 'creating', current: 2, total: 2, percentage: 100 },
      resultSummary: {
        provider: 'emir',
        created: 1,
        invalid: 1,
        failed: 1,
      },
    });
    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 812,
        jobId: started.job.id,
        kind: 'order-ecotrack:selected',
        status: 'completed',
        attemptsMade: 1,
        summary: expect.objectContaining({
          results: expect.arrayContaining([
            expect.objectContaining({ orderId: 11, status: 'created', tracking: 'EM-11' }),
            expect.objectContaining({ orderId: 12, status: 'invalid' }),
            expect.objectContaining({ orderId: 13, status: 'failed' }),
          ]),
        }),
      }),
    );
  });
});
