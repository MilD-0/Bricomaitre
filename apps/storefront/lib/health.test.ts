import { describe, expect, it } from 'vitest';

import { buildHealthPayload } from './health';

describe('buildHealthPayload', () => {
  it('returns the storefront health payload', () => {
    expect(buildHealthPayload()).toEqual({
      status: 'ok',
      app: 'storefront',
    });
  });
});
