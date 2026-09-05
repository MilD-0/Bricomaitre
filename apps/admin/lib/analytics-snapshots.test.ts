import { describe, expect, it, vi } from 'vitest';

import type { AnalyticsPayload } from './analytics';
import {
  createAnalyticsSnapshotStore,
  normalizeAnalyticsSnapshotQuery,
} from './analytics-snapshots';

vi.mock('@bric/runtime/jobs', () => ({ enqueueLightweightJob: vi.fn() }));
vi.mock('@bric/runtime/redis', () => ({ getRedis: vi.fn() }));

const query = { view: 'command', range: '30d', grain: 'auto' } as const;
const payload = {
  diagnostics: { queryDurationMs: 1200 },
  warnings: [],
} as unknown as AnalyticsPayload;

function setup() {
  const values = new Map<string, string>();
  let time = Date.parse('2026-09-05T12:00:00Z');
  const redis = {
    get: vi.fn(async (key: string) => values.get(key) ?? null),
    set: vi.fn(async (key: string, value: string, ...args: unknown[]) => {
      if (args.includes('NX') && values.has(key)) return null;
      values.set(key, value);
      return 'OK';
    }),
    eval: vi.fn(async (script: string, count: number, ...args: (string | number)[]) => {
      const keys = args.slice(0, count).map(String);
      const [token, value] = args.slice(count).map(String);
      if (values.get(keys[0]) !== token) return null;
      if (script.includes("'set'")) values.set(keys[1], value);
      if (script.includes("'del'")) values.delete(keys[0]);
      return 1;
    }),
    zadd: vi.fn(async () => 1),
    zremrangebyscore: vi.fn(async () => 0),
    zremrangebyrank: vi.fn(async () => 0),
    zrevrange: vi.fn(async () => []),
  };
  const compute = vi.fn(async () => structuredClone(payload));
  const enqueue = vi.fn(async () => undefined);
  const dependencies = {
    redis: () =>
      redis as unknown as ReturnType<Parameters<typeof createAnalyticsSnapshotStore>[0]['redis']>,
    compute,
    enqueue,
    now: () => time,
  };
  return {
    ...createAnalyticsSnapshotStore(dependencies),
    dependencies,
    redis,
    compute,
    enqueue,
    values,
    advance: (ms: number) => {
      time += ms;
    },
  };
}

describe('analytics snapshots', () => {
  it('reuses a completed result and reports when it was calculated', async () => {
    const store = setup();
    expect((await store.load(query)).diagnostics.cache?.state).toBe('miss');
    const cached = await store.load(query);
    expect(cached.diagnostics.cache).toEqual({
      state: 'fresh',
      computedAt: '2026-09-05T12:00:00.000Z',
    });
    expect(store.compute).toHaveBeenCalledTimes(1);
  });

  it('serves stale results without waiting for queue availability', async () => {
    const store = setup();
    await store.load(query);
    store.advance(5 * 60_000);
    store.enqueue.mockImplementation(() => new Promise(() => {}));
    expect((await store.load(query)).diagnostics.cache?.state).toBe('stale');
    expect(store.enqueue).toHaveBeenCalledWith(query);
    expect(store.compute).toHaveBeenCalledTimes(1);
  });

  it('explicit refresh calculates new data and replaces the cached result', async () => {
    const store = setup();
    await store.load(query);
    store.advance(1000);
    await store.load(query, { refresh: true });
    expect(store.compute).toHaveBeenCalledTimes(2);
    expect((await store.load(query)).diagnostics.cache?.computedAt).toBe(
      '2026-09-05T12:00:01.000Z',
    );
  });

  it('coalesces concurrent cold reads within and across processes', async () => {
    const store = setup();
    const another = createAnalyticsSnapshotStore(store.dependencies);
    store.compute.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return structuredClone(payload);
    });
    const results = await Promise.all([store.load(query), store.load(query), another.load(query)]);
    expect(results).toHaveLength(3);
    expect(store.compute).toHaveBeenCalledTimes(1);
  });

  it('releases the lock after computation fails so retry can succeed', async () => {
    const store = setup();
    store.compute.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(store.load(query)).rejects.toThrow('database unavailable');
    await expect(store.load(query)).resolves.toHaveProperty('diagnostics.cache.state', 'miss');
    expect([...store.values.keys()].some((key) => key.endsWith(':lock'))).toBe(false);
  });

  it('still calculates when Redis cannot be read', async () => {
    const store = setup();
    store.redis.get.mockRejectedValue(new Error('Redis unavailable'));
    await expect(store.load(query)).resolves.toEqual(payload);
  });

  it('does not reuse a snapshot across an invalidation or Algiers midnight', async () => {
    const store = setup();
    await store.load(query);
    const generationKey = store.redis.get.mock.calls[0][0];
    store.values.set(generationKey, 'next-generation');
    await store.load(query);
    store.advance(12 * 60 * 60_000);
    await store.load(query);
    expect(store.compute).toHaveBeenCalledTimes(3);
  });

  it('drops irrelevant preset dates while preserving custom boundaries', () => {
    expect(normalizeAnalyticsSnapshotQuery({ ...query, startDate: '2026-01-01' })).toEqual(query);
    const custom = {
      ...query,
      range: 'custom' as const,
      startDate: '2026-08-01',
      endDate: '2026-08-31',
    };
    expect(normalizeAnalyticsSnapshotQuery(custom)).toEqual(custom);
  });
});
