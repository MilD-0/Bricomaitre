import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  credentialsProviderMock,
  drizzleAdapterMock,
  googleProviderMock,
  hasDbMock,
  nextAuthMock,
  buildAccessProfileMock,
  isEmailAllowedMock,
  loadAccessProfileForUserIdMock,
} = vi.hoisted(() => ({
  buildAccessProfileMock: vi.fn(async ({ permissions = [], role = 'viewer', roleLabel = null, isAllowed = true }) => ({
    isAllowed,
    permissions,
    role,
    roleDefinitionId: null,
    roleLabel,
  })),
  credentialsProviderMock: vi.fn((config) => ({ id: 'credentials', ...config })),
  drizzleAdapterMock: vi.fn(() => ({ name: 'drizzle-adapter' })),
  googleProviderMock: vi.fn((config) => ({ id: 'google', ...config })),
  hasDbMock: vi.fn(),
  isEmailAllowedMock: vi.fn(async () => true),
  loadAccessProfileForUserIdMock: vi.fn(async (_userId, fallback) => ({
    isAllowed: true,
    permissions: fallback.permissions ?? [],
    role: fallback.role ?? 'viewer',
    roleDefinitionId: null,
    roleLabel: fallback.roleLabel ?? null,
  })),
  nextAuthMock: vi.fn(() => ({
    auth: vi.fn(),
    handlers: {
      GET: vi.fn(),
      POST: vi.fn(),
    },
    signIn: vi.fn(),
    signOut: vi.fn(),
  })),
}));

vi.mock('next-auth/providers/credentials', () => ({
  default: credentialsProviderMock,
}));

vi.mock('next-auth/providers/google', () => ({
  default: googleProviderMock,
}));

vi.mock('@auth/drizzle-adapter', () => ({
  DrizzleAdapter: drizzleAdapterMock,
}));

vi.mock('../db/client', () => ({
  getDb: vi.fn(() => ({})),
  hasDb: hasDbMock,
}));

vi.mock('./access', () => ({
  buildAccessProfile: buildAccessProfileMock,
  isEmailAllowed: isEmailAllowedMock,
  loadAccessProfileForUserId: loadAccessProfileForUserIdMock,
}));

vi.mock('next-auth', () => ({
  default: nextAuthMock,
}));

describe('auth config', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env.GOOGLE_CLIENT_ID = 'google-client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'google-client-secret';
    delete process.env.AUTH_TRUST_HOST;
    delete process.env.NEXTAUTH_TRUST_HOST;
    delete process.env.AUTH_URL;
    delete process.env.NEXTAUTH_URL;
    hasDbMock.mockReturnValue(true);
  });

  it('initializes Auth.js with jwt session strategy, adapter, callbacks, and google + credentials providers', async () => {
    const { auth, handlers, signIn, signOut } = await import('./auth');

    expect(nextAuthMock).toHaveBeenCalledTimes(1);
    expect(googleProviderMock).toHaveBeenCalledTimes(1);
    expect(credentialsProviderMock).toHaveBeenCalledTimes(1);
    expect(drizzleAdapterMock).toHaveBeenCalledTimes(1);

    expect(googleProviderMock).toHaveBeenCalledWith({
      clientId: 'google-client-id',
      clientSecret: 'google-client-secret',
    });

    expect(nextAuthMock).toHaveBeenCalledWith(
      expect.objectContaining({
        adapter: expect.objectContaining({ name: 'drizzle-adapter' }),
        trustHost: false,
        session: expect.objectContaining({
          strategy: 'jwt',
        }),
        callbacks: expect.objectContaining({
          signIn: expect.any(Function),
          jwt: expect.any(Function),
          session: expect.any(Function),
        }),
        providers: expect.arrayContaining([
          expect.objectContaining({ id: 'google' }),
          expect.objectContaining({ id: 'credentials' }),
        ]),
      }),
    );

    expect(auth).toBeDefined();
    expect(handlers).toEqual(
      expect.objectContaining({
        GET: expect.any(Function),
        POST: expect.any(Function),
      }),
    );
    expect(signIn).toBeDefined();
    expect(signOut).toBeDefined();
  });

  it('omits the adapter when the database is unavailable', async () => {
    hasDbMock.mockReturnValue(false);

    await import('./auth');

    expect(drizzleAdapterMock).not.toHaveBeenCalled();
    expect(nextAuthMock).toHaveBeenCalledWith(expect.objectContaining({ adapter: undefined }));
  });

  it('fails fast when Google OAuth env vars are missing', async () => {
    delete process.env.GOOGLE_CLIENT_ID;

    await expect(import('./auth')).rejects.toThrow('Missing required environment variable: GOOGLE_CLIENT_ID');
  });

  it('uses the allowlist check during sign-in', async () => {
    await import('./auth');
    const config = nextAuthMock.mock.calls[0][0];

    await config.callbacks.signIn({ user: { email: 'person@example.com' } });

    expect(isEmailAllowedMock).toHaveBeenCalledWith('person@example.com');
  });

  it('trusts localhost callback hosts inferred from NEXTAUTH_URL', async () => {
    process.env.NEXTAUTH_URL = 'http://localhost:3000';

    await import('./auth');

    expect(nextAuthMock).toHaveBeenCalledWith(expect.objectContaining({ trustHost: true }));
  });

  it('trusts the host when AUTH_TRUST_HOST is explicitly enabled', async () => {
    process.env.AUTH_TRUST_HOST = 'true';

    await import('./auth');

    expect(nextAuthMock).toHaveBeenCalledWith(expect.objectContaining({ trustHost: true }));
  });

  it('does not trust arbitrary non-local callback hosts by default', async () => {
    process.env.NEXTAUTH_URL = 'https://admin.example.com';

    await import('./auth');

    expect(nextAuthMock).toHaveBeenCalledWith(expect.objectContaining({ trustHost: false }));
  });
});
