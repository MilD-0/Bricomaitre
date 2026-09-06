import { describe, expect, it } from 'vitest';

import { parseCubicBezier, parseDurationSeconds } from './design-tokens';

describe('admin design tokens', () => {
  it('parses root-controlled Motion values and retains safe fallbacks', () => {
    expect(parseDurationSeconds('240ms', 1)).toBe(0.24);
    expect(parseDurationSeconds('0.5s', 1)).toBe(0.5);
    expect(parseDurationSeconds('initial', 0.2)).toBe(0.2);
    expect(parseCubicBezier('cubic-bezier(0.22, 1, 0.36, 1)')).toEqual([0.22, 1, 0.36, 1]);
    expect(parseCubicBezier('initial')).toEqual([0.22, 1, 0.36, 1]);
  });
});
