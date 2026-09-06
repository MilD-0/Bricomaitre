import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

const { authMock, appShellMock, redirectMock, connectionMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  appShellMock: vi.fn(({ children }: { children: React.ReactNode }) => <div>{children}</div>),
  redirectMock: vi.fn(),
  connectionMock: vi.fn(),
}));

vi.mock('../../../lib/auth', () => ({
  auth: authMock,
}));

vi.mock('../../../components/layout/app-shell', () => ({
  AppShell: appShellMock,
}));

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}));

vi.mock('next/server', () => ({
  connection: connectionMock,
}));

import ProtectedLayout from './layout';

describe('app/[locale]/(app)/layout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redirectMock.mockImplementation(() => {
      throw new Error('REDIRECT');
    });
    authMock.mockResolvedValue({
      user: {
        id: 'user-1',
        email: 'ada@example.com',
        name: 'Ada Lovelace',
        image: 'https://session.example.com/avatar.png',
        isAllowed: true,
        permissions: ['products_write'],
        role: 'admin',
        roleLabel: null,
      },
    });
  });

  it('provides the authenticated profile and permissions to the application shell', async () => {
    const ui = await ProtectedLayout({
      children: <div>content</div>,
      params: Promise.resolve({ locale: 'en' }),
    });

    render(ui);
    expect(appShellMock).toHaveBeenCalledWith(
      expect.objectContaining({
        initialUserEmail: 'ada@example.com',
        initialUserName: 'Ada Lovelace',
        initialUserImage: 'https://session.example.com/avatar.png',
        initialPermissions: ['products_write'],
        initialIsAllowed: true,
      }),
      undefined,
    );
  });

  it('redirects disallowed users back to the locale root', async () => {
    authMock.mockResolvedValue({
      user: {
        isAllowed: false,
      },
    });

    await expect(
      ProtectedLayout({
        children: <div>content</div>,
        params: Promise.resolve({ locale: 'fr' }),
      }),
    ).rejects.toThrow('REDIRECT');
    expect(appShellMock).not.toHaveBeenCalled();
    expect(redirectMock).toHaveBeenCalledWith('/fr');
  });
});
