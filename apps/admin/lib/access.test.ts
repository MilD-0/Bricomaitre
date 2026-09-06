import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getDbMock, hasDbMock } = vi.hoisted(() => ({
  getDbMock: vi.fn(),
  hasDbMock: vi.fn(),
}));

vi.mock('@bric/db/client', () => ({
  getDb: getDbMock,
  hasDb: hasDbMock,
}));

import { buildAccessProfile, loadAccessProfileForUserId } from './access';

describe('access helpers', () => {
  beforeEach(() => {
    getDbMock.mockReset();
    hasDbMock.mockReset();
    hasDbMock.mockReturnValue(false);
  });

  it('falls back to built-in role permissions when no custom role is assigned', async () => {
    hasDbMock.mockReturnValue(true);
    getDbMock.mockReturnValue({
      query: {
        userAccessGrants: {
          findFirst: vi.fn().mockResolvedValue({
            email: 'employee@example.com',
            role: 'employee',
            roleDefinitionId: null,
          }),
        },
      },
    });

    await expect(buildAccessProfile({ email: 'employee@example.com' })).resolves.toEqual({
      isAllowed: true,
      permissions: ['products_write', 'orders_write', 'assets_write', 'brands_categories_write'],
      role: 'employee',
      roleDefinitionId: null,
      roleLabel: null,
    });
  });

  it('loads custom role metadata and permissions from role definitions', async () => {
    hasDbMock.mockReturnValue(true);
    getDbMock.mockReturnValue({
      query: {
        userAccessGrants: {
          findFirst: vi.fn().mockResolvedValue({
            email: 'campaigns@example.com',
            role: 'viewer',
            roleDefinitionId: 7,
          }),
        },
        roleDefinitions: {
          findFirst: vi
            .fn()
            .mockResolvedValue({ id: 7, name: 'Campaign Manager', slug: 'campaign-manager' }),
        },
      },
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi
            .fn()
            .mockResolvedValue([
              { permission: 'brands_categories_write' },
              { permission: 'settings_manage' },
            ]),
        })),
      })),
    });

    await expect(buildAccessProfile({ email: 'campaigns@example.com' })).resolves.toEqual({
      isAllowed: true,
      permissions: ['brands_categories_write', 'settings_manage'],
      role: 'campaign-manager',
      roleDefinitionId: 7,
      roleLabel: 'Campaign Manager',
    });
  });

  it('denies users whose email is not allowlisted', async () => {
    hasDbMock.mockReturnValue(true);
    getDbMock.mockReturnValue({
      query: {
        userAccessGrants: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      },
    });

    await expect(buildAccessProfile({ email: 'blocked@example.com' })).resolves.toEqual({
      isAllowed: false,
      permissions: [],
      role: 'viewer',
      roleDefinitionId: null,
      roleLabel: null,
    });
  });

  it('loads user access from the users table when a session token has a subject', async () => {
    hasDbMock.mockReturnValue(true);
    getDbMock.mockReturnValue({
      query: {
        users: {
          findFirst: vi.fn().mockResolvedValue({
            email: 'campaigns@example.com',
            role: 'viewer',
            roleDefinitionId: 7,
          }),
        },
        userAccessGrants: {
          findFirst: vi.fn().mockResolvedValue({
            email: 'campaigns@example.com',
            role: 'viewer',
            roleDefinitionId: 7,
          }),
        },
        roleDefinitions: {
          findFirst: vi
            .fn()
            .mockResolvedValue({ id: 7, name: 'Campaign Manager', slug: 'campaign-manager' }),
        },
      },
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn().mockResolvedValue([{ permission: 'assets_write' }]),
        })),
      })),
    });

    await expect(loadAccessProfileForUserId('user-1')).resolves.toEqual({
      isAllowed: true,
      permissions: ['assets_write'],
      role: 'campaign-manager',
      roleDefinitionId: 7,
      roleLabel: 'Campaign Manager',
    });
  });
});
