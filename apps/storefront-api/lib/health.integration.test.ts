import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getPoolMock, hasDbMock, getRedisMock } = vi.hoisted(() => ({
  getPoolMock: vi.fn(),
  hasDbMock: vi.fn(),
  getRedisMock: vi.fn(),
}));

vi.mock('@bric/db/client', () => ({
  getPool: getPoolMock,
  hasDb: hasDbMock,
}));

vi.mock('@bric/runtime/redis', () => ({
  getRedis: getRedisMock,
}));

import { getStorefrontApiHealth } from './health';

describe('apps/storefront-api/lib/health', () => {
  beforeEach(() => {
    process.env.DATABASE_URL = 'postgres://example';
    process.env.REDIS_URL = 'redis://default:password@example.com:6379/0';
    process.env.ECOTRACK_BASE_URL = 'https://ecotrack.example.com/api';
    process.env.ECOTRACK_TOKEN = 'token';
    process.env.STOREFRONT_REVALIDATE_SECRET = 'secret';

    getPoolMock.mockReset();
    hasDbMock.mockReset();
    getRedisMock.mockReset();

    hasDbMock.mockReturnValue(true);
    getPoolMock.mockReturnValue({
      query: vi.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] }),
    });
    getRedisMock.mockReturnValue({ ping: vi.fn().mockResolvedValue('PONG') });
  });

  it('returns ok when env, database, and redis are healthy', async () => {
    const health = await getStorefrontApiHealth();

    expect(health.ok).toBe(true);
    expect(health.missingEnv).toEqual([]);
    expect(health.checks.database.ok).toBe(true);
    expect(health.checks.redis.ok).toBe(true);
  });

  it('returns degraded when redis ping fails', async () => {
    getRedisMock.mockReturnValue({ ping: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) });

    const health = await getStorefrontApiHealth();

    expect(health.ok).toBe(false);
    expect(health.checks.redis.ok).toBe(false);
    expect(health.checks.redis.error).toContain('ECONNREFUSED');
  });
});
