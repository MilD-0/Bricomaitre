import { describe, expect, it } from 'vitest';
import {
  createEcotrackSyncDiagnostics,
  describeEcotrackSyncFailure,
} from './ecotrack-sync-diagnostics';

const context = {
  stage: 'status' as const,
  provider: 'emir',
  batch: 2,
  candidateCount: 100,
  orderIds: [12],
};
describe('ECOTRACK sync diagnostics', () => {
  it('keeps HTTP status and endpoint without response bodies or credential-bearing URLs', () => {
    const error = new Error(
      'ECOTRACK request failed for /get/orders/status?api_token=secret: 503 customer phone 0550123456',
    );
    error.stack =
      'Error: secret customer phone 0550123456\n    at request (/app/run-background-workers.cjs:42:7)';
    const failure = describeEcotrackSyncFailure(error, context);
    expect(failure).toMatchObject({
      ...context,
      endpoint: '/get/orders/status',
      status: 503,
      kind: 'http',
    });
    expect(JSON.stringify(failure)).not.toMatch(/secret|0550123456/);
    expect(failure.sourceFrames).toEqual(['run-background-workers.cjs:42:7']);
  });
  it('extracts SQLSTATE from wrapped database errors without SQL parameters', () => {
    const error = new Error('Failed query with private parameters', {
      cause: Object.assign(new Error('duplicate key'), { code: '21000' }),
    });
    expect(describeEcotrackSyncFailure(error, { ...context, stage: 'persist' })).toMatchObject({
      kind: 'database',
      code: '21000',
      endpoint: null,
    });
  });
  it('distinguishes timeout, validation and rate-limit failures', () => {
    expect(
      describeEcotrackSyncFailure(new DOMException('timed out', 'TimeoutError'), context).kind,
    ).toBe('timeout');
    expect(
      describeEcotrackSyncFailure(Object.assign(new Error(), { name: 'ZodError' }), context).kind,
    ).toBe('invalid_response');
    expect(
      describeEcotrackSyncFailure(
        Object.assign(new Error(), { status: 429, rateLimit: { retryAfterSeconds: 30 } }),
        context,
      ),
    ).toMatchObject({ kind: 'rate_limit', retryAfterSeconds: 30 });
  });
  it('bounds failure samples and order IDs while retaining the total failure count', () => {
    const diagnostics = createEcotrackSyncDiagnostics();
    for (let i = 0; i < 30; i++)
      diagnostics.record(new Error('secret'), {
        ...context,
        orderIds: Array.from({ length: 100 }, (_, id) => id),
      });
    const summary = diagnostics.summary();
    expect(summary).toMatchObject({ failureCount: 30, failuresTruncated: 10 });
    expect(summary.failures).toHaveLength(20);
    expect(summary.failures![0].orderIds).toHaveLength(10);
  });
});
