import { randomUUID } from 'node:crypto';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { createDb } from '@bric/db/client';
import { accounts, sessions, users, verificationTokens } from '@bric/db/schema';
import { betterAuth } from 'better-auth/minimal';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, expect, it } from 'vitest';

const db = createDb({ max: 2 });
const userIds: string[] = [];
const auth = betterAuth({
  baseURL: 'http://localhost:3000',
  secret: 'account-contract-secret-at-least-thirty-two-characters',
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: { account: accounts, session: sessions, user: users, verification: verificationTokens },
  }),
});

afterAll(async () => {
  if (userIds.length) await db.delete(users).where(inArray(users.id, userIds));
  await db.$client.end();
});

it('creates and links provider accounts without an issuer while preserving provider uniqueness', async () => {
  const { internalAdapter } = await auth.$context;
  const accountId = randomUUID();
  const created = await internalAdapter.createOAuthUser(
    { name: 'Account contract', email: `${accountId}@example.invalid`, emailVerified: true },
    { providerId: 'google', accountId },
  );
  userIds.push(created.user.id);
  expect(created.account).toMatchObject({ providerId: 'google', accountId });
  const [stored] = await db.select().from(accounts).where(eq(accounts.userId, created.user.id));
  expect(stored?.issuer).toBeNull();

  await internalAdapter.createAccount({ userId: created.user.id, providerId: 'github', accountId });
  expect(await internalAdapter.findAccounts(created.user.id)).toHaveLength(2);
  await expect(
    internalAdapter.createAccount({ userId: created.user.id, providerId: 'google', accountId }),
  ).rejects.toThrow();
});

it('reads existing issuer-bearing accounts and creates a usable session after migration', async () => {
  const id = randomUUID();
  userIds.push(id);
  await db.insert(users).values({ id, name: 'Existing account', email: `${id}@example.invalid` });
  await db.insert(accounts).values({
    userId: id,
    issuer: 'https://accounts.google.com',
    providerId: 'google',
    accountId: id,
  });
  const { internalAdapter } = await auth.$context;
  expect(
    await internalAdapter.findAccountByKey({ providerId: 'google', accountId: id }),
  ).toMatchObject({
    userId: id,
  });
  const session = await internalAdapter.createSession(id);
  expect(await internalAdapter.findSession(session.token)).toMatchObject({ user: { id } });
});
