import { eq } from 'drizzle-orm';

import type { getDb } from '@bric/db/client';
import { roleDefinitionPermissions, roleDefinitions, userAccessGrants } from '@bric/db/schema';

import { mutateEntityWithHistory, type ActionActor } from './action-history';
import {
  roleDefinitionFormSchema,
  userAccessGrantFormSchema,
  type RoleDefinitionFormValues,
  type UserAccessGrantFormValues,
} from './permissions';
import { isConfiguredPrivilegedEmail } from './role-config';

type Database = ReturnType<typeof getDb>;

export class AccessGrantAlreadyExistsError extends Error {
  constructor(readonly email: string) {
    super(`Access grant for ${email} already exists.`);
    this.name = 'AccessGrantAlreadyExistsError';
  }
}

export class AccessGrantNotFoundError extends Error {
  constructor(readonly grantId: number) {
    super(`Access grant ${grantId} was not found.`);
    this.name = 'AccessGrantNotFoundError';
  }
}

export class PrivilegedAccessManagedInCodeError extends Error {
  constructor(readonly email: string) {
    super(`Privileged bootstrap access for ${email} is managed in code.`);
    this.name = 'PrivilegedAccessManagedInCodeError';
  }
}

export class AdministrationRoleAlreadyExistsError extends Error {
  constructor(readonly slug: string) {
    super(`Role ${slug} already exists.`);
    this.name = 'AdministrationRoleAlreadyExistsError';
  }
}

export class AdministrationRoleNotFoundError extends Error {
  constructor(readonly roleId: number) {
    super(`Role ${roleId} was not found.`);
    this.name = 'AdministrationRoleNotFoundError';
  }
}

export function slugifyAdministrationRoleName(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizedRoleValues(input: unknown): RoleDefinitionFormValues & { slug: string } {
  const values = roleDefinitionFormSchema.parse(input);
  return {
    ...values,
    name: values.name.trim(),
    description: values.description?.trim() || null,
    slug: slugifyAdministrationRoleName(values.name),
  };
}

export async function createAdministrationRoleDefinition(
  db: Database,
  input: unknown,
  actor?: ActionActor,
) {
  const values = normalizedRoleValues(input);
  const existing = await db.query.roleDefinitions.findFirst({
    where: eq(roleDefinitions.slug, values.slug),
  });
  if (existing) throw new AdministrationRoleAlreadyExistsError(values.slug);

  const rows = await mutateEntityWithHistory(db, {
    entityType: 'roleDefinitions',
    operation: 'create',
    actor,
    execute: async (tx) => {
      const inserted = await tx
        .insert(roleDefinitions)
        .values({ name: values.name, slug: values.slug, description: values.description })
        .returning({ id: roleDefinitions.id });
      const roleId = inserted[0]?.id;
      if (!roleId) throw new Error('Role creation failed.');
      await tx
        .insert(roleDefinitionPermissions)
        .values(values.permissions.map((permission) => ({ roleId, permission })));
      return inserted;
    },
    resolveEntityId: (inserted) => inserted[0]?.id,
  });
  return { id: rows[0]?.id ?? null, ...values };
}

export async function updateAdministrationRoleDefinition(
  db: Database,
  roleId: number,
  input: unknown,
  actor?: ActionActor,
) {
  const values = normalizedRoleValues(input);
  const existing = await db.query.roleDefinitions.findFirst({
    where: eq(roleDefinitions.id, roleId),
  });
  if (!existing) throw new AdministrationRoleNotFoundError(roleId);

  await mutateEntityWithHistory(db, {
    entityType: 'roleDefinitions',
    entityId: roleId,
    operation: 'update',
    actor,
    execute: async (tx) => {
      await tx
        .update(roleDefinitions)
        .set({
          name: values.name,
          slug: values.slug,
          description: values.description,
          updatedAt: new Date(),
        })
        .where(eq(roleDefinitions.id, roleId));
      await tx
        .delete(roleDefinitionPermissions)
        .where(eq(roleDefinitionPermissions.roleId, roleId));
      await tx
        .insert(roleDefinitionPermissions)
        .values(values.permissions.map((permission) => ({ roleId, permission })));
    },
  });
  return { id: roleId, ...values };
}

function normalizedValues(input: unknown): UserAccessGrantFormValues {
  const values = userAccessGrantFormSchema.parse(input);
  const email = values.email.trim().toLowerCase();
  if (isConfiguredPrivilegedEmail(email)) throw new PrivilegedAccessManagedInCodeError(email);
  return { ...values, email };
}

export async function createAdministrationAccessGrant(
  db: Database,
  input: unknown,
  actor?: ActionActor,
) {
  const values = normalizedValues(input);
  const existing = await db.query.userAccessGrants.findFirst({
    where: eq(userAccessGrants.email, values.email),
  });
  if (existing) throw new AccessGrantAlreadyExistsError(values.email);

  const rows = await mutateEntityWithHistory(db, {
    entityType: 'userAccessGrants',
    operation: 'create',
    actor,
    execute: (tx) =>
      tx
        .insert(userAccessGrants)
        .values({
          email: values.email,
          role: values.role ?? 'viewer',
          roleDefinitionId: values.roleDefinitionId ?? null,
        })
        .returning({ id: userAccessGrants.id }),
    resolveEntityId: (inserted) => inserted[0]?.id,
  });
  return { id: rows[0]?.id ?? null, email: values.email };
}

export async function updateAdministrationAccessGrant(
  db: Database,
  grantId: number,
  input: unknown,
  actor?: ActionActor,
) {
  const values = normalizedValues(input);
  const existing = await db.query.userAccessGrants.findFirst({
    where: eq(userAccessGrants.id, grantId),
  });
  if (!existing) throw new AccessGrantNotFoundError(grantId);

  await mutateEntityWithHistory(db, {
    entityType: 'userAccessGrants',
    entityId: grantId,
    operation: 'update',
    actor,
    execute: (tx) =>
      tx
        .update(userAccessGrants)
        .set({
          email: values.email,
          role: values.role ?? 'viewer',
          roleDefinitionId: values.roleDefinitionId ?? null,
          updatedAt: new Date(),
        })
        .where(eq(userAccessGrants.id, grantId)),
  });
  return { id: grantId, email: values.email };
}

export async function deleteAdministrationAccessGrant(
  db: Database,
  grantId: number,
  actor?: ActionActor,
) {
  const existing = await db.query.userAccessGrants.findFirst({
    where: eq(userAccessGrants.id, grantId),
  });
  if (!existing) throw new AccessGrantNotFoundError(grantId);
  if (isConfiguredPrivilegedEmail(existing.email)) {
    throw new PrivilegedAccessManagedInCodeError(existing.email);
  }

  await mutateEntityWithHistory(db, {
    entityType: 'userAccessGrants',
    entityId: grantId,
    operation: 'delete',
    actor,
    execute: (tx) => tx.delete(userAccessGrants).where(eq(userAccessGrants.id, grantId)),
  });
  return {
    id: grantId,
    email: existing.email,
    role: existing.role,
    roleDefinitionId: existing.roleDefinitionId,
  };
}
