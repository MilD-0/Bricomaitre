import { describe, expect, it } from 'vitest';

import { parsePositiveIntegerId } from './http-input';

describe('parsePositiveIntegerId', () => {
  it.each([
    ['1', 1],
    ['42', 42],
  ])('accepts %s', (input, expected) => {
    expect(parsePositiveIntegerId(input)).toBe(expected);
  });

  it.each(['', '0', '-1', '1.5', 'NaN', 'abc', String(Number.MAX_SAFE_INTEGER + 1)])(
    'rejects %s',
    (input) => {
      expect(parsePositiveIntegerId(input)).toBeNull();
    },
  );
});
