import { describe, expect, it } from 'vitest';

import { buildEcotrackTerminalOutput, formatAiTaskTerminalMessage } from './ai-task-followups';

describe('AI task terminal follow-ups', () => {
  it('reports reconciled completion and unapplied proposals truthfully', () => {
    const message = formatAiTaskTerminalMessage({
      jobId: 'job-1',
      kind: 'ai-product-content',
      status: 'completed',
      progress: { current: 40, total: 40, phase: 'generating-proposals' },
      summary: {
        processed: 40,
        total: 40,
        applied: 12,
        proposed: 20,
        skipped: 8,
        failed: 0,
        accounted: 40,
        complete: true,
      },
    });

    expect(message).toContain('Background task completed on the server.');
    expect(message).toContain('Progress: 40/40');
    expect(message).toContain('complete: true');
    expect(message).toContain('20 proposals are awaiting review');
  });

  it('surfaces cancellation progress and server errors', () => {
    expect(
      formatAiTaskTerminalMessage({
        jobId: 'job-2',
        kind: 'ai-product-categorization',
        status: 'cancelled',
        progress: { current: 8, total: 1618, phase: 'classifying-products' },
        errorMessage: 'Job cancelled.',
      }),
    ).toContain('Progress: 8/1618');

    expect(
      formatAiTaskTerminalMessage({
        jobId: 'job-3',
        kind: 'ai-product-content',
        status: 'failed',
        errorMessage: 'Provider unavailable',
      }),
    ).toContain('Error: Provider unavailable');
  });

  it('keeps a completed job artifact downloadable from the terminal conversation message', () => {
    const message = formatAiTaskTerminalMessage({
      jobId: 'job-export',
      kind: 'product-export',
      status: 'completed',
      summary: { fileName: 'meta-catalog.xlsx', totalProducts: 1_402 },
      downloadPath: 'https://files.example.test/meta-catalog.xlsx',
    });

    expect(message).toContain(
      'Download: [Open the completed file](https://files.example.test/meta-catalog.xlsx)',
    );
  });

  it('does not render non-web artifact schemes into assistant Markdown', () => {
    expect(
      formatAiTaskTerminalMessage({
        jobId: 'job-export',
        kind: 'product-export',
        status: 'completed',
        downloadPath: 'javascript:alert(1)',
      }),
    ).not.toContain('Download:');
  });

  it('makes automatic application conflicts visible while keeping proposals pending', () => {
    const message = formatAiTaskTerminalMessage({
      jobId: 'job-4',
      kind: 'ai-product-categorization',
      status: 'completed',
      summary: {
        applied: 8,
        proposed: 2,
        autoApplyFailed: 2,
        complete: true,
      },
    });

    expect(message).toContain('autoApplyFailed: 2');
    expect(message).toContain('encountered a live-record conflict or verification failure');
    expect(message).toContain('proposals remain pending for review');
  });

  it('reports the persisted landing-page revision and partial generation plainly', () => {
    const message = formatAiTaskTerminalMessage({
      jobId: 'landing-job',
      kind: 'ai-landing-page:revise',
      status: 'completed',
      summary: {
        operation: 'revise',
        complete: false,
        partial: true,
        landingPageId: 41,
        currentRevision: 4,
        active: true,
      },
    });

    expect(message).toContain('Landing page: #41 · revision 4 · live');
    expect(message).toContain('saved with partial generation');
    expect(message).not.toContain('server did not confirm complete');
  });

  it('separates every ECOTRACK outcome and makes worker retries explicit', () => {
    const message = formatAiTaskTerminalMessage({
      jobId: 'ecotrack-1',
      kind: 'order-ecotrack:confirmed',
      status: 'completed',
      attemptsMade: 2,
      summary: {
        provider: 'emir',
        totalRequested: 4,
        eligible: 2,
        created: 1,
        invalid: 1,
        failed: 1,
        skippedAlreadyPosted: 1,
        results: [
          {
            orderId: 12,
            reference: '12',
            status: 'invalid',
            message: 'Commune is not active or could not be resolved.',
          },
          {
            orderId: 13,
            reference: '13',
            status: 'failed',
            failureKind: 'provider_rejected',
            message: 'telephone is invalid',
          },
          {
            orderId: 14,
            reference: '14',
            status: 'skipped',
            message: 'already_posted',
          },
          {
            orderId: 11,
            reference: '11',
            status: 'created',
            message: 'Created successfully.',
          },
        ],
      },
    });

    expect(message).toContain(
      'totalRequested: 4 · eligible: 2 · created: 1 · skippedAlreadyPosted: 1 · invalid: 1 · failed: 1',
    );
    expect(message).toContain('Worker attempt: 2 · retries: 1');
    expect(message).toContain('Posted successfully:');
    expect(message).toContain('Order #11 · Created successfully.');
    expect(message).toContain('Validation failures (not sent to the provider):');
    expect(message).toContain('Order #12 · Commune is not active or could not be resolved.');
    expect(message).toContain('Provider rejections:');
    expect(message).toContain('Order #13 · telephone is invalid');
    expect(message).toContain('Already posted:');
    expect(message).toContain('Order #14 · already_posted');

    expect(
      buildEcotrackTerminalOutput({
        jobId: 'ecotrack-1',
        status: 'completed',
        attemptsMade: 2,
        summary: {
          provider: 'emir',
          totalRequested: 4,
          eligible: 2,
          created: 1,
          invalid: 1,
          failed: 1,
          skippedAlreadyPosted: 1,
          results: [
            { orderId: 11, status: 'created', tracking: 'EM-11', message: 'Created.' },
            { orderId: 12, status: 'invalid', message: 'Missing commune.' },
            {
              orderId: 13,
              status: 'failed',
              failureKind: 'provider_rejected',
              message: 'Phone rejected.',
            },
            { orderId: 14, status: 'skipped', message: 'already_posted' },
          ],
        },
      }),
    ).toMatchObject({
      provider: 'emir',
      attemptNumber: 2,
      retryCount: 1,
      counts: {
        requested: 4,
        succeeded: 1,
        validationFailed: 1,
        providerRejected: 1,
        alreadyPosted: 1,
      },
      successes: [{ orderId: 11, tracking: 'EM-11' }],
      validationFailures: [{ orderId: 12, message: 'Missing commune.' }],
      providerRejections: [{ orderId: 13, message: 'Phone rejected.' }],
      alreadyPosted: [{ orderId: 14, message: 'already_posted' }],
      repairableOrderIds: [12, 13],
      retryableOrderIds: [13],
    });
  });
});

