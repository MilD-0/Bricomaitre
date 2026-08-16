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
});
