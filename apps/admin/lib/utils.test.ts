import { describe, expect, it } from 'vitest';

import { navigationKeys } from './navigation';
import { cn } from './utils';

describe('cn', () => {
  it('merges class names and resolves tailwind conflicts', () => {
    const result = cn('p-2', false && 'hidden', 'p-4', 'text-sm');

    expect(result).toBe('p-4 text-sm');
  });
});

describe('navigationKeys', () => {
  it('contains expected stable route keys', () => {
    expect(navigationKeys).toEqual([
      'administration',
      'products',
      'orders',
      'inventory',
      'assets',
      'brandsCategories',
      'stats',
      'bulletin',
    ]);
  });
});
