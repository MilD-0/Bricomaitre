import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authMock, authPanelMock, connectionMock, getTranslationsMock, redirectMock, signInMock } =
  vi.hoisted(() => ({
    authMock: vi.fn(),
    authPanelMock: vi.fn(() => <div>GoogleLoginPanel</div>),
    connectionMock: vi.fn(),
    getTranslationsMock: vi.fn(),
    redirectMock: vi.fn(),
    signInMock: vi.fn(),
  }));

vi.mock('../../lib/auth', () => ({
  auth: authMock,
  signIn: signInMock,
}));

vi.mock('next-intl/server', () => ({
  getTranslations: getTranslationsMock,
}));

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}));

vi.mock('next/server', () => ({
  connection: connectionMock,
}));

vi.mock('../../components/auth/google-login-panel', () => ({
  GoogleLoginPanel: authPanelMock,
}));

import LocaleRootPage from './page';

describe('LocaleRootPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTranslationsMock.mockResolvedValue((key: string) => {
      const map: Record<string, string> = {
        'auth.signInWithGoogle': 'Sign in with Google',
      };

      return map[key] ?? key;
    });
  });

  it('redirects authenticated users to administration page', async () => {
    authMock.mockResolvedValue({
      user: {
        email: 'admin@example.com',
        isAllowed: true,
        permissions: ['settings_manage'],
        role: 'admin',
      },
    });

    await LocaleRootPage({ params: Promise.resolve({ locale: 'en' }) });

    expect(redirectMock).toHaveBeenCalledWith('/en/administration');
  });

  it('renders the same Google login button for authenticated but disallowed users', async () => {
    authMock.mockResolvedValue({ user: { email: 'blocked@example.com', isAllowed: false } });

    const ui = await LocaleRootPage({ params: Promise.resolve({ locale: 'en' }) });
    render(ui);

    expect(authPanelMock).toHaveBeenCalledWith(
      expect.objectContaining({
        signInLabel: 'Sign in with Google',
      }),
      undefined,
    );
    expect(getTranslationsMock).toHaveBeenCalledTimes(1);
  });
});
