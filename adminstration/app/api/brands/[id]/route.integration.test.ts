import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from './route';

const { hasDbMock, getDbMock } = vi.hoisted(() => ({
  hasDbMock: vi.fn(),
  getDbMock: vi.fn(),
}));

vi.mock('../../../../db/client', () => ({
  hasDb: hasDbMock,
  getDb: getDbMock,
}));

describe('app/api/brands/[id]/route', () => {
  beforeEach(() => {
    hasDbMock.mockReset();
    getDbMock.mockReset();
  });

  it('returns a single brand by id', async () => {
    hasDbMock.mockReturnValue(true);
    getDbMock.mockReturnValue({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ id: 7, name: 'Acme', slug: 'acme' }]),
          }),
        }),
      }),
    });

    const response = await GET(new Request('http://localhost/api/brands/7'), { params: Promise.resolve({ id: '7' }) });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ id: 7, name: 'Acme', slug: 'acme' });
  });
});
