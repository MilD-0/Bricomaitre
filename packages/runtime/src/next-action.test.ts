import { describe, expect, it } from 'vitest';

import { hasUnexpectedNextAction } from './next-action';

describe('Next Action request boundary', () => {
  it('detects the case-insensitive protocol header', () => {
    expect(hasUnexpectedNextAction(new Headers({ 'Next-Action': 'probe-id' }))).toBe(true);
  });

  it('does not reject ordinary requests', () => {
    expect(hasUnexpectedNextAction(new Headers({ accept: 'application/json' }))).toBe(false);
  });
});
