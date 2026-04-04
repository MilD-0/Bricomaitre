import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from '../route';

const {
  requireMutationAccessMock,
  hasDbMock,
  getDbMock,
  createSquareCatalogImageMock,
  buildMetaCatalogImageKeySeedMock,
  buildMetaCatalogExportRowsMock,
  buildMetaCatalogWorkbookMock,
  toXlsxBufferMock,
  buildMetaCatalogExportFileNameMock,
} = vi.hoisted(() => ({
  requireMutationAccessMock: vi.fn(),
  hasDbMock: vi.fn(),
  getDbMock: vi.fn(),
  createSquareCatalogImageMock: vi.fn(),
  buildMetaCatalogImageKeySeedMock: vi.fn(),
  buildMetaCatalogExportRowsMock: vi.fn(),
  buildMetaCatalogWorkbookMock: vi.fn(),
  toXlsxBufferMock: vi.fn(),
  buildMetaCatalogExportFileNameMock: vi.fn(),
}));

vi.mock('../../../../../lib/rbac', () => ({
  requireMutationAccess: requireMutationAccessMock,
}));

vi.mock('../../../../../db/client', () => ({
  hasDb: hasDbMock,
  getDb: getDbMock,
}));

vi.mock('../../../../../lib/meta-catalog', () => ({
  createSquareCatalogImage: createSquareCatalogImageMock,
  buildMetaCatalogImageKeySeed: buildMetaCatalogImageKeySeedMock,
  buildMetaCatalogExportRows: buildMetaCatalogExportRowsMock,
  buildMetaCatalogWorkbook: buildMetaCatalogWorkbookMock,
  toXlsxBuffer: toXlsxBufferMock,
  buildMetaCatalogExportFileName: buildMetaCatalogExportFileNameMock,
}));

describe('app/api/products/meta-export/route', () => {
  beforeEach(() => {
    requireMutationAccessMock.mockReset();
    hasDbMock.mockReset();
    getDbMock.mockReset();
    createSquareCatalogImageMock.mockReset();
    buildMetaCatalogImageKeySeedMock.mockReset();
    buildMetaCatalogExportRowsMock.mockReset();
    buildMetaCatalogWorkbookMock.mockReset();
    toXlsxBufferMock.mockReset();
    buildMetaCatalogExportFileNameMock.mockReset();

    requireMutationAccessMock.mockResolvedValue(null);
    hasDbMock.mockReturnValue(true);
    createSquareCatalogImageMock.mockResolvedValue('https://cdn.example.com/products/meta-catalog/square.jpg');
    buildMetaCatalogImageKeySeedMock.mockReturnValue('seed-1');
    buildMetaCatalogExportRowsMock.mockReturnValue([{ id: '1' }]);
    buildMetaCatalogWorkbookMock.mockReturnValue({ workbook: true });
    toXlsxBufferMock.mockReturnValue(Buffer.from('sheet'));
    buildMetaCatalogExportFileNameMock.mockReturnValue('meta-catalog-export-20260331-120000.xlsx');
  });

  it('returns 403 when RBAC denies access', async () => {
    requireMutationAccessMock.mockResolvedValue(NextResponse.json({ error: 'Forbidden' }, { status: 403 }));

    const response = await GET(new NextRequest('http://localhost/api/products/meta-export?ids=1'));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'Forbidden' });
  });

  it('returns 400 when ids are missing', async () => {
    const response = await GET(new NextRequest('http://localhost/api/products/meta-export'));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'At least one product id is required.' });
  });

  it('returns 503 when the database is unavailable', async () => {
    hasDbMock.mockReturnValue(false);

    const response = await GET(new NextRequest('http://localhost/api/products/meta-export?ids=1'));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: 'DATABASE_URL is not configured' });
  });

  it('returns 404 when no matching products are found', async () => {
    getDbMock.mockReturnValue({
      select: vi.fn((shape?: { id?: unknown; name?: unknown }) => {
        if (shape?.id && shape?.name) {
          return { from: vi.fn().mockResolvedValue([]) };
        }

        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        };
      }),
    });

    const response = await GET(new NextRequest('http://localhost/api/products/meta-export?ids=1'));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'No matching products found.' });
  });

  it('builds a meta catalog export with squared cloudfront images', async () => {
    const productsFromDb = [
      {
        id: 1,
        title: 'Roller',
        description: 'Paint roller',
        price: 12,
        inventoryQuantity: 4,
        brandId: 9,
        images: ['https://raw.example.com/roller.jpg'],
        updatedAt: new Date('2026-03-31T00:00:00.000Z'),
      },
    ];
    const brandRows = [{ id: 9, name: 'Acme' }];
    const selectMock = vi.fn((shape?: { id?: unknown; name?: unknown }) => {
      if (shape?.id && shape?.name) {
        return { from: vi.fn().mockResolvedValue(brandRows) };
      }

      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(productsFromDb),
        }),
      };
    });
    getDbMock.mockReturnValue({ select: selectMock });

    const response = await GET(new NextRequest('http://localhost/api/products/meta-export?ids=1'));

    expect(response.status).toBe(200);
    expect(buildMetaCatalogImageKeySeedMock).toHaveBeenCalledWith(productsFromDb[0]);
    expect(createSquareCatalogImageMock).toHaveBeenCalledWith('https://raw.example.com/roller.jpg', 'seed-1');
    expect(buildMetaCatalogExportRowsMock).toHaveBeenCalledWith(
      productsFromDb,
      new Map([[9, 'Acme']]),
      new Map([[1, 'https://cdn.example.com/products/meta-catalog/square.jpg']]),
    );
    expect(buildMetaCatalogWorkbookMock).toHaveBeenCalledWith([{ id: '1' }]);
    expect(toXlsxBufferMock).toHaveBeenCalledWith({ workbook: true });
    expect(response.headers.get('content-disposition')).toBe('attachment; filename="meta-catalog-export-20260331-120000.xlsx"');
  });
});
