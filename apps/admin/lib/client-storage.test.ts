import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { readClientStorage, writeClientStorage } from './client-storage';

describe('client storage', () => {
  const values = new Map<string, string>();

  beforeEach(() => {
    values.clear();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        removeItem: (key: string) => values.delete(key),
        setItem: (key: string, value: string) => values.set(key, value),
      },
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('round-trips JSON values and removes null values', () => {
    writeClientStorage('view', { mode: 'cards' });
    expect(readClientStorage('view')).toEqual({ mode: 'cards' });

    writeClientStorage('view', null);
    expect(readClientStorage('view')).toBeNull();
  });

  it('treats malformed stored JSON as absent', () => {
    window.localStorage.setItem('view', '{');
    expect(readClientStorage('view')).toBeNull();
  });

  it('is safe during server rendering', () => {
    vi.unstubAllGlobals();

    expect(readClientStorage('view')).toBeNull();
    expect(() => writeClientStorage('view', { mode: 'cards' })).not.toThrow();
  });
});
