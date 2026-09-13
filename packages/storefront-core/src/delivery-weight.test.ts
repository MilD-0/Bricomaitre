import { describe, expect, it } from 'vitest';
import { getTotalWeightKg, getWeightSurcharge } from './delivery-weight';

describe('delivery weight', () => {
  it.each([
    [0, 0],
    [4.999, 0],
    [5, 0],
    [5.001, 50],
    [5.2, 50],
    [6, 50],
    [6.2, 100],
    [7, 100],
  ])('charges %s kg at %s DA', (weight, fee) => expect(getWeightSurcharge(weight)).toBe(fee));
  it('adds quantities and mixed products before applying the threshold, ignoring unknown weights', () => {
    const weight = getTotalWeightKg([
      { weightKg: '2.600', quantity: 2 },
      { weightKg: 1, quantity: 1 },
      { weightKg: null, quantity: 4 },
      { quantity: 3 },
    ]);
    expect(weight).toBe(6.2);
    expect(getWeightSurcharge(weight)).toBe(100);
    expect(getTotalWeightKg([])).toBe(0);
  });
  it('keeps gram precision at an exact threshold', () => {
    const weight = getTotalWeightKg([
      { weightKg: 0.1, quantity: 49 },
      { weightKg: 0.1, quantity: 1 },
    ]);
    expect(weight).toBe(5);
    expect(getWeightSurcharge(weight)).toBe(0);
  });
});
