import { describe, expect, it } from 'vitest';
import { ecotrackRecoveryRequestSchema } from './ecotrack-recovery';

describe('carrier recovery request', () => {
  it('accepts an operator decision without an evidence note', () => {
    expect(
      ecotrackRecoveryRequestSchema.parse({
        operationId: '00000000-0000-4000-8000-000000000001',
        action: 'confirm_applied',
        trackingNumber: 'TRACK-101',
      }),
    ).toEqual({
      operationId: '00000000-0000-4000-8000-000000000001',
      action: 'confirm_applied',
      trackingNumber: 'TRACK-101',
    });
  });
});
