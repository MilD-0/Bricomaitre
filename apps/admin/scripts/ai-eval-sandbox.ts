import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, open } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:net';
import { Pool } from 'pg';

async function freePort() {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No local port');
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return address.port;
}

function run(command: string, args: string[], env = process.env, stdout?: number) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: ['ignore', stdout ?? 'inherit', 'inherit'] });
    child.once('error', reject);
    child.once('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`)),
    );
  });
}

async function main() {
  const source = new URL(process.env.DATABASE_URL ?? '');
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(source.hostname)) {
    throw new Error('The matrix only clones a loopback database.');
  }
  const database = `bric_ai_eval_${randomUUID().replaceAll('-', '')}`;
  const directory = await mkdtemp(join(tmpdir(), 'bric-ai-write-matrix-'));
  const redisName = database.replaceAll('_', '-');
  const redisPort = await freePort();
  const providerPort = await freePort();
  const control = new Pool({ connectionString: source.toString() });
  let created = false;
  let redisStarted = false;
  let provider: ReturnType<typeof spawn> | undefined;
  const providerLog = await open(join(directory, 'providers.log'), 'a', 0o600);
  const pgEnv = {
    ...process.env,
    PGHOST: source.hostname,
    PGPORT: source.port || '5432',
    PGUSER: decodeURIComponent(source.username),
    PGPASSWORD: decodeURIComponent(source.password),
    PGDATABASE: decodeURIComponent(source.pathname.slice(1)),
  };
  try {
    console.log(JSON.stringify({ directory, database, phase: 'copying-local-database' }));
    const major = Math.floor(
      Number((await control.query('show server_version_num')).rows[0].server_version_num) / 10000,
    );
    const pgContainer = [
      'run',
      '--rm',
      '--network',
      'host',
      '-v',
      `${directory}:/matrix`,
      ...['PGHOST', 'PGPORT', 'PGUSER', 'PGPASSWORD', 'PGDATABASE'].flatMap((key) => ['-e', key]),
      `postgres:${major}-bookworm`,
    ];
    if (process.env.ADMIN_AI_EVAL_SOURCE === 'demo') {
      const dump = await open(join(directory, 'source.dump'), 'w', 0o600);
      try {
        await run(
          'docker',
          [
            'exec',
            'bricomaitre-demo-postgres-1',
            'pg_dump',
            '-U',
            'bricomaitre_demo_owner',
            '-d',
            'bricomaitre_demo',
            '-Fc',
            '--no-owner',
            '--no-acl',
          ],
          process.env,
          dump.fd,
        );
      } finally {
        await dump.close();
      }
    } else {
      await run(
        'docker',
        [...pgContainer, 'pg_dump', '-Fc', '--no-owner', '--no-acl', '-f', '/matrix/source.dump'],
        pgEnv,
      );
    }
    await control.query(`CREATE DATABASE "${database}"`);
    created = true;
    await run(
      'docker',
      [
        ...pgContainer,
        'pg_restore',
        '--no-owner',
        '--no-acl',
        '--exit-on-error',
        '-d',
        database,
        '/matrix/source.dump',
      ],
      pgEnv,
    );
    await run('docker', [
      'run',
      '-d',
      '--rm',
      '--name',
      redisName,
      '-p',
      `127.0.0.1:${redisPort}:6379`,
      'redis:7-alpine',
    ]);
    redisStarted = true;
    provider = spawn(process.execPath, [resolve('../../ops/demo/mock-services.mjs')], {
      env: { ...process.env, PORT: String(providerPort) },
      stdio: ['ignore', providerLog.fd, providerLog.fd],
    });
    const base = `http://127.0.0.1:${providerPort}`;
    for (let attempt = 0; ; attempt++) {
      if (
        await fetch(`${base}/health`)
          .then((r) => r.ok)
          .catch(() => false)
      )
        break;
      if (attempt > 50) throw new Error('Local provider simulator did not start');
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const target = new URL(source);
    target.pathname = `/${database}`;
    // Never inherit carrier, storage, telemetry, or notification credentials.
    const env: NodeJS.ProcessEnv = { ...process.env };
    for (const key of Object.keys(env)) {
      if (
        /^(ECOTRACK|META_|GOOGLE_|SEARCH_CONSOLE|AWS_|SENTRY_|SMTP_|REDIS_|STOREFRONT_|NEXT_PUBLIC_)/.test(
          key,
        )
      )
        delete env[key];
    }
    Object.assign(env, {
      DATABASE_URL: target.toString(),
      REDIS_URL: `redis://127.0.0.1:${redisPort}`,
      DOTENV_CONFIG_PATH: '/dev/null',
      ADMIN_AI_EVAL_HARNESS: '1',
      ADMIN_AI_EVAL_DIRECTORY: directory,
      ADMIN_AI_EVAL_SUITE: process.argv[2] ?? 'all',
      ADMIN_AI_EVAL_SCENARIO: process.argv[3] ?? '',
      ADMIN_AI_EVAL_PROVIDER_ORIGIN: base,
      ECOTRACK_BASE_URL: `${base}/ecotrack/delivro/api/v1`,
      ECOTRACK_TOKEN: 'local-eval',
      ECOTRACK_EMIR_BASE_URL: `${base}/ecotrack/emir/api/v1`,
      ECOTRACK_EMIR_TOKEN: 'local-eval',
      META_ADS_GRAPH_API_ORIGIN: base,
      META_ADS_ACCESS_TOKEN: 'local-eval',
      META_AD_ACCOUNT_ID: '123456789',
      SEARCH_CONSOLE_ANALYTICS_ENDPOINT: `${base}/google/webmasters/v3/sites`,
      SEARCH_CONSOLE_INSPECTION_ENDPOINT: `${base}/google/v1/urlInspection/index:inspect`,
      GOOGLE_SEARCH_CONSOLE_CREDENTIALS_JSON: JSON.stringify({
        client_email: 'eval@example.invalid',
        private_key: 'local-eval',
      }),
      SEARCH_CONSOLE_SITE_ORIGIN: 'https://www.bricomaitre.com',
      SEARCH_CONSOLE_SITE_URL: 'sc-domain:bricomaitre.com',
      AWS_REGION: 'us-east-1',
      AWS_S3_BUCKET: 'local-eval',
      AWS_CLOUDFRONT_DOMAIN: '127.0.0.1',
      AWS_ACCESS_KEY_ID: 'local-eval',
      AWS_SECRET_ACCESS_KEY: 'local-eval',
      AWS_EC2_METADATA_DISABLED: 'true',
      AWS_ENDPOINT_URL_S3: base,
      STOREFRONT_REVALIDATE_URL: `${base}/revalidate`,
      NEXT_PUBLIC_STOREFRONT_BASE_URL:
        env.ADMIN_AI_EVAL_SOURCE === 'demo' ? 'http://127.0.0.1:3402' : 'https://bricomaitre.com',
    });
    await writeFile(
      join(directory, 'run.json'),
      JSON.stringify({
        database,
        redisPort,
        providerPort,
        suite: env.ADMIN_AI_EVAL_SUITE,
        source: env.ADMIN_AI_EVAL_SOURCE ?? 'project',
        highEffortScenarios: env.ADMIN_AI_EVAL_HIGH_SCENARIOS ?? '',
      }),
      { mode: 0o600 },
    );
    console.log(
      JSON.stringify({
        directory,
        phase: 'running-real-writes',
        externalServices: 'local-simulators',
      }),
    );
    await run(
      'pnpm',
      ['exec', 'vitest', 'run', '--config', 'scripts/ai-eval-matrix.config.ts'],
      env,
    );
  } finally {
    provider?.kill('SIGTERM');
    await providerLog.close();
    if (redisStarted) await run('docker', ['stop', redisName]);
    if (created) await control.query(`DROP DATABASE "${database}" WITH (FORCE)`);
    await control.end();
    console.log(
      JSON.stringify({ directory, phase: 'isolated-resources-removed', evidencePreserved: true }),
    );
  }
}

void main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
