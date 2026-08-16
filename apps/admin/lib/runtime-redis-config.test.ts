import { describe, expect, it } from 'vitest';

import { getRedisConnectionOptions, getRequestRedisConnectionOptions } from '@bric/runtime/redis';

describe('shared Redis connection options', () => {
  it('keeps RESP2 semantics while adopting ioredis 6', () => {
    expect(
      getRedisConnectionOptions({
        REDIS_URL: 'rediss://worker:secret@redis.example.com:6380/3',
      }),
    ).toMatchObject({
      host: 'redis.example.com',
      port: 6380,
      username: 'worker',
      password: 'secret',
      db: 3,
      protocol: 2,
      tls: {},
      lazyConnect: true,
      maxRetriesPerRequest: null,
    });
  });

  it('uses RESP2 for discrete host configuration too', () => {
    expect(
      getRedisConnectionOptions({
        REDIS_HOST: 'redis',
        REDIS_PORT: '6379',
      }),
    ).toMatchObject({
      host: 'redis',
      port: 6379,
      protocol: 2,
      tls: undefined,
    });
  });

  it('bounds request-path Redis commands without changing BullMQ requirements', () => {
    expect(getRequestRedisConnectionOptions({ REDIS_HOST: 'redis' })).toMatchObject({
      commandTimeout: 5_000,
      connectTimeout: 5_000,
      maxRetriesPerRequest: 1,
      protocol: 2,
    });
    expect(getRedisConnectionOptions({ REDIS_HOST: 'redis' })).toMatchObject({
      maxRetriesPerRequest: null,
    });
  });
});
