import { describe, expect, it } from 'vitest';

import { createPublicOrderTokenExpiry, hasActivePublicToken } from './order-access';

describe('public order-token lifetime', () => {
  const token = 'public-token';
  const createdAt = new Date('2026-01-01T00:00:00.000Z');

  it('accepts an explicitly unexpired token and rejects it at expiry', () => {
    const publicTokenExpiresAt = createPublicOrderTokenExpiry(createdAt);
    const order = { publicToken: token, publicTokenExpiresAt, createdAt };

    expect(hasActivePublicToken(order, token, new Date('2026-03-31T23:59:59.999Z'))).toBe(true);
    expect(hasActivePublicToken(order, token, publicTokenExpiresAt)).toBe(false);
  });

  it('applies the same finite lifetime to tokens created before the expiry column existed', () => {
    const legacyOrder = { publicToken: token, publicTokenExpiresAt: null, createdAt };

    expect(hasActivePublicToken(legacyOrder, token, new Date('2026-03-01T00:00:00.000Z'))).toBe(
      true,
    );
    expect(hasActivePublicToken(legacyOrder, token, new Date('2026-04-02T00:00:00.000Z'))).toBe(
      false,
    );
  });

  it('rejects a different token even inside the validity window', () => {
    expect(
      hasActivePublicToken(
        { publicToken: token, publicTokenExpiresAt: null, createdAt },
        'different-token',
        createdAt,
      ),
    ).toBe(false);
  });
});
