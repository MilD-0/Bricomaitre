import { beforeEach, describe, expect, it, vi } from 'vitest';

const { cookiesMock, getDbMock, hasDbMock, headersMock, makeSignatureMock, redirectMock, tx } =
  vi.hoisted(() => {
    const conflict = { onConflictDoUpdate: vi.fn().mockResolvedValue(undefined) };
    const transaction = {
      insert: vi.fn(() => ({ values: vi.fn(() => conflict) })),
    };
    return {
      cookiesMock: vi.fn(async () => ({ set: vi.fn() })),
      getDbMock: vi.fn(() => ({
        transaction: (run: (value: typeof transaction) => unknown) => run(transaction),
      })),
      hasDbMock: vi.fn(() => true),
      headersMock: vi.fn(
        async () => new Headers({ 'user-agent': 'demo-browser', 'x-real-ip': '127.0.0.1' }),
      ),
      makeSignatureMock: vi.fn(async () => 'signature'),
      redirectMock: vi.fn(),
      tx: transaction,
    };
  });

vi.mock('@bric/db/client', () => ({ getDb: getDbMock, hasDb: hasDbMock }));
vi.mock('better-auth/crypto', () => ({ makeSignature: makeSignatureMock }));
vi.mock('next/headers', () => ({ cookies: cookiesMock, headers: headersMock }));
vi.mock('next/navigation', () => ({ redirect: redirectMock }));

import { isDemoMode, signInDemo } from './demo-auth';

describe('demo authentication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BRIC_DEMO_MODE = 'true';
    process.env.BRIC_DEMO_SESSION_SEED = 'test-demo-session-seed';
    process.env.BETTER_AUTH_SECRET = 'test-better-auth-secret-at-least-thirty-two-characters';
    process.env.BETTER_AUTH_URL = 'https://ops.demo.example.com';
  });

  it('requires an explicit demo-mode switch', () => {
    expect(isDemoMode({ BRIC_DEMO_MODE: 'TRUE' })).toBe(true);
    expect(isDemoMode({})).toBe(false);
  });

  it('creates a real database session and signs its secure cookie', async () => {
    const cookieStore = { set: vi.fn() };
    cookiesMock.mockResolvedValueOnce(cookieStore);

    await signInDemo('/fr/administration');

    expect(tx.insert).toHaveBeenCalledTimes(3);
    expect(makeSignatureMock).toHaveBeenCalledWith(
      expect.any(String),
      process.env.BETTER_AUTH_SECRET,
    );
    expect(cookieStore.set).toHaveBeenCalledWith(
      '__Secure-better-auth.session_token',
      expect.stringMatching(/^[a-f0-9]{64}\.signature$/),
      expect.objectContaining({ httpOnly: true, sameSite: 'lax', secure: true }),
    );
    expect(redirectMock).toHaveBeenCalledWith('/fr/administration');
  });

  it('cannot be used when demo mode is off', async () => {
    process.env.BRIC_DEMO_MODE = 'false';
    await expect(signInDemo('/fr/administration')).rejects.toThrow('Demo sign-in is disabled.');
    expect(getDbMock).not.toHaveBeenCalled();
  });
});
