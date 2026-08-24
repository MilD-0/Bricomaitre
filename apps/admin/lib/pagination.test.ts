import { describe, expect, it } from 'vitest';

import { getPaginationItems } from './pagination';

describe('getPaginationItems', () => {
  it('shows every page for short collections', () => {
    expect(getPaginationItems(3, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it('keeps both edges and the current neighborhood for long collections', () => {
    expect(getPaginationItems(8, 20)).toEqual([1, 'ellipsis-1', 7, 8, 9, 'ellipsis-9', 20]);
  });

  it('keeps useful runs at the beginning and end', () => {
    expect(getPaginationItems(2, 20)).toEqual([1, 2, 3, 4, 5, 'ellipsis-5', 20]);
    expect(getPaginationItems(19, 20)).toEqual([1, 'ellipsis-1', 16, 17, 18, 19, 20]);
  });
});
