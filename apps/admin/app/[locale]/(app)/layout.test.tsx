import { beforeEach, describe, expect, it, vi } from 'vitest';

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

    expect(ui.props.initialUserEmail).toBe('ada@example.com');
    expect(ui.props.initialUserName).toBe('Ada Lovelace');
    expect(ui.props.initialUserImage).toBe('https://db.example.com/avatar.png');
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

    expect(ui.props.initialUserImage).toBe('https://session.example.com/avatar.png');
  });

  it('redirects disallowed users back to the locale root', async () => {
    authMock.mockResolvedValue({
      user: {
        isAllowed: false,
      },
    });

    await ProtectedLayout({
      children: <div>content</div>,
      params: Promise.resolve({ locale: 'fr' }),
    });

    expect(redirectMock).toHaveBeenCalledWith('/fr');
  });
});
