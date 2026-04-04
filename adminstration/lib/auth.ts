import { DrizzleAdapter } from '@auth/drizzle-adapter';
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';

import { getDb, hasDb } from '../db/client';
import { buildAccessProfile, isEmailAllowed, loadAccessProfileForUserId } from './access';

const getRequiredEnv = (key: 'GOOGLE_CLIENT_ID' | 'GOOGLE_CLIENT_SECRET') => {
  const value = process.env[key]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
};

const isTruthyEnv = (value: string | undefined) => {
  if (!value) {
    return false;
  }

  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
};

const isTrustedHostUrl = (url: string | undefined) => {
  if (!url) {
    return false;
  }

  try {
    const hostname = new URL(url).hostname.toLowerCase();

    return (
      hostname === 'localhost'
      || hostname === '127.0.0.1'
      || hostname === '::1'
      || hostname.endsWith('.localhost')
    );
  } catch {
    return false;
  }
};

const shouldTrustHost = () =>
  isTruthyEnv(process.env.AUTH_TRUST_HOST)
  || isTruthyEnv(process.env.NEXTAUTH_TRUST_HOST)
  || isTrustedHostUrl(process.env.AUTH_URL)
  || isTrustedHostUrl(process.env.NEXTAUTH_URL);

const googleClientId = getRequiredEnv('GOOGLE_CLIENT_ID');
const googleClientSecret = getRequiredEnv('GOOGLE_CLIENT_SECRET');

import {
  users,
  accounts,
  sessions,
  verificationTokens,
} from "../db/schema";

const adapter = hasDb()
  ? (DrizzleAdapter(getDb(), {
      usersTable: users,
      accountsTable: accounts,
      sessionsTable: sessions,
      verificationTokensTable: verificationTokens,
    }) as ReturnType<typeof DrizzleAdapter>)
  : undefined;
export const { auth, handlers, signIn, signOut } = NextAuth({
  adapter,
  trustHost: shouldTrustHost(),
  session: {
    strategy: 'jwt',
  },
  callbacks: {
    async signIn({ user }) {
      return isEmailAllowed(typeof user.email === 'string' ? user.email : null);
    },
    async jwt({ token, user }) {
      const authEmail = user?.email ?? token.email;

      if (token.sub && hasDb()) {
        const access = await loadAccessProfileForUserId(token.sub, {
          email: typeof authEmail === 'string' ? authEmail : null,
          permissions: token.permissions,
          role: user?.role ?? token.role,
          roleLabel: typeof token.roleLabel === 'string' ? token.roleLabel : null,
        });

        token.permissions = access.permissions;
        token.role = access.role;
        token.isAllowed = access.isAllowed;
        token.roleDefinitionId = access.roleDefinitionId ?? undefined;
        token.roleLabel = access.roleLabel ?? undefined;
        return token;
      }

      const access = await buildAccessProfile({
        email: typeof authEmail === 'string' ? authEmail : null,
        permissions: token.permissions,
        role: user?.role ?? token.role,
        roleLabel: typeof token.roleLabel === 'string' ? token.roleLabel : null,
      });

      token.permissions = access.permissions;
      token.role = access.role;
      token.isAllowed = access.isAllowed;
      token.roleDefinitionId = access.roleDefinitionId ?? undefined;
      token.roleLabel = access.roleLabel ?? undefined;
      return token;
    },
    async session({ session, token }) {
      const access = await buildAccessProfile({
        email:
          typeof session.user?.email === 'string'
            ? session.user.email
            : typeof token.email === 'string'
              ? token.email
              : null,
        permissions: token.permissions,
        role: token.role,
        roleDefinitionId:
          typeof token.roleDefinitionId === 'number' ? token.roleDefinitionId : null,
        roleLabel: typeof token.roleLabel === 'string' ? token.roleLabel : null,
      });

      session.user = {
        ...session.user,
        isAllowed: access.isAllowed,
        permissions: access.permissions,
        role: access.role,
        roleDefinitionId: access.roleDefinitionId ?? undefined,
        roleLabel: access.roleLabel ?? undefined,
      };

      return session;
    },
  },
  providers: [
    Google({
      clientId: googleClientId,
      clientSecret: googleClientSecret,
    }),
    Credentials({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize() {
        return null;
      },
    }),
  ],
});
