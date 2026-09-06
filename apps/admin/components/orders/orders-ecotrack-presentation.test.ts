import { describe, expect, it } from 'vitest';

import {
  buildEcotrackFailureSummary,
  formatEcotrackAmountInput,
  formatEcotrackDateTime,
  formatEcotrackMoney,
  getTrackingHistoryStatusKey,
} from './orders-ecotrack-presentation';

describe('Ecotrack presentation helpers', () => {
  it('summarizes only the requested number of bulk failures', () => {
    const failures = [
      { orderId: 1, reference: null, trackingNumber: null, message: 'First failure.' },
      { orderId: 2, reference: null, trackingNumber: null, message: 'Second failure.' },
      { orderId: 3, reference: null, trackingNumber: null, message: 'Third failure.' },
    ];

    expect(buildEcotrackFailureSummary(failures)).toBe('First failure. Second failure.');
    expect(buildEcotrackFailureSummary(failures, 1)).toBe('First failure.');
  });

  it('keeps empty and invalid dates controlled', () => {
    expect(formatEcotrackDateTime('en-US', null)).toBeNull();
    expect(formatEcotrackDateTime('en-US', 'not-a-date')).toBe('not-a-date');
  });

  it('normalizes editable amounts without inventing missing values', () => {
    expect(formatEcotrackAmountInput(12)).toBe('12.00');
    expect(formatEcotrackAmountInput(12.345)).toBe('12.35');
    expect(formatEcotrackAmountInput(null)).toBe('');
    expect(formatEcotrackAmountInput(Number.NaN)).toBe('');
    expect(formatEcotrackMoney('en-US', null)).toBe('0.00');
  });

  it('maps known tracking statuses to translation keys', () => {
    expect(getTrackingHistoryStatusKey(' PICKED ')).toBe(
      'ordersEcotrackManager.historyStatuses.picked',
    );
    expect(getTrackingHistoryStatusKey('carrier-specific-status')).toBeNull();
  });
});
