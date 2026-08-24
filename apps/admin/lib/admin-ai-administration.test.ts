import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  existing: null as null | { id: number },
  create: vi.fn(),
  update: vi.fn(),
  createRole: vi.fn(),
  updateRole: vi.fn(),
  deleteAccess: vi.fn(),
}));

vi.mock('@bric/db/client', () => ({
  getDb: () => ({
    query: {
      userAccessGrants: { findFirst: vi.fn(async () => mocks.existing) },
    },
  }),
}));
vi.mock('./administration-mutations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./administration-mutations')>()),
  createAdministrationAccessGrant: mocks.create,
  updateAdministrationAccessGrant: mocks.update,
  createAdministrationRoleDefinition: mocks.createRole,
  updateAdministrationRoleDefinition: mocks.updateRole,
  deleteAdministrationAccessGrant: mocks.deleteAccess,
}));

import {
  revokeAdminAiAccessGrants,
  setAdminAiAccessGrant,
  setAdminAiRoleDefinition,
} from './admin-ai-administration';
import { AccessGrantNotFoundError } from './administration-mutations';

const actor = { email: 'admin@example.com', name: 'Admin' };

describe('admin AI access grants', () => {
  beforeEach(() => {
    mocks.existing = null;
    vi.clearAllMocks();
  });

  it('creates a canonical built-in access grant for a new normalized email', async () => {
    mocks.create.mockResolvedValue({ id: 12, email: 'operator@example.com' });
    await expect(
      setAdminAiAccessGrant({ email: ' Operator@Example.com ', role: 'employee' }, actor),
    ).resolves.toEqual({
      ok: true,
      action: 'created',
      id: 12,
      email: 'operator@example.com',
      role: 'employee',
      roleDefinitionId: null,
    });
    expect(mocks.create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ email: 'operator@example.com', role: 'employee' }),
      actor,
    );
  });

  it('updates the existing grant when assigning an inspected custom role', async () => {
    mocks.existing = { id: 7 };
    mocks.update.mockResolvedValue({ id: 7, email: 'operator@example.com' });
    await expect(
      setAdminAiAccessGrant(
        { email: 'operator@example.com', role: null, roleDefinitionId: 4 },
        actor,
      ),
    ).resolves.toEqual({
      ok: true,
      action: 'updated',
      id: 7,
      email: 'operator@example.com',
      role: null,
      roleDefinitionId: 4,
    });
    expect(mocks.update).toHaveBeenCalledWith(
      expect.anything(),
      7,
      { email: 'operator@example.com', role: null, roleDefinitionId: 4 },
      actor,
    );
  });

  it('creates and updates complete custom role definitions through canonical mutations', async () => {
    mocks.createRole.mockResolvedValue({
      id: 14,
      name: 'Support',
      slug: 'support',
      description: 'Customer support',
      permissions: ['orders_write'],
    });
    await expect(
      setAdminAiRoleDefinition(
        {
          roleDefinitionId: null,
          name: 'Support',
          description: 'Customer support',
          permissions: ['orders_write'],
        },
        actor,
      ),
    ).resolves.toMatchObject({ ok: true, action: 'created', id: 14, slug: 'support' });
    expect(mocks.createRole).toHaveBeenCalledWith(
      expect.anything(),
      {
        name: 'Support',
        description: 'Customer support',
        permissions: ['orders_write'],
      },
      actor,
    );

    mocks.updateRole.mockResolvedValue({
      id: 14,
      name: 'Support Lead',
      slug: 'support-lead',
      description: null,
      permissions: ['orders_write', 'ops_view'],
    });
    await expect(
      setAdminAiRoleDefinition(
        {
          roleDefinitionId: 14,
          name: 'Support Lead',
          description: null,
          permissions: ['orders_write', 'ops_view'],
        },
        actor,
      ),
    ).resolves.toMatchObject({ ok: true, action: 'updated', id: 14, slug: 'support-lead' });
    expect(mocks.updateRole).toHaveBeenCalledWith(
      expect.anything(),
      14,
      {
        name: 'Support Lead',
        description: null,
        permissions: ['orders_write', 'ops_view'],
      },
      actor,
    );
  });

  it('revokes exact grants with canonical partial-result evidence', async () => {
    mocks.deleteAccess
      .mockResolvedValueOnce({
        id: 7,
        email: 'operator@example.com',
        role: 'employee',
        roleDefinitionId: null,
      })
      .mockRejectedValueOnce(new AccessGrantNotFoundError(99));

    await expect(
      revokeAdminAiAccessGrants({ accessGrantIds: [7, 99] }, actor),
    ).resolves.toMatchObject({
      ok: false,
      requestedCount: 2,
      revokedCount: 1,
      failedCount: 1,
      revoked: [{ id: 7, email: 'operator@example.com' }],
      failed: [{ accessGrantId: 99, code: 'AccessGrantNotFoundError' }],
    });
    expect(mocks.deleteAccess).toHaveBeenCalledWith(expect.anything(), 7, actor);
  });
});
