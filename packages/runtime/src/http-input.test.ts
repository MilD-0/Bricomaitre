import { describe, expect, it } from 'vitest';

import { parsePositiveIntegerId, parsePositiveIntegerIds } from './http-input';

describe('parsePositiveIntegerId', () => {
  it.each([
    ['1', 1],
    ['42', 42],
  ])('accepts %s', (input, expected) => {
    expect(parsePositiveIntegerId(input)).toBe(expected);
  });

  it.each([
    '',
    '0',
    '-1',
    '+1',
    ' 1 ',
    '1.5',
    '1e2',
    'NaN',
    'abc',
    String(Number.MAX_SAFE_INTEGER + 1),
  ])('rejects %s', (input) => {
    expect(parsePositiveIntegerId(input)).toBeNull();
  });
});

describe('parsePositiveIntegerIds', () => {
  it('accepts exact numeric values and digit strings while preserving first-seen order', () => {
    expect(parsePositiveIntegerIds([11, '12', 11, '13'])).toEqual([11, 12, 13]);
  });

  it.each([
    [[]],
    [[0]],
    [[-1]],
    [[1.5]],
    [[Number.MAX_SAFE_INTEGER + 1]],
    [[' 1 ']],
    [['1e2']],
    [['']],
    [[null]],
    [[{}]],
  ])('rejects an empty collection or any malformed member: %j', (input) => {
    expect(parsePositiveIntegerIds(input)).toBeNull();
  });
});
