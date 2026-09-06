import * as Sentry from '@sentry/node';
import IORedis, { type RedisOptions } from 'ioredis';

type RedisConnectionOptions = RedisOptions & {
  host: string;
  port: number;
  username?: string;
  password?: string;
  db?: number;
};

type RedisEnvironment = Readonly<Record<string, string | undefined>>;

const runtimeGlobal = globalThis as typeof globalThis & {
  __bricRedisClients?: Map<string, IORedis>;
};

const REQUEST_REDIS_COMMAND_TIMEOUT_MS = 5_000;
const REQUEST_REDIS_CONNECT_TIMEOUT_MS = 5_000;

function getGlobalClients() {
  if (!runtimeGlobal.__bricRedisClients) {
    runtimeGlobal.__bricRedisClients = new Map<string, IORedis>();
  }

  return runtimeGlobal.__bricRedisClients;
}

function readBoolean(value: string | undefined, fallback = false) {
  if (!value) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function readNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function getRedisConnectionOptions(
  env: RedisEnvironment = process.env,
): RedisConnectionOptions {
  const url = env.REDIS_URL?.trim();

  if (url) {
    const parsed = new URL(url);
    return {
      host: parsed.hostname,
      port: Number(parsed.port || 6379),
      username: decodeURIComponent(parsed.username) || undefined,
      password: env.REDIS_PASSWORD?.trim() || decodeURIComponent(parsed.password) || undefined,
      db: parsed.pathname && parsed.pathname !== '/' ? Number(parsed.pathname.slice(1)) : undefined,
      tls: parsed.protocol === 'rediss:' ? {} : undefined,
      protocol: 2,
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      lazyConnect: true,
    };
  }

  const host = env.REDIS_HOST?.trim();
  if (!host) {
    throw new Error('REDIS_HOST or REDIS_URL must be configured.');
  }

  return {
    host,
    port: readNumber(env.REDIS_PORT, 6379),
    username: env.REDIS_USERNAME?.trim() || undefined,
    password: env.REDIS_PASSWORD?.trim() || undefined,
    db: env.REDIS_DB ? readNumber(env.REDIS_DB, 0) : undefined,
    tls: readBoolean(env.REDIS_TLS_ENABLED) ? {} : undefined,
    protocol: 2,
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    lazyConnect: true,
  };
}

export function getRequestRedisConnectionOptions(
  env: RedisEnvironment = process.env,
): RedisConnectionOptions {
  return {
    ...getRedisConnectionOptions(env),
    commandTimeout: REQUEST_REDIS_COMMAND_TIMEOUT_MS,
    connectTimeout: REQUEST_REDIS_CONNECT_TIMEOUT_MS,
    maxRetriesPerRequest: 1,
  };
}

function buildClient(cacheKey: string, overrides: RedisOptions = {}) {
  const clients = getGlobalClients();
  const existing = clients.get(cacheKey);
  if (existing) {
    return existing;
  }

  const client = new IORedis({
    ...getRedisConnectionOptions(),
    ...overrides,
  });

  client.on('error', (error) => {
    const tlsHint =
      error instanceof Error && error.message.includes('ERR_SSL_PACKET_LENGTH_TOO_LONG')
        ? ' Redis TLS handshake failed. Verify that REDIS_URL/REDIS_HOST points to a TLS-enabled endpoint and that REDIS_TLS_ENABLED or the rediss:// scheme matches the server.'
        : '';
    Sentry.withScope((scope: Sentry.Scope) => {
      scope.setTag('service', 'runtime');
      scope.setTag('runtime_component', 'redis');
      scope.setTag('redis_client', cacheKey);
      Sentry.captureException(error);
    });
    console.error(`[redis:${cacheKey}]${tlsHint}`, error);
  });

  clients.set(cacheKey, client);
  return client;
}

export function getRedis() {
  return buildClient('default', {
    commandTimeout: REQUEST_REDIS_COMMAND_TIMEOUT_MS,
    connectTimeout: REQUEST_REDIS_CONNECT_TIMEOUT_MS,
    maxRetriesPerRequest: 1,
  });
}

export function getBullRedisConnection(name: string) {
  return buildClient(`bull:${name}`, {
    maxRetriesPerRequest: null,
  });
}

export async function closeRedisConnections() {
  const clients = [...getGlobalClients().values()];
  getGlobalClients().clear();
  await Promise.allSettled(
    clients.map(async (client) => {
      if (client.status === 'end') return;
      if (client.status === 'ready' || client.status === 'connect') {
        await client.quit();
        return;
      }
      client.disconnect();
    }),
  );
}
