import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  authMock,
  authPanelMock,
  connectionMock,
  getLocaleMock,
  getTranslationsMock,
  redirectMock,
  signInMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  authPanelMock: vi.fn(() => <div>GoogleLoginPanel</div>),
  connectionMock: vi.fn(),
  getLocaleMock: vi.fn(),
  getTranslationsMock: vi.fn(),
  redirectMock: vi.fn(),
  signInMock: vi.fn(),
}));

vi.mock('../lib/auth', () => ({
  auth: authMock,
  signIn: signInMock,
}));

vi.mock('next-intl/server', () => ({
  getLocale: getLocaleMock,
  getTranslations: getTranslationsMock,
}));

vi.mock('next/server', () => ({
  connection: connectionMock,
}));

vi.mock('../components/auth/google-login-panel', () => ({
  GoogleLoginPanel: authPanelMock,
}));

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}));

import HomePage from './page';

describe('HomePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getLocaleMock.mockResolvedValue('fr');
    getTranslationsMock.mockResolvedValue((key: string, values?: { user?: string }) => {
      if (key === 'auth.signedInAs') {
        return `SIGNED:${values?.user}`;
      }

      const map: Record<string, string> = {
        'auth.signInWithGoogle': 'Se connecter avec Google',
      };

      return map[key] ?? key;
    });
  });

  it('renders translated Google sign-in for unauthenticated users and redirects with dynamic locale', async () => {
    authMock.mockResolvedValueOnce(null);

    const ui = await HomePage();
    render(ui);

    expect(authMock).toHaveBeenCalledTimes(1);
    expect(authPanelMock).toHaveBeenCalledWith(
      expect.objectContaining({
        signInLabel: 'Se connecter avec Google',
      }),
      undefined,
    );

    const props = authPanelMock.mock.calls[0][0];
    await props.onSignIn();

    expect(signInMock).toHaveBeenCalledWith('google', { redirectTo: '/fr/administration' });
  });

  it('redirects allowlisted users to their first accessible page', async () => {
    authMock.mockResolvedValueOnce({
      user: {
        isAllowed: true,
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        permissions: ['orders_write'],
        role: 'employee',
      },
    });

    await HomePage();

    expect(redirectMock).toHaveBeenCalledWith('/fr/orders');
  });

  it('still renders the Google login button when session is present but not allowed', async () => {
    authMock.mockResolvedValueOnce({
      user: {
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        isAllowed: false,
      },
    });

    const ui = await HomePage();
    render(ui);

    expect(authPanelMock).toHaveBeenCalledWith(
      expect.objectContaining({
        signInLabel: 'Se connecter avec Google',
      }),
      undefined,
    );

    const props = authPanelMock.mock.calls[0][0];
    await props.onSignIn();

    expect(signInMock).toHaveBeenCalledWith('google', { redirectTo: '/fr/administration' });
  });
});
