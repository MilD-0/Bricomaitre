import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

const { authMock, hasDbMock, getDbMock, appShellMock, redirectMock, connectionMock } = vi.hoisted(
  () => ({
    authMock: vi.fn(),
    hasDbMock: vi.fn(),
    getDbMock: vi.fn(),
    appShellMock: vi.fn(({ children }: { children: React.ReactNode }) => <div>{children}</div>),
    redirectMock: vi.fn(),
    connectionMock: vi.fn(),
  }),
);

vi.mock('../../../lib/auth', () => ({
  auth: authMock,
}));

vi.mock('@bric/db/client', () => ({
  hasDb: hasDbMock,
  getDb: getDbMock,
}));

vi.mock('@bric/db/schema', () => ({
  users: { id: 'id' },
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
    hasDbMock.mockReturnValue(true);
    getDbMock.mockReturnValue({
      query: {
        users: {
          findFirst: vi.fn().mockResolvedValue({
            image: 'https://db.example.com/avatar.png',
          }),
        },
      },
    });
  });

  it('prefers the users table image for the sidebar avatar', async () => {
    const ui = await ProtectedLayout({
      children: <div>content</div>,
      params: Promise.resolve({ locale: 'en' }),
    });

    render(ui);
    expect(appShellMock).toHaveBeenCalledWith(
      expect.objectContaining({
        initialUserEmail: 'ada@example.com',
        initialUserName: 'Ada Lovelace',
        initialUserImage: 'https://db.example.com/avatar.png',
      }),
      undefined,
    );
  });

  it('falls back to the session image when the user row is unavailable', async () => {
    getDbMock.mockReturnValue({
      query: {
        users: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      },
    });

    const ui = await ProtectedLayout({
      children: <div>content</div>,
      params: Promise.resolve({ locale: 'en' }),
    });

    render(ui);
    expect(appShellMock).toHaveBeenCalledWith(
      expect.objectContaining({ initialUserImage: 'https://session.example.com/avatar.png' }),
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
    expect(getDbMock).not.toHaveBeenCalled();

    expect(redirectMock).toHaveBeenCalledWith('/fr');
  });
});
