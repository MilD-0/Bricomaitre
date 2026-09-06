import { createHash, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

import { enqueueLightweightJob } from '@bric/runtime/jobs';
import { getRedis } from '@bric/runtime/redis';

import {
  analyticsQuerySchema,
  getAnalyticsData,
  type AnalyticsPayload,
  type AnalyticsQuery,
} from './analytics';
import { dayInTimezone } from './analytics/date-range';
import { getReportingDb } from './reporting-db';

export const ANALYTICS_SNAPSHOT_QUEUE = 'admin-analytics-snapshot';
const FRESH_MS = 5 * 60_000;
const RETENTION_SECONDS = 24 * 60 * 60;
const LOCK_SECONDS = 180;

type Snapshot = { computedAt: string; payload: AnalyticsPayload };
type Redis = Pick<
  ReturnType<typeof getRedis>,
  'get' | 'set' | 'eval' | 'zadd' | 'zremrangebyscore' | 'zremrangebyrank' | 'zrevrange'
>;

function namespace() {
  const database = createHash('sha256')
    .update(process.env.DATABASE_URL ?? 'local')
    .digest('hex')
    .slice(0, 16);
  return `bric:analytics:v1:${database}:${process.env.SENTRY_RELEASE ?? 'development'}`;
}

export function normalizeAnalyticsSnapshotQuery(query: AnalyticsQuery) {
  const parsed = analyticsQuerySchema.parse(query);
  return {
    view: parsed.view,
    range: parsed.range,
    grain: parsed.grain,
    ...(parsed.range === 'custom' ? { startDate: parsed.startDate, endDate: parsed.endDate } : {}),
    ...(parsed.range === 'all' && parsed.endDate ? { endDate: parsed.endDate } : {}),
  };
}

function readSnapshot(raw: string | null): Snapshot | null {
  if (!raw) return null;
  try {
    const snapshot = JSON.parse(raw) as Snapshot;
    return Number.isFinite(Date.parse(snapshot.computedAt)) && snapshot.payload?.diagnostics
      ? snapshot
      : null;
  } catch {
    return null;
  }
}

export function createAnalyticsSnapshotStore(dependencies: {
  redis: () => Redis;
  compute: typeof getAnalyticsData;
  enqueue: (query: AnalyticsQuery) => Promise<unknown>;
  now?: () => number;
}) {
  const now = dependencies.now ?? Date.now;
  const inFlight = new Map<string, Promise<AnalyticsPayload>>();
  let computeTail: Promise<void> = Promise.resolve();

  function computeInSequence(query: AnalyticsQuery) {
    const computation = computeTail.then(
      () => dependencies.compute(query),
      () => dependencies.compute(query),
    );
    computeTail = computation.then(
      () => undefined,
      () => undefined,
    );
    return computation;
  }

  function present(snapshot: Snapshot, state: 'fresh' | 'stale' | 'miss'): AnalyticsPayload {
    return {
      ...snapshot.payload,
      diagnostics: {
        ...snapshot.payload.diagnostics,
        cache: { state, computedAt: snapshot.computedAt },
      },
    };
  }

  async function load(
    query: AnalyticsQuery,
    options: { refresh?: boolean; remember?: boolean } = {},
  ): Promise<AnalyticsPayload> {
    const normalized = normalizeAnalyticsSnapshotQuery(query);
    const prefix = namespace();
    let redis: Redis;
    let key: string;
    let saved: Snapshot | null;
    try {
      redis = dependencies.redis();
      const generation = (await redis.get(`${prefix}:generation`)) ?? '0';
      const digest = createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
      key = `${prefix}:${generation}:${dayInTimezone(new Date(now()))}:${process.env.STATS_REVIEW_CLOCK ?? 'live'}:${digest}`;
      saved = readSnapshot(await redis.get(key));
      if (options.remember !== false) {
        await redis.zadd(`${prefix}:recent`, now(), JSON.stringify(normalized));
        await redis.zremrangebyscore(`${prefix}:recent`, '-inf', now() - RETENTION_SECONDS * 1000);
        await redis.zremrangebyrank(`${prefix}:recent`, 0, -33);
      }
    } catch {
      // Redis is an optimization. A cache outage must not make reporting unavailable.
      return computeInSequence(normalized);
    }

    if (saved && !options.refresh) {
      const stale = now() - Date.parse(saved.computedAt) >= FRESH_MS;
      if (stale) {
        // The persistent worker owns refreshes; serving an existing result never
        // waits for the queue connection to recover.
        void dependencies.enqueue(normalized).catch((error) => {
          console.error('[analytics] Could not schedule snapshot refresh', error);
        });
      }
      return present(saved, stale ? 'stale' : 'fresh');
    }

    const existing = inFlight.get(key);
    if (existing) return existing;
    const computation = computeOnce(redis, key, normalized, saved?.computedAt);
    inFlight.set(key, computation);
    try {
      return await computation;
    } finally {
      inFlight.delete(key);
    }
  }

  async function computeOnce(redis: Redis, key: string, query: AnalyticsQuery, previous?: string) {
    const token = randomUUID();
    const lock = `${key}:lock`;
    const waitingSince = now();
    while (true) {
      let acquired: unknown;
      let completed: Snapshot | null = null;
      try {
        acquired = await redis.set(lock, token, 'EX', LOCK_SECONDS, 'NX');
        if (!acquired) completed = readSnapshot(await redis.get(key));
      } catch {
        return computeInSequence(query);
      }
      if (acquired) break;
      if (completed && completed.computedAt !== previous) return present(completed, 'fresh');
      if (now() - waitingSince > 5 * 60_000)
        throw new Error('Analytics refresh is still running. Try again shortly.');
      await delay(250);
    }
    // Renew ownership for large all-time calculations; readers keep the last completed result.
    const renewal = setInterval(() => {
      void redis
        .eval(
          "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('expire', KEYS[1], ARGV[2]) end return 0",
          1,
          lock,
          token,
          LOCK_SECONDS,
        )
        .catch(() => {});
    }, 30_000);
    renewal.unref();
    try {
      // Another process may have completed between our read and lock acquisition.
      let completed: Snapshot | null;
      try {
        completed = readSnapshot(await redis.get(key));
      } catch {
        return computeInSequence(query);
      }
      if (completed && completed.computedAt !== previous) return present(completed, 'fresh');
      // A report fans out into several database queries. Keep distinct cold
      // reports sequential inside each process so simultaneous navigations or
      // prefetches cannot multiply that fan-out and exhaust the web heap.
      const payload = await computeInSequence(query);
      const snapshot = { computedAt: new Date(now()).toISOString(), payload };
      await redis
        .eval(
          "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('set', KEYS[2], ARGV[2], 'EX', ARGV[3]) end return nil",
          2,
          lock,
          key,
          token,
          JSON.stringify(snapshot),
          RETENTION_SECONDS,
        )
        .catch((error) => console.error('[analytics] Could not save snapshot', error));
      return present(snapshot, 'miss');
    } finally {
      clearInterval(renewal);
      await redis
        .eval(
          "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) end return 0",
          1,
          lock,
          token,
        )
        .catch(() => {});
    }
  }

  return { load };
}

export async function scheduleAnalyticsSnapshot(query: AnalyticsQuery) {
  const normalized = normalizeAnalyticsSnapshotQuery(query);
  return enqueueLightweightJob({
    queueName: ANALYTICS_SNAPSHOT_QUEUE,
    jobName: 'refresh',
    dedupeKey: `${namespace()}:${JSON.stringify(normalized)}`,
    data: normalized,
    attempts: 2,
  });
}

const snapshots = createAnalyticsSnapshotStore({
  redis: getRedis,
  compute: (query) => getAnalyticsData(query, { db: getReportingDb() }),
  enqueue: scheduleAnalyticsSnapshot,
});
export const getAnalyticsSnapshot = snapshots.load;

export async function invalidateAnalyticsSnapshots() {
  await getRedis().set(`${namespace()}:generation`, randomUUID());
}

export async function warmAnalyticsSnapshots() {
  const views = [
    'command',
    'money',
    'acquisition',
    'fulfillment',
    'storefront',
    'search',
    'catalog',
    'assumptions',
  ] as const;
  const queries: AnalyticsQuery[] = views.map((view) => ({ view, range: '30d', grain: 'auto' }));
  for (const range of ['7d', '14d', '90d', 'year', 'all'] as const)
    queries.push({ view: 'command', range, grain: 'auto' });
  const recent = await getRedis().zrevrange(`${namespace()}:recent`, 0, 11);
  for (const raw of recent) {
    try {
      const parsed = analyticsQuerySchema.safeParse(JSON.parse(raw));
      if (parsed.success) queries.push(parsed.data);
    } catch {
      // Ignore malformed optional history; default views must still warm.
    }
  }
  for (const query of queries) await scheduleAnalyticsSnapshot(query);
}
