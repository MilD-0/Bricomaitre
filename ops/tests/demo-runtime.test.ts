import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const workspaceRoot = resolve(import.meta.dirname, '../..');
const read = (path: string) => readFileSync(resolve(workspaceRoot, path), 'utf8');

function serviceBlock(compose: string, service: string) {
  const start = compose.indexOf(`\n  ${service}:`);
  if (start < 0) throw new Error(`Missing Compose service: ${service}`);
  const remaining = compose.slice(start + service.length + 4);
  const nextMatch = /^  \S.*:$/m.exec(remaining);
  const end =
    nextMatch?.index == null ? compose.length : start + service.length + 4 + nextMatch.index;
  return compose.slice(start, end);
}

describe('self-contained demo runtime', () => {
  const compose = read('ops/demo/compose.yml');
  const launcher = read('demo');
  const seed = read('ops/demo/postgres/seed.sql');

  it('keeps every dependency and process inside a dedicated Compose project', () => {
    expect(compose).toContain('name: bricomaitre-demo');
    for (const service of [
      'postgres',
      'redis',
      'object-storage',
      'mock-services',
      'storefront-api',
      'storefront-marketing-worker',
      'admin',
      'admin-worker',
      'storefront',
    ]) {
      expect(compose).toContain(`\n  ${service}:`);
    }
    expect(serviceBlock(compose, 'postgres')).not.toContain('\n    ports:');
    expect(serviceBlock(compose, 'redis')).not.toContain('\n    ports:');
    expect(compose).toContain('\n  postgres-data:');
    expect(compose).toContain('\n  redis-data:');
    expect(compose).toContain('\n  object-storage-data:');
    expect(serviceBlock(compose, 'storefront-api')).toContain(
      'storefront-api-cache:/app/apps/storefront-api/.next/cache',
    );
    expect(serviceBlock(compose, 'admin')).toContain('admin-cache:/app/apps/admin/.next/cache');
  });

  it('publishes only explicit loopback entry points', () => {
    const publishedPorts = [...compose.matchAll(/^\s+- (.+:\d+)$/gm)]
      .map((match) => match[1])
      .filter((entry) => entry.includes('${DEMO_'));

    expect(publishedPorts).toHaveLength(6);
    expect(publishedPorts.every((entry) => entry.startsWith('127.0.0.1:'))).toBe(true);
    expect(compose).not.toContain('0.0.0.0:${DEMO_');
  });

  it('applies migrations and least-privilege roles before deterministic data', () => {
    expect(serviceBlock(compose, 'database-permissions')).toContain(
      'migrations:\n        condition: service_completed_successfully',
    );
    expect(serviceBlock(compose, 'seed')).toContain(
      'database-permissions:\n        condition: service_completed_successfully',
    );
    expect(serviceBlock(compose, 'storefront-api')).toContain(
      'seed:\n        condition: service_completed_successfully',
    );
    expect(seed).toContain('FROM generate_series(1, 96) i');
    expect(seed).toContain('CREATE TABLE IF NOT EXISTS demo_runtime.initialization');
    expect(seed).toContain("'ar', 'atelier-sans-fil'");
    expect(seed).toContain("'Produit synthétique conçu");
    expect(seed).toContain("'operator@demo.bricomaitre.invalid'");
    expect(seed).not.toContain('bricomaitre.com');
  });

  it('keeps AI disabled while exercising the real app and worker boundaries', () => {
    expect(launcher).toContain("'AI_ENABLED=false'");
    expect(launcher).not.toContain('OPENAI_API_KEY=');
    expect(launcher).not.toContain('OPENROUTER_API_KEY=');
    expect(compose).toContain('target: web');
    expect(compose).toContain('target: worker');
    expect(compose).toContain('target: meta-worker');
  });

  it('keeps customer exports private while serving only deliberate public assets', () => {
    const policy = JSON.parse(read('ops/demo/object-storage/public-read-policy.json')) as {
      Statement: Array<{ Resource: string[] }>;
    };
    const resources = policy.Statement.flatMap((statement) => statement.Resource);

    expect(resources).toContain('arn:aws:s3:::bricomaitre-demo/products/*');
    expect(resources).toContain('arn:aws:s3:::bricomaitre-demo/exports/products/*');
    expect(resources.some((resource) => resource.includes('exports/orders'))).toBe(false);
    expect(resources.some((resource) => resource.includes('bulletin'))).toBe(false);
    expect(read('ops/demo/object-storage/init.sh')).toContain('--prefix exports/orders/');
  });

  it('offers one safe operator entry point without exposing generated configuration', () => {
    expect(statSync(resolve(workspaceRoot, 'demo')).mode & 0o111).not.toBe(0);
    expect(read('.gitignore')).toContain('ops/demo/.runtime/');
    expect(launcher).toContain('compose config --quiet');
    expect(launcher).toContain('destroy --yes');
    expect(launcher).toContain('compose up -d --no-deps storefront-api');
    expect(launcher).not.toContain('compose up --build -d');
    expect(launcher).toContain("to_regclass('demo_runtime.initialization') IS NOT NULL");
    expect(launcher).toContain('/__demo/reset');
    expect(launcher).toContain('compose up -d --wait postgres redis object-storage mock-services');
    expect(launcher).toContain('find /app/apps/storefront-api/.next/cache -mindepth 1 -delete');
    expect(launcher).toContain('find /app/apps/admin/.next/cache -mindepth 1 -delete');
    expect(launcher).toContain('find /app/apps/storefront/.next/cache -mindepth 1 -delete');
    expect(launcher).not.toContain('compose config\n');
  });
});
