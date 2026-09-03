import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  getOrderProductLookup: vi.fn(),
  readEcotrackCatalog: vi.fn(),
  toXlsxBuffer: vi.fn(),
  uploadPrivateExportArtifact: vi.fn(),
}));

vi.mock('@bric/db/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@bric/db/client')>()),
  getDb: mocks.getDb,
}));
vi.mock('@bric/storefront-core/order-records', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@bric/storefront-core/order-records')>()),
  getOrderProductLookup: mocks.getOrderProductLookup,
}));
vi.mock('./ecotrack', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./ecotrack')>()),
  readEcotrackCatalog: mocks.readEcotrackCatalog,
}));
vi.mock('./export-artifacts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./export-artifacts')>()),
  uploadPrivateExportArtifact: mocks.uploadPrivateExportArtifact,
}));
vi.mock('./meta-catalog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./meta-catalog')>()),
  toXlsxBuffer: mocks.toXlsxBuffer,
}));

import { filterCatalogFeedProducts, runOrderExportJob } from './background-jobs';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getDb.mockReturnValue({
    query: {
      orders: { findMany: vi.fn().mockResolvedValue([]) },
      orderStatusHistory: { findMany: vi.fn().mockResolvedValue([]) },
    },
  });
  mocks.getOrderProductLookup.mockResolvedValue(new Map());
  mocks.readEcotrackCatalog.mockResolvedValue({
    wilayas: [],
    communes: [],
    serviceFees: [],
    weightFees: [],
    lastSync: null,
  });
  mocks.toXlsxBuffer.mockReturnValue(Buffer.from('xlsx'));
  mocks.uploadPrivateExportArtifact.mockResolvedValue({
    key: 'exports/orders/private.xlsx',
    expiresAt: new Date('2026-01-02T00:00:00.000Z'),
  });
});

describe('filterCatalogFeedProducts', () => {
  it('keeps only active in-stock products for the storefront catalog feed', () => {
    const result = filterCatalogFeedProducts([
      { id: 1, active: true, inStock: true },
      { id: 2, active: true, inStock: false },
      { id: 3, active: false, inStock: true },
      { id: 4, active: true, inStock: true },
    ]);

    expect(result).toEqual([
      { id: 1, active: true, inStock: true },
      { id: 4, active: true, inStock: true },
    ]);
  });
});

describe('runOrderExportJob', () => {
  it('exports the file without changing in-house order statuses', async () => {
    const updateProgress = vi.fn().mockResolvedValue(undefined);
    const updateSummary = vi.fn().mockResolvedValue(undefined);
    const setDownloadUrl = vi.fn().mockResolvedValue(undefined);
    const throwIfCancelled = vi.fn().mockResolvedValue(undefined);

    await runOrderExportJob(
      {
        mode: 'confirmed',
        orderIds: [91],
        __jobMeta: {
          id: 'job-1',
          ownerKey: 'ops@example.com',
          queueName: 'admin-order-export',
          activeScope: 'owner',
        },
      },
      { updateProgress, updateSummary, setDownloadUrl, throwIfCancelled },
    );

    expect(updateProgress.mock.calls.map(([progress]) => progress.phase)).toEqual([
      'loading',
      'exporting',
    ]);
    expect(setDownloadUrl).toHaveBeenCalledWith('/api/orders/export/download?jobId=job-1');
    expect(updateSummary).toHaveBeenLastCalledWith(
      expect.objectContaining({
        artifactKey: 'exports/orders/private.xlsx',
        artifactExpiresAt: '2026-01-02T00:00:00.000Z',
      }),
    );
  });
});
