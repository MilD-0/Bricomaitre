import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  mutate: vi.fn(),
  privileged: vi.fn(),
}));

vi.mock('./action-history', () => ({ mutateEntityWithHistory: mocks.mutate }));
vi.mock('./role-config', () => ({ isConfiguredPrivilegedEmail: mocks.privileged }));

import {
  AccessGrantNotFoundError,
  deleteAdministrationAccessGrant,
  PrivilegedAccessManagedInCodeError,
} from './administration-mutations';

describe('canonical access-grant deletion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.privileged.mockReturnValue(false);
  });

  it('deletes an exact persisted grant through action history and returns its identity', async () => {
    const findFirst = vi.fn().mockResolvedValue({
      id: 4,
      email: 'staff@example.com',
      role: 'employee',
      roleDefinitionId: null,
    });
    const actor = { email: 'admin@example.com', name: 'Admin' };
    const db = { query: { userAccessGrants: { findFirst } } };

    await expect(deleteAdministrationAccessGrant(db as never, 4, actor)).resolves.toEqual({
      id: 4,
      email: 'staff@example.com',
      role: 'employee',
      roleDefinitionId: null,
    });
    expect(mocks.mutate).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        entityType: 'userAccessGrants',
        entityId: 4,
        operation: 'delete',
        actor,
      }),
    );
  });

  it('rejects missing and code-managed privileged grants before mutation', async () => {
    const db = {
      query: { userAccessGrants: { findFirst: vi.fn().mockResolvedValueOnce(null) } },
    };
    await expect(deleteAdministrationAccessGrant(db as never, 404)).rejects.toBeInstanceOf(
      AccessGrantNotFoundError,
    );

    db.query.userAccessGrants.findFirst.mockResolvedValueOnce({
      id: 1,
      email: 'owner@example.com',
      role: 'viewer',
      roleDefinitionId: null,
    });
    mocks.privileged.mockReturnValue(true);
    await expect(deleteAdministrationAccessGrant(db as never, 1)).rejects.toBeInstanceOf(
      PrivilegedAccessManagedInCodeError,
    );
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
});
