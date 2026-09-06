import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  closeRedisConnections,
  getBullRedisConnection,
  getRedis,
  getRedisConnectionOptions,
} from './redis';

afterEach(async () => {
  await closeRedisConnections();
  vi.unstubAllEnvs();
});

describe('Redis connection options', () => {
  it('uses a separately rotated password when a legacy URL has no credentials', () => {
    expect(
      getRedisConnectionOptions({
        REDIS_URL: 'redis://redis:6379/0',
        REDIS_PASSWORD: 'rotated-password',
      }),
    ).toMatchObject({
      host: 'redis',
      port: 6379,
      password: 'rotated-password',
      db: 0,
    });
  });

  it('decodes reserved characters in URL credentials before passing discrete options', () => {
    expect(
      getRedisConnectionOptions({
        REDIS_URL: 'rediss://worker%2Bops:p%40ss%3A%2F%25@redis:6380/2',
      }),
    ).toMatchObject({
      username: 'worker+ops',
      password: 'p@ss:/%',
      host: 'redis',
      port: 6380,
      db: 2,
      tls: {},
      protocol: 2,
      lazyConnect: true,
      maxRetriesPerRequest: null,
    });
  });

  it('lets an explicit password replace credentials embedded in the URL', () => {
    expect(
      getRedisConnectionOptions({
        REDIS_URL: 'redis://default:old-password@redis:6379/1',
        REDIS_PASSWORD: 'new-password',
      }),
    ).toMatchObject({
      username: 'default',
      password: 'new-password',
      db: 1,
    });
  });

  it('supports discrete host configuration with the same protocol and lazy connection policy', () => {
    expect(getRedisConnectionOptions({ REDIS_HOST: 'redis', REDIS_PORT: '6380' })).toMatchObject({
      host: 'redis',
      port: 6380,
      protocol: 2,
      tls: undefined,
      lazyConnect: true,
    });
  });

  it('bounds the actual request client while keeping BullMQ retries unlimited', () => {
    vi.stubEnv('REDIS_URL', 'redis://127.0.0.1:6379');
    const request = getRedis();
    const worker = getBullRedisConnection('configuration-test');
    expect(request.options).toMatchObject({
      commandTimeout: 5_000,
      connectTimeout: 5_000,
      maxRetriesPerRequest: 1,
      protocol: 2,
    });
    expect(worker.options).toMatchObject({ maxRetriesPerRequest: null, protocol: 2 });
    expect(worker.options.commandTimeout).toBeUndefined();
    expect(getRedis()).toBe(request);
    expect(getBullRedisConnection('configuration-test')).toBe(worker);
  });
});
