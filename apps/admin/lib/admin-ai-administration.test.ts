import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  existing: null as null | { id: number },
  create: vi.fn(),
  update: vi.fn(),
  createRole: vi.fn(),
  updateRole: vi.fn(),
}));

vi.mock('@bric/db/client', () => ({
  getDb: () => ({
    query: {
      userAccessGrants: { findFirst: vi.fn(async () => mocks.existing) },
    },
  }),
}));
vi.mock('./administration-mutations', () => ({
  createAdministrationAccessGrant: mocks.create,
  updateAdministrationAccessGrant: mocks.update,
  createAdministrationRoleDefinition: mocks.createRole,
  updateAdministrationRoleDefinition: mocks.updateRole,
}));

import { setAdminAiAccessGrant, setAdminAiRoleDefinition } from './admin-ai-administration';

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
});
