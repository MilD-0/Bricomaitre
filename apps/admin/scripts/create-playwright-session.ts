import 'dotenv/config';

import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { eq } from 'drizzle-orm';

import { getDb, getPool, hasDb } from '@bric/db/client';
import { sessions, users } from '@bric/db/schema';
import { buildPlaywrightAuthState } from '../test/playwright-auth-state';

const userId = 'admin-playwright-browser';
const email = process.env.ADMIN_PLAYWRIGHT_EMAIL?.trim() || 'playwright@bricomaitre.invalid';

async function main() {
  if (!hasDb()) throw new Error('DATABASE_URL is required.');

  const baseUrl = process.env.BETTER_AUTH_URL?.trim();
  const secret = process.env.BETTER_AUTH_SECRET?.trim();
  const outputPath = process.env.ADMIN_PLAYWRIGHT_STORAGE_STATE?.trim();
  if (!baseUrl || !secret || !outputPath) {
    throw new Error(
      'BETTER_AUTH_URL, BETTER_AUTH_SECRET, and ADMIN_PLAYWRIGHT_STORAGE_STATE are required.',
    );
  }

  const db = getDb();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1_000);
  const sessionToken = randomBytes(24).toString('hex');

  await db.transaction(async (tx) => {
    await tx.delete(sessions).where(eq(sessions.userId, userId));
    await tx
      .insert(users)
      .values({
        id: userId,
        name: 'Playwright Admin',
        email,
        emailVerified: true,
        role: 'admin',
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: users.id,
        set: {
          name: 'Playwright Admin',
          email,
          emailVerified: true,
          role: 'admin',
          updatedAt: now,
        },
      });
    await tx.insert(sessions).values({
      token: sessionToken,
      userId,
      expiresAt,
      createdAt: now,
      updatedAt: now,
    });
  });

  const state = await buildPlaywrightAuthState({ baseUrl, secret, sessionToken, expiresAt });
  const absoluteOutputPath = resolve(outputPath);
  await mkdir(dirname(absoluteOutputPath), { recursive: true });
  await writeFile(absoluteOutputPath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  console.log(`Created Admin browser session state at ${absoluteOutputPath}.`);
}

void main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (hasDb()) await getPool().end();
  });
