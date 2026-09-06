import { describe, expect, it } from 'vitest';

import { getRedisConnectionOptions } from './redis';

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
});
