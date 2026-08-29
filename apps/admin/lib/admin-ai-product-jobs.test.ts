import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  propose: vi.fn(),
  review: vi.fn(),
  refresh: vi.fn(),
  startContent: vi.fn(),
  startCategorization: vi.fn(),
  latestJob: vi.fn(),
}));

vi.mock('./ai-product-content', () => ({
  proposeProductContent: mocks.propose,
  reviewProductContentProposal: mocks.review,
}));
vi.mock('./background-jobs', () => ({
  ADMIN_AI_CONTENT_QUEUE: 'admin-ai-content',
  ADMIN_AI_CATEGORIZATION_QUEUE: 'admin-ai-categorization',
  startAiContentJob: mocks.startContent,
  startAiCategorizationJob: mocks.startCategorization,
  getLatestExportJob: mocks.latestJob,
  refreshAppliedAiProposalConsumers: mocks.refresh,
}));

import {
  generateAdminAiProductContent,
  getAdminAiCatalogCategorizationStatus,
  getAdminAiProductContentJobStatus,
  startAdminAiCatalogCategorization,
} from './admin-ai-product-jobs';

const actor = { email: 'admin@example.com', name: 'Admin' };
const context = { ownerKey: 'admin@example.com', actor, conversationId: 42, autoApply: false };

describe('admin AI product jobs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.refresh.mockResolvedValue(undefined);
  });

  it('creates reviewable inline proposals for a small exact scope', async () => {
    mocks.propose.mockResolvedValue({ id: 101, status: 'proposed' });

    await expect(
      generateAdminAiProductContent(
        { scope: 'explicit', productIds: [12, 12], fields: ['titleAr'] },
        context,
      ),
    ).resolves.toMatchObject({
      kind: 'product_content_proposals',
      ok: true,
      complete: true,
      autoApply: false,
      requestedCount: 1,
      proposalCount: 1,
      appliedCount: 0,
      pendingReviewCount: 1,
    });
    expect(mocks.propose).toHaveBeenCalledWith({
      productId: 12,
      fields: ['titleAr'],
      adminContext: undefined,
      actorId: 'admin@example.com',
    });
    expect(mocks.review).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it('uses verified review when automatic application is enabled and preserves conflicts', async () => {
    mocks.propose
      .mockResolvedValueOnce({ id: 101, status: 'proposed' })
      .mockResolvedValueOnce({ id: 102, status: 'proposed' });
    mocks.review
      .mockResolvedValueOnce({ id: 101, status: 'applied', verified: true })
      .mockRejectedValueOnce(new Error('Product changed after generation.'));

    await expect(
      generateAdminAiProductContent(
        { scope: 'explicit', productIds: [12, 18], fields: ['descriptionAr'] },
        { ...context, autoApply: true },
      ),
    ).resolves.toMatchObject({
      ok: true,
      complete: false,
      autoApply: true,
      proposalCount: 2,
      appliedCount: 1,
      pendingReviewCount: 1,
      items: [
        { productId: 12, application: 'applied' },
        {
          productId: 18,
          application: 'pending_review',
          autoApplyError: 'Product changed after generation.',
        },
      ],
    });
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(mocks.refresh).toHaveBeenCalledWith('ai-product-content:inline-auto-apply');
  });

  it('moves wider exact content work to the durable queue', async () => {
    mocks.startContent.mockResolvedValue({
      kind: 'started',
      job: { id: 'content-job', status: 'queued' },
    });

    await expect(
      generateAdminAiProductContent(
        { scope: 'explicit', productIds: [12, 18, 24, 31], fields: ['titleAr'] },
        context,
      ),
    ).resolves.toMatchObject({
      kind: 'product_content_job_started',
      ok: true,
      resolvedProductCount: 4,
    });
    expect(mocks.startContent).toHaveBeenCalledWith('admin@example.com', {
      productIds: [12, 18, 24, 31],
      fields: ['titleAr'],
      onlyMissing: false,
      autoApply: false,
      conversationId: 42,
      context: undefined,
      actor,
    });
    expect(mocks.propose).not.toHaveBeenCalled();
  });

  it('starts large content and categorization jobs with durable context and truthful busy receipts', async () => {
    mocks.startContent.mockResolvedValue({
      kind: 'started',
      job: { id: 'content-job', status: 'queued' },
    });
    mocks.startCategorization.mockResolvedValue({
      kind: 'busy',
      job: { id: 'categorization-job', status: 'running' },
    });

    await expect(
      generateAdminAiProductContent(
        { scope: 'all_missing', productIds: [], fields: ['titleAr'] },
        { ...context, autoApply: true },
      ),
    ).resolves.toMatchObject({
      kind: 'product_content_job_started',
      ok: true,
      autoApply: true,
      job: { status: 'queued' },
    });
    expect(mocks.startContent).toHaveBeenCalledWith('admin@example.com', {
      productIds: null,
      fields: ['titleAr'],
      onlyMissing: true,
      autoApply: true,
      conversationId: 42,
      context: undefined,
      actor,
    });

    await expect(
      startAdminAiCatalogCategorization({}, { ...context, autoApply: true }),
    ).resolves.toMatchObject({
      kind: 'catalog_categorization_job_busy',
      ok: false,
      startDisposition: 'busy',
      autoApply: true,
    });
  });

  it('reads the latest owner-scoped status for each specific job type', async () => {
    mocks.latestJob.mockResolvedValue({ id: 'job-1', status: 'completed' });

    await expect(getAdminAiProductContentJobStatus('admin@example.com')).resolves.toMatchObject({
      kind: 'product_content_job_status',
      job: { status: 'completed' },
    });
    await expect(getAdminAiCatalogCategorizationStatus('admin@example.com')).resolves.toMatchObject(
      { kind: 'catalog_categorization_job_status' },
    );
    expect(mocks.latestJob).toHaveBeenNthCalledWith(1, 'admin-ai-content', 'admin@example.com');
    expect(mocks.latestJob).toHaveBeenNthCalledWith(
      2,
      'admin-ai-categorization',
      'admin@example.com',
    );
  });
});
