import { describe, expect, it } from 'vitest';

import { buildPlaywrightAuthState } from './playwright-auth-state';

describe('Admin Playwright authentication state', () => {
  it('matches Better Auth cookie naming and browser attributes', async () => {
    const state = await buildPlaywrightAuthState({
      baseUrl: 'http://localhost:3000',
      secret: 'test-secret-with-sufficient-entropy',
      sessionToken: 'session-token',
      expiresAt: new Date('2026-09-01T00:00:00.000Z'),
    });

    expect(state).toMatchObject({
      cookies: [
        {
          name: 'better-auth.session_token',
          value: expect.stringMatching(/^session-token[.][A-Za-z0-9+/]+=*$/),
          domain: 'localhost',
          path: '/',
          expires: 1_788_220_800,
          httpOnly: true,
          secure: false,
          sameSite: 'Lax',
        },
      ],
      origins: [],
    });
  });

  it('uses Better Auth secure-cookie naming for HTTPS', async () => {
    const state = await buildPlaywrightAuthState({
      baseUrl: 'https://admin.example.com',
      secret: 'test-secret-with-sufficient-entropy',
      sessionToken: 'session-token',
      expiresAt: new Date('2026-09-01T00:00:00.000Z'),
    });

    expect(state.cookies[0]).toMatchObject({
      name: '__Secure-better-auth.session_token',
      domain: 'admin.example.com',
      secure: true,
    });
  });
});
