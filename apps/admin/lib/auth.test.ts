import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  apiErrorMock,
  betterAuthMock,
  drizzleAdapterMock,
  getSessionMock,
  hasDbMock,
  headersMock,
  isEmailAllowedMock,
  loadAccessProfileForUserIdMock,
  nextCookiesMock,
  redirectMock,
  signInSocialMock,
} = vi.hoisted(() => ({
  apiErrorMock: class APIErrorMock extends Error {},
  betterAuthMock: vi.fn(),
  drizzleAdapterMock: vi.fn(() => ({ name: 'drizzle-adapter' })),
  getSessionMock: vi.fn(),
  hasDbMock: vi.fn(),
  headersMock: vi.fn(async () => new Headers({ cookie: 'better-auth.session_token=test' })),
  isEmailAllowedMock: vi.fn(async () => true),
  loadAccessProfileForUserIdMock: vi.fn(async () => ({
    isAllowed: true,
    permissions: ['products_read'],
    role: 'employee',
    roleDefinitionId: null,
    roleLabel: null,
  })),
  nextCookiesMock: vi.fn(() => ({ id: 'next-cookies' })),
  redirectMock: vi.fn(),
  signInSocialMock: vi.fn(),
}));

vi.mock('better-auth/minimal', () => ({
  betterAuth: betterAuthMock,
}));

vi.mock('@better-auth/drizzle-adapter', () => ({
  drizzleAdapter: drizzleAdapterMock,
}));

vi.mock('better-auth/api', () => ({
  APIError: apiErrorMock,
}));

vi.mock('better-auth/next-js', () => ({
  nextCookies: nextCookiesMock,
}));

vi.mock('next/headers', () => ({
  headers: headersMock,
}));

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}));

vi.mock('@bric/db/client', () => ({
  getDb: vi.fn(() => ({})),
  hasDb: hasDbMock,
}));

vi.mock('./access', () => ({
  buildAccessProfile: vi.fn(),
  isEmailAllowed: isEmailAllowedMock,
  loadAccessProfileForUserId: loadAccessProfileForUserIdMock,
}));

describe('Better Auth configuration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env.BETTER_AUTH_SECRET = 'test-better-auth-secret-at-least-thirty-two-characters';
    process.env.BETTER_AUTH_URL = 'https://admin.example.com';
    process.env.GOOGLE_CLIENT_ID = 'google-client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'google-client-secret';
    hasDbMock.mockReturnValue(true);
    isEmailAllowedMock.mockResolvedValue(true);
    loadAccessProfileForUserIdMock.mockResolvedValue({
      isAllowed: true,
      permissions: ['products_read'],
      role: 'employee',
      roleDefinitionId: null,
      roleLabel: null,
    });
    betterAuthMock.mockReturnValue({
      $Infer: {},
      api: {
        getSession: getSessionMock,
        signInSocial: signInSocialMock,
      },
    });
  });

  it('configures Google, Drizzle, Better Auth secrets, and server-action cookies', async () => {
    const { authServer } = await import('./auth');

    expect(drizzleAdapterMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        provider: 'pg',
        schema: expect.objectContaining({
          account: expect.anything(),
          session: expect.anything(),
          user: expect.anything(),
          verification: expect.anything(),
        }),
      }),
    );
    expect(betterAuthMock).toHaveBeenCalledWith(
      expect.objectContaining({
        account: {
          modelName: 'account',
        },
        baseURL: 'https://admin.example.com',
        database: expect.objectContaining({ name: 'drizzle-adapter' }),
        secret: 'test-better-auth-secret-at-least-thirty-two-characters',
        socialProviders: {
          google: {
            clientId: 'google-client-id',
            clientSecret: 'google-client-secret',
          },
        },
        plugins: [expect.objectContaining({ id: 'next-cookies' })],
      }),
    );
    expect(authServer).toBeDefined();
  });

  it('rejects unauthorized identities before creating a user', async () => {
    isEmailAllowedMock.mockResolvedValue(false);
    await import('./auth');
    const config = betterAuthMock.mock.calls[0][0];

    await expect(
      config.databaseHooks.user.create.before({ email: 'blocked@example.com' }),
    ).rejects.toBeInstanceOf(apiErrorMock);
    expect(isEmailAllowedMock).toHaveBeenCalledWith('blocked@example.com');
  });

  it('rejects a session when an existing user no longer has access', async () => {
    loadAccessProfileForUserIdMock.mockResolvedValue({
      isAllowed: false,
      permissions: [],
      role: 'viewer',
      roleDefinitionId: null,
      roleLabel: null,
    });
    await import('./auth');
    const config = betterAuthMock.mock.calls[0][0];

    await expect(
      config.databaseHooks.session.create.before({ userId: 'user-1' }),
    ).rejects.toBeInstanceOf(apiErrorMock);
  });

  it('enriches Better Auth sessions with the current RBAC profile', async () => {
    getSessionMock.mockResolvedValue({
      session: { id: 'session-1', token: 'secret-token' },
      user: { id: 'user-1', email: 'person@example.com', name: 'Person', role: 'viewer' },
    });
    const { auth } = await import('./auth');

    const session = await auth();

    expect(getSessionMock).toHaveBeenCalledWith({ headers: expect.any(Headers) });
    expect(loadAccessProfileForUserIdMock).toHaveBeenCalledWith('user-1', {
      email: 'person@example.com',
      role: 'viewer',
    });
    expect(session?.user).toEqual(
      expect.objectContaining({
        isAllowed: true,
        permissions: ['products_read'],
        role: 'employee',
      }),
    );
  });

  it('starts Google OAuth and redirects to the provider URL', async () => {
    signInSocialMock.mockResolvedValue({ url: 'https://accounts.google.com/oauth' });
    const { signIn } = await import('./auth');

    await signIn('google', { redirectTo: '/en/administration' });

    expect(signInSocialMock).toHaveBeenCalledWith({
      body: { callbackURL: '/en/administration', provider: 'google' },
    });
    expect(redirectMock).toHaveBeenCalledWith('https://accounts.google.com/oauth');
  });

  it.each([
    'BETTER_AUTH_SECRET',
    'BETTER_AUTH_URL',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
  ] as const)('fails fast when %s is missing', async (key) => {
    delete process.env[key];
    await expect(import('./auth')).rejects.toThrow(`Missing required environment variable: ${key}`);
  });
});