it('keeps uncertain, locally unapplied and legacy failed outcomes out of retry drafts', () => {
  const summary = {
    failed: 4,
    results: [
      {
        orderId: 1,
        status: 'failed',
        failureKind: 'recovery_required',
        tracking: 'ACCEPTED-1',
        message: 'Local apply failed.',
      },
      {
        orderId: 2,
        status: 'failed',
        failureKind: 'recovery_required',
        message: 'Response unknown.',
      },
      { orderId: 3, status: 'failed', message: 'Legacy failure without outcome evidence.' },
      {
        orderId: 4,
        status: 'failed',
        failureKind: 'not_sent',
        message: 'Order changed before claim.',
      },
    ],
  };
  const input = { jobId: 'posting', status: 'completed' as const, summary };
  expect(buildEcotrackTerminalOutput(input)).toMatchObject({
    outcomeClassificationVersion: 1,
    counts: { providerRejected: 0, recoveryRequired: 3, notSent: 1 },
    recoveryRequired: [{ orderId: 1, tracking: 'ACCEPTED-1' }, { orderId: 2 }, { orderId: 3 }],
    notSent: [{ orderId: 4 }],
    repairableOrderIds: [4],
    retryableOrderIds: [],
  });
  const message = formatAiTaskTerminalMessage({ ...input, kind: 'order-ecotrack:selected' });
  expect(message).toContain('Carrier recovery required (do not repost):');
  expect(message).not.toContain('Provider rejections:');
});
