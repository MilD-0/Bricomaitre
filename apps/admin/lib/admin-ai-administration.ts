import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { getDb } from '@bric/db/client';
import { userAccessGrants } from '@bric/db/schema';

import {
  createAdministrationRoleDefinition,
  createAdministrationAccessGrant,
  deleteAdministrationAccessGrant,
  updateAdministrationRoleDefinition,
  updateAdministrationAccessGrant,
} from './administration-mutations';
import type { ActionActor } from './action-history';
import { roleDefinitionFormSchema, userAccessGrantFormSchema } from './permissions';

export const adminAiAccessGrantSchema = userAccessGrantFormSchema;
export const adminAiRoleDefinitionSchema = roleDefinitionFormSchema.extend({
  roleDefinitionId: z.number().int().positive().nullable().default(null),
});
export const adminAiAccessRevocationSchema = z
  .object({ accessGrantIds: z.array(z.number().int().positive()).min(1).max(20) })
  .strict();

export async function setAdminAiAccessGrant(input: unknown, actor?: ActionActor) {
  const values = adminAiAccessGrantSchema.parse(input);
  const email = values.email.trim().toLowerCase();
  const db = getDb();
  const existing = await db.query.userAccessGrants.findFirst({
    where: eq(userAccessGrants.email, email),
  });
  const normalized = { ...values, email };
  const persisted = existing
    ? await updateAdministrationAccessGrant(db, existing.id, normalized, actor)
    : await createAdministrationAccessGrant(db, normalized, actor);
  return {
    ok: true,
    action: existing ? ('updated' as const) : ('created' as const),
    ...persisted,
    role: values.role ?? null,
    roleDefinitionId: values.roleDefinitionId ?? null,
  };
}

export async function setAdminAiRoleDefinition(input: unknown, actor?: ActionActor) {
  const { roleDefinitionId, ...values } = adminAiRoleDefinitionSchema.parse(input);
  const db = getDb();
  const persisted = roleDefinitionId
    ? await updateAdministrationRoleDefinition(db, roleDefinitionId, values, actor)
    : await createAdministrationRoleDefinition(db, values, actor);
  return {
    ok: true,
    action: roleDefinitionId ? ('updated' as const) : ('created' as const),
    ...persisted,
  };
}

export async function revokeAdminAiAccessGrants(input: unknown, actor?: ActionActor) {
  const values = adminAiAccessRevocationSchema.parse(input);
  const revoked = [];
  const failed = [];
  const db = getDb();
  for (const accessGrantId of [...new Set(values.accessGrantIds)]) {
    try {
      revoked.push(await deleteAdministrationAccessGrant(db, accessGrantId, actor));
    } catch (error) {
      failed.push({
        accessGrantId,
        code: error instanceof Error ? error.name : 'AccessGrantRevocationError',
        message: error instanceof Error ? error.message : 'Unable to revoke access.',
      });
    }
  }
  return {
    ok: failed.length === 0,
    requestedCount: values.accessGrantIds.length,
    revokedCount: revoked.length,
    failedCount: failed.length,
    revoked,
    failed,
  };
}
