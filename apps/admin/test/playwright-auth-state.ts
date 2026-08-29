import { makeSignature } from 'better-auth/crypto';

export async function buildPlaywrightAuthState(input: {
  baseUrl: string;
  secret: string;
  sessionToken: string;
  expiresAt: Date;
}) {
  const url = new URL(input.baseUrl);
  const signature = await makeSignature(input.sessionToken, input.secret);

  return {
    cookies: [
      {
        name: `${url.protocol === 'https:' ? '__Secure-' : ''}better-auth.session_token`,
        value: `${input.sessionToken}.${signature}`,
        domain: url.hostname,
        path: '/',
        expires: Math.floor(input.expiresAt.getTime() / 1_000),
        httpOnly: true,
        secure: url.protocol === 'https:',
        sameSite: 'Lax' as const,
      },
    ],
    origins: [],
  };
}
