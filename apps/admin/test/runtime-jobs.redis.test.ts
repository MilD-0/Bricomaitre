import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import {
  createQueueWorker,
  getJobSnapshot,
  getQueue,
  markJobCompleted,
  requestJobCancellationById,
  startOwnedJob,
  updateJobProgress,
  updateJobSummary,
} from '@bric/runtime/jobs';
import { closeRedisConnections, getRedis } from '@bric/runtime/redis';

const prefix = `owned-races-${crypto.randomUUID()}`;
const queues = new Set<string>();
const workers: ReturnType<typeof createQueueWorker>[] = [];
function options(name: string) {
  const queueName = `${prefix}-${name}`;
  queues.add(queueName);
  return {
    queueName,
    kind: 'test',
    ownerKey: 'operator',
    data: { products: [1] },
    activeScope: 'global' as const,
  };
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
  await Promise.all(workers.map((worker) => worker.close()));
  await Promise.all([...queues].map((name) => getQueue(name).close()));
  const redis = getRedis();
  let cursor = '0';
  do {
    const [next, keys] = await redis.scan(cursor, 'MATCH', `*${prefix}*`, 'COUNT', 100);
    cursor = next;
    if (keys.length) await redis.unlink(...keys);
  } while (cursor !== '0');
  await closeRedisConnections();
});

describe('owned job atomicity with Redis', () => {
  it('publishes claim and snapshot together before another caller can acquire the slot', async () => {
    const input = options('claim');
    const redis = getRedis();
    const original = redis.eval.bind(redis);
    const entered = deferred();
    const resume = deferred();
    let paused = false;
    vi.spyOn(redis, 'eval').mockImplementation(async (...args) => {
      const result = await original(...args);
      if (!paused && args[1] === 6) {
        paused = true;
        entered.resolve();
        await resume.promise;
      }
      return result;
    });
    const first = startOwnedJob(input);
    await entered.promise;
    const second = await startOwnedJob({ ...input, ownerKey: 'other' });
    resume.resolve();
    expect((await first).kind).toBe('started');
    expect(second.kind).toBe('busy');
    expect(await getQueue(input.queueName).getWaitingCount()).toBe(1);
  });

  it('returns existing only for the same intent, including its original conversation', async () => {
    const input = { ...options('intent'), conversationId: 12 };
    const first = await startOwnedJob(input);
    expect((await startOwnedJob(input)).kind).toBe('existing');
    expect((await startOwnedJob({ ...input, data: { products: [2] } })).kind).toBe('busy');
    expect((await startOwnedJob({ ...input, conversationId: 13 })).kind).toBe('busy');
    expect((await getJobSnapshot(input.queueName, first.job.id))?.conversationId).toBe(12);
  });

  it('keeps completion and its result when an older cancellation write resumes', async () => {
    const input = options('cancel');
    const { job } = await startOwnedJob(input);
    const redis = getRedis();
    const original = redis.eval.bind(redis);
    const entered = deferred();
    const resume = deferred();
    let paused = false;
    vi.spyOn(redis, 'eval').mockImplementation(async (...args) => {
      if (!paused && args[1] === 5 && JSON.parse(String(args[7])).cancelRequested) {
        paused = true;
        entered.resolve();
        await resume.promise;
      }
      return original(...args);
    });
    const cancellation = requestJobCancellationById(input.queueName, job.id);
    await entered.promise;
    await markJobCompleted(input.queueName, job.id, {
      resultSummary: { ids: [], precise: Number.MAX_SAFE_INTEGER },
    });
    resume.resolve();
    await cancellation;
    expect(await getJobSnapshot(input.queueName, job.id)).toMatchObject({
      status: 'completed',
      resultSummary: { ids: [], precise: Number.MAX_SAFE_INTEGER },
    });
  });

  it('preserves independent summary and progress updates when both read the same revision', async () => {
    const input = options('patch');
    const { job } = await startOwnedJob(input);
    const redis = getRedis();
    const original = redis.eval.bind(redis);
    const entered = deferred();
    const resume = deferred();
    let paused = false;
    vi.spyOn(redis, 'eval').mockImplementation(async (...args) => {
      if (!paused && args[1] === 5) {
        paused = true;
        entered.resolve();
        await resume.promise;
      }
      return original(...args);
    });
    const summary = updateJobSummary(input.queueName, job.id, { applied: [1] });
    await entered.promise;
    await updateJobProgress(input.queueName, job.id, { phase: 'applying', current: 1, total: 2 });
    resume.resolve();
    await summary;
    expect(await getJobSnapshot(input.queueName, job.id)).toMatchObject({
      resultSummary: { applied: [1] },
      progress: { current: 1, percentage: 50 },
    });
  });

  it('finalizes cancellation and releases the slot without waiting for unused retries', async () => {
    const input = options('finality');
    const { job } = await startOwnedJob({ ...input, queueOptions: { attempts: 3 } });
    await requestJobCancellationById(input.queueName, job.id);
    const worker = createQueueWorker(input.queueName, async (_data, context) => {
      await context.throwIfCancelled();
    });
    workers.push(worker);
    await worker.waitUntilReady();
    await vi.waitFor(
      async () => {
        expect((await getJobSnapshot(input.queueName, job.id))?.status).toBe('cancelled');
        expect(await getRedis().get(`bric:jobs:${input.queueName}:active`)).toBeNull();
      },
      { timeout: 15000 },
    );
    expect((await getQueue(input.queueName).getJob(job.id))?.attemptsMade).toBe(1);
  });
});
