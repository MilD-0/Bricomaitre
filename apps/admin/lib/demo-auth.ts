import { createHmac } from 'node:crypto';

import { makeSignature } from 'better-auth/crypto';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { getDb, hasDb } from '@bric/db/client';
import { sessions, userAccessGrants, users } from '@bric/db/schema';

const DEMO_USER_ID = 'bricomaitre-demo-operator';
const DEMO_USER_EMAIL = 'operator@demo.bricomaitre.invalid';
const DEMO_SESSION_SECONDS = 60 * 60;

type DemoModeEnvironment = {
  [key: string]: string | undefined;
  BRIC_DEMO_MODE?: string;
};

export function isDemoMode(env: DemoModeEnvironment = process.env) {
  return env.BRIC_DEMO_MODE?.trim().toLowerCase() === 'true';
}

function requiredDemoValue(
  name: 'BETTER_AUTH_SECRET' | 'BETTER_AUTH_URL' | 'BRIC_DEMO_SESSION_SEED',
) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required in demo mode.`);
  return value;
}

export async function signInDemo(redirectTo: string) {
  if (!isDemoMode()) throw new Error('Demo sign-in is disabled.');
  if (!hasDb()) throw new Error('Demo sign-in requires a database.');

  const secret = requiredDemoValue('BETTER_AUTH_SECRET');
  const baseUrl = new URL(requiredDemoValue('BETTER_AUTH_URL'));
  const seed = requiredDemoValue('BRIC_DEMO_SESSION_SEED');
  const requestHeaders = await headers();
  const clientAddress =
    requestHeaders.get('x-real-ip') ??
    requestHeaders.get('cf-connecting-ip') ??
    requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'local';
  const userAgent = requestHeaders.get('user-agent') ?? 'unknown';
  const token = createHmac('sha256', seed).update(`${clientAddress}\n${userAgent}`).digest('hex');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + DEMO_SESSION_SECONDS * 1_000);
  const db = getDb();

  await db.transaction(async (tx) => {
    await tx
      .insert(userAccessGrants)
      .values({
        email: DEMO_USER_EMAIL,
        role: 'developer',
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: userAccessGrants.email,
        set: { role: 'developer', roleDefinitionId: null, updatedAt: now },
      });
    await tx
      .insert(users)
      .values({
        id: DEMO_USER_ID,
        name: 'Demo Operator',
        email: DEMO_USER_EMAIL,
        emailVerified: true,
        role: 'developer',
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: users.id,
        set: {
          name: 'Demo Operator',
          email: DEMO_USER_EMAIL,
          emailVerified: true,
          role: 'developer',
          roleDefinitionId: null,
          updatedAt: now,
        },
      });
    await tx
      .insert(sessions)
      .values({ token, userId: DEMO_USER_ID, expiresAt, createdAt: now, updatedAt: now })
      .onConflictDoUpdate({
        target: sessions.token,
        set: { expiresAt, updatedAt: now },
      });
  });

  const signature = await makeSignature(token, secret);
  const secure = baseUrl.protocol === 'https:';
  (await cookies()).set(
    `${secure ? '__Secure-' : ''}better-auth.session_token`,
    `${token}.${signature}`,
    {
      expires: expiresAt,
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      secure,
    },
  );
  redirect(redirectTo);
}
