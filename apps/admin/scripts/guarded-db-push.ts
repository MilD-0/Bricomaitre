import 'dotenv/config';

import process from 'node:process';
import { spawn } from 'node:child_process';

function isLocalHostname(hostname: string) {
  const normalized = hostname.trim().toLowerCase();

  return (
    normalized === 'localhost' ||
    normalized === '127.0.0.1' ||
    normalized === '::1' ||
    normalized.endsWith('.localhost')
  );
}

function readDatabaseHostname(connectionString: string) {
  try {
    return new URL(connectionString).hostname;
  } catch {
    throw new Error('DATABASE_URL is not a valid URL.');
  }
}

async function main() {
  const connectionString = process.env.DATABASE_URL?.trim();

  if (!connectionString) {
    throw new Error('DATABASE_URL is required.');
  }

  const hostname = readDatabaseHostname(connectionString);
  const allowNonLocal = process.env.ALLOW_NONLOCAL_DB_PUSH === 'true';

  if (!allowNonLocal && !isLocalHostname(hostname)) {
    throw new Error(
      `Refusing to run db:push against non-local host "${hostname}". Use pnpm --filter @bric/admin db:verify or pnpm --filter @bric/admin db:migrate instead, or set ALLOW_NONLOCAL_DB_PUSH=true to override.`,
    );
  }

  const child = spawn('pnpm', ['exec', 'drizzle-kit', 'push'], {
    stdio: 'inherit',
    shell: true,
    env: process.env,
  });

  await new Promise<void>((resolve, reject) => {
    child.on('exit', (code) => {
      if ((code ?? 0) === 0) {
        resolve();
        return;
      }

      reject(new Error(`drizzle-kit push exited with code ${code ?? 1}`));
    });
    child.on('error', reject);
  });
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
