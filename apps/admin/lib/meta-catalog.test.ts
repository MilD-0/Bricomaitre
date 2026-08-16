import { beforeEach, describe, expect, it, vi } from 'vitest';

import { toXlsxBuffer } from './meta-catalog';

describe('lib/meta-catalog', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('writes xlsx workbooks to a buffer', () => {
    const buffer = toXlsxBuffer({
      SheetNames: ['Meta Catalog'],
      Sheets: { 'Meta Catalog': { A1: { t: 's', v: 'id' }, '!ref': 'A1' } },
    });

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(0);
  });
});
