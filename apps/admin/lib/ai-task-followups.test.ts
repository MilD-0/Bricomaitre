import { describe, expect, it } from 'vitest';

import { formatAiTaskTerminalMessage } from './ai-task-followups';

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

  it('lists every invalid, rejected, and already-posted ECOTRACK order with its reason', () => {
    const message = formatAiTaskTerminalMessage({
      jobId: 'ecotrack-1',
      kind: 'order-ecotrack:confirmed',
      status: 'completed',
      summary: {
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
    expect(message).toContain(
      'Order #12 · invalid: Commune is not active or could not be resolved.',
    );
    expect(message).toContain('Order #13 · failed: telephone is invalid');
    expect(message).toContain('Order #14 · already posted: already_posted');
    expect(message).not.toContain('Order #11');
  });
});
