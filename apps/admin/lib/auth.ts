import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { APIError } from 'better-auth/api';
import { betterAuth } from 'better-auth/minimal';
import { nextCookies } from 'better-auth/next-js';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { getDb, hasDb } from '@bric/db/client';
import { accounts, sessions, users, verificationTokens } from '@bric/db/schema';
import { isEmailAllowed, loadAccessProfileForUserId } from './access';
import type { PermissionKey, Role } from './permissions';

const getRequiredEnv = (
  key: 'BETTER_AUTH_SECRET' | 'BETTER_AUTH_URL' | 'GOOGLE_CLIENT_ID' | 'GOOGLE_CLIENT_SECRET',
) => {
  const value = process.env[key]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
};

const googleClientId = getRequiredEnv('GOOGLE_CLIENT_ID');
const googleClientSecret = getRequiredEnv('GOOGLE_CLIENT_SECRET');
const secret = getRequiredEnv('BETTER_AUTH_SECRET');
const baseURL = getRequiredEnv('BETTER_AUTH_URL');

const database = hasDb()
  ? drizzleAdapter(getDb(), {
      provider: 'pg',
      schema: {
        account: accounts,
        session: sessions,
        user: users,
        verification: verificationTokens,
      },
    })
  : undefined;

export const authServer = betterAuth({
  appName: 'Bricomaitre Administration',
  baseURL,
  database,
  secret,
  account: {
    modelName: 'account',
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          if (!(await isEmailAllowed(user.email))) {
            throw new APIError('FORBIDDEN', { message: 'This account is not authorized.' });
          }
        },
      },
    },
    session: {
      create: {
        before: async (session) => {
          const access = await loadAccessProfileForUserId(session.userId);

          if (!access.isAllowed) {
            throw new APIError('FORBIDDEN', { message: 'This account is not authorized.' });
          }
        },
      },
    },
  },
  session: {
    modelName: 'session',
  },
  socialProviders: {
    google: {
      clientId: googleClientId,
      clientSecret: googleClientSecret,
    },
  },
  user: {
    modelName: 'user',
    additionalFields: {
      role: {
        type: ['viewer', 'employee', 'admin', 'developer'],
        defaultValue: 'viewer',
        input: false,
        required: true,
      },
      roleDefinitionId: {
        type: 'number',
        input: false,
        required: false,
      },
    },
  },
  verification: {
    modelName: 'verification',
  },
  plugins: [nextCookies()],
});

type BetterAuthSession = typeof authServer.$Infer.Session;

export type AdminSession = Omit<BetterAuthSession, 'user'> & {
  user: Omit<BetterAuthSession['user'], 'role' | 'roleDefinitionId'> & {
    isAllowed: boolean;
    permissions: PermissionKey[];
    role: Role;
    roleDefinitionId?: number;
    roleLabel?: string;
  };
};

export async function auth(): Promise<AdminSession | null> {
  if (!hasDb()) {
    return null;
  }

  const session = await authServer.api.getSession({ headers: await headers() });

  if (!session) {
    return null;
  }

  const access = await loadAccessProfileForUserId(session.user.id, {
    email: session.user.email,
    role: session.user.role as Role,
  });

  return {
    ...session,
    user: {
      ...session.user,
      isAllowed: access.isAllowed,
      permissions: access.permissions,
      role: access.role,
      roleDefinitionId: access.roleDefinitionId ?? undefined,
      roleLabel: access.roleLabel ?? undefined,
    },
  };
}

export async function signIn(provider: 'google', options: { redirectTo: string }) {
  const result = await authServer.api.signInSocial({
    body: {
      callbackURL: options.redirectTo,
      provider,
    },
  });

  if (result.url) {
    redirect(result.url);
  }
}
