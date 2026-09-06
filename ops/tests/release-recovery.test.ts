import { spawnSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const temporaryDirectories: string[] = [];
const imageNames = {
  STOREFRONT_API: 'storefront-api',
  STOREFRONT_META_WORKER: 'meta-worker',
  ADMIN_WEB: 'admin-web',
  ADMIN_WORKER: 'admin-worker',
  ADMIN_MIGRATIONS: 'admin-migrations',
  STOREFRONT_WEB: 'storefront-web',
};
const image = (name: string, generation: string) =>
  `ghcr.io/mild-0/bricomaitre/${name}@sha256:${generation.repeat(64)}`;

// Only external processes are substituted. The real entrypoints, sourced shell
// helpers, traps, migration verifier, health checks and Nginx renderer execute.
// Docker records container/image state; curl models the routed public endpoints.
const externalCommands = String.raw`#!/usr/bin/python3
import json, os, re, sys
from pathlib import Path
from subprocess import run
base = Path(os.environ['TEST_RUNTIME'])
state_path = base / 'docker.json'
state = json.loads(state_path.read_text())
args = sys.argv[1:]
name = Path(sys.argv[0]).name
failure = os.environ.get('TEST_FAILURE', '')
def event(*parts):
    with (base / 'events.jsonl').open('a') as log:
        log.write(json.dumps(parts) + '\n')
def done(output='', code=0):
    state_path.write_text(json.dumps(state))
    if output: print(output)
    sys.exit(code)
def pinned(service):
    if service == 'storefront-meta-worker': key = 'STOREFRONT_META_WORKER'
    else:
        role, slot = service.rsplit('-', 1)
        key = {'storefront-api':'STOREFRONT_API', 'admin':'ADMIN_WEB',
               'admin-worker':'ADMIN_WORKER', 'admin-migrations':'ADMIN_MIGRATIONS',
               'storefront':'STOREFRONT_WEB'}[role] + '_' + slot.upper()
    values = dict(line.split('=', 1) for line in (base / 'images.env').read_text().splitlines())
    return values['BRIC_IMAGE_' + key]
def acquire(ref):
    event('pull', ref)
    state['images'].append(ref)
if name == 'ln':
    if failure == 'publication' and args[-1] == os.environ['BRIC_CURRENT_LINK'] and not state.get('publication_failed'):
        state['publication_failed'] = True
        done(code=7)
    sys.exit(run(['/usr/bin/ln', *args]).returncode)
if name == 'cosign':
    event('sign', args[-1])
    done()
if name == 'python3':
    if args[0] == '-':
        sys.stdin.read()
        event('catalog-preflight')
        done('PRODUCT_COUNT=4\nBRAND_COUNT=1\nCATEGORY_COUNT=1')
    result = run(['/usr/bin/python3', *args])
    sys.exit(result.returncode)
if name == 'curl':
    slot = state['routing']
    event('smoke', slot)
    if failure == 'cutover' and slot == 'green': done(code=22)
    if '--dump-header' in args: done('HTTP/1.1 200 OK\r\nx-request-id: request-1\r\n')
    url = args[-1]
    if url.endswith('/api/health'): done('{"app":"storefront"}')
    if url.endswith('/robots.txt'): done('Sitemap: https://www.example.com/sitemap.xml')
    if url.endswith('/sitemap.xml'): done('<loc>https://www.example.com/fr/products/tool</loc>')
    done('<html>Bricomaitre</html>')
if name != 'docker': raise Exception('unexpected external command: ' + name)
if args[0] == 'pull':
    acquire(args[1]); done()
if args[0] == 'inspect':
    service, fmt = args[-1], args[2]
    if '.Config.Image' in fmt: done(state['containers'][service])
    if '.State.Running' in fmt: done('true' if service in state['containers'] else 'false')
    if '.State.Health' in fmt:
        event('health', service)
        done('unhealthy' if failure == 'candidate-health' and service == 'admin-worker-green' else 'healthy')
    raise Exception('unexpected inspect: ' + fmt)
if args[0] == 'exec':
    if 'redis-cli' in args:
        done('NOAUTH Authentication required.' if '-u' in args else 'PONG')
    if 'psql' in args:
        sys.stdin.read(); done('t')
    if args[-1].endswith('10-bric-roles.sh'):
        event('provision-roles'); done()
    raise Exception('unexpected exec: ' + repr(args))
if args[0] == 'logs': done()
if args[0] == 'ps': done()  # No obsolete containers outside this fixture's Compose services.
if args[0] != 'compose': raise Exception('unexpected docker call: ' + repr(args))
args = args[1:]
while args and args[0] in ['--env-file', '-f']: args = args[2:]
command, rest = args[0], args[1:]
services = [arg for arg in rest if arg in state['services']]
if command == 'ps': done(rest[-1] if rest[-1] in state['containers'] else '')
if command == 'config': done('\n'.join(state['services']))
if command == 'pull':
    for service in services: acquire(pinned(service))
    done()
if command in ['up', 'run']:
    for service in services:
        if service in ['postgres', 'redis', 'nginx']: ref = 'infrastructure'
        else:
            ref = pinned(service)
            if ref not in state['images']:
                if '--pull' in rest and rest[rest.index('--pull') + 1] == 'never': done(code=1)
                acquire(ref)
        if command == 'run':
            task = os.environ.get('ADMIN_DB_TASK', '')
            event('run', task, service)
            if failure == 'reporting' and task == 'refresh-reporting': done(code=7)
        else:
            event('start', service)
            state['containers'][service] = ref
    done()
if command in ['stop', 'rm']:
    for service in services:
        event('stop' if command == 'stop' else 'remove', service)
        state['containers'].pop(service, None)
    done()
if command == 'exec' and 'nginx' in rest:
    if 'reload' in rest:
        config = (base / 'nginx/default.conf').read_text()
        state['routing'] = re.search(r'storefront-api-(blue|green)', config).group(1)
        event('route', state['routing'])
    done()
raise Exception('unexpected compose call: ' + repr(args))
`;

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'bric-deploy-entrypoint-'));
  temporaryDirectories.push(directory);
  const runtime = join(directory, 'runtime');
  const releases = join(directory, 'releases');
  const envDirectory = join(directory, 'env');
  const bin = join(directory, 'bin');
  for (const path of [runtime, releases, envDirectory, bin]) mkdirSync(path);
  const current = join(directory, 'current');
  const previous = join(directory, 'previous');
  const env = {
    PATH: `${bin}:${process.env.PATH}`,
    TEST_RUNTIME: runtime,
    BRIC_INFRA_ENV_FILE: join(envDirectory, 'infra.env'),
    BRIC_RUNTIME_DIR: runtime,
    BRIC_RELEASES_DIR: releases,
    BRIC_ENV_DIR: envDirectory,
    BRIC_CURRENT_LINK: current,
    BRIC_PREVIOUS_LINK: previous,
    META_DEPLOY_VERIFY_ENABLED: '0',
    ATTEMPTS: '1',
    SLEEP_SECONDS: '0',
    BRIC_SMOKE_REQUEST_ID_ATTEMPTS: '1',
  };
  const release = (name: string, generation: string) => {
    const path = join(releases, name);
    mkdirSync(join(path, 'ops'), { recursive: true });
    cpSync(join(root, 'ops/scripts'), join(path, 'ops/scripts'), { recursive: true });
    cpSync(join(root, 'ops/nginx'), join(path, 'ops/nginx'), { recursive: true });
    const nginxMain = join(path, 'ops/nginx/nginx.conf');
    writeFileSync(nginxMain, readFileSync(nginxMain, 'utf8') + `\n# Release ${name}\n`);
    cpSync(join(root, 'ops/docker'), join(path, 'ops/docker'), { recursive: true });
    cpSync(join(root, 'third_party/licenses'), join(path, 'third_party/licenses'), {
      recursive: true,
    });
    for (const file of ['LICENSE', 'NOTICE', 'SECURITY.md'])
      cpSync(join(root, file), join(path, file));
    writeFileSync(
      join(path, '.bric-release.env'),
      `BRIC_RELEASE_ID=${name}\nBRIC_RELEASE_COMMIT=${generation.repeat(40)}\nBRIC_RELEASE_SIGNER_IDENTITY=https://github.com/MilD-0/Bricomaitre/.github/workflows/deploy.yml@refs/heads/main\n`,
    );
    writeFileSync(
      join(path, '.bric-images.env'),
      Object.entries(imageNames)
        .map(([key, name]) => `BRIC_IMAGE_${key}=${image(name, generation)}\n`)
        .join('') + 'BRIC_STOREFRONT_APP=storefront\n',
    );
    writeFileSync(
      join(path, '.bric-migrations.json'),
      JSON.stringify({
        version: 1,
        sourceCommit: generation.repeat(40),
        migrations: [],
        exceptions: [],
      }),
    );
    return path;
  };
  const incumbent = release('incumbent', 'a');
  const candidate = release('candidate', 'b');
  symlinkSync(incumbent, current);
  symlinkSync(candidate, previous);
  writeFileSync(join(runtime, 'blue-green.env'), 'BRIC_ACTIVE_SLOT=blue\n');
  const pins = Object.entries(imageNames)
    .flatMap(([key, name]) =>
      key === 'STOREFRONT_META_WORKER'
        ? [`BRIC_IMAGE_${key}=${image(name, 'a')}\n`]
        : ['BLUE', 'GREEN'].map((slot) => `BRIC_IMAGE_${key}_${slot}=${image(name, 'a')}\n`),
    )
    .join('');
  writeFileSync(join(runtime, 'images.env'), pins);
  const services = [
    'postgres',
    'redis',
    'nginx',
    'storefront-meta-worker',
    ...['blue', 'green'].flatMap((slot) =>
      ['storefront-api', 'admin', 'admin-worker', 'admin-migrations', 'storefront'].map(
        (name) => `${name}-${slot}`,
      ),
    ),
  ];
  writeFileSync(
    join(runtime, 'docker.json'),
    JSON.stringify({
      routing: 'blue',
      services,
      images: Object.values(imageNames).map((name) => image(name, 'a')),
      containers: {
        postgres: 'infrastructure',
        redis: 'infrastructure',
        nginx: 'infrastructure',
        'storefront-api-blue': image('storefront-api', 'a'),
        'admin-blue': image('admin-web', 'a'),
        'admin-worker-blue': image('admin-worker', 'a'),
        'storefront-blue': image('storefront-web', 'a'),
        'storefront-meta-worker': image('meta-worker', 'a'),
      },
    }),
  );
  writeFileSync(join(runtime, 'events.jsonl'), '');
  writeFileSync(
    join(envDirectory, 'storefront-api.env'),
    'STOREFRONT_API_DEPLOY_TOKEN=test-token\n',
  );
  mkdirSync(join(runtime, 'nginx-main'));
  cpSync(join(incumbent, 'ops/nginx/nginx.conf'), join(runtime, 'nginx-main/nginx.conf'));
  expect(
    spawnSync(
      '/usr/bin/python3',
      [
        join(incumbent, 'ops/scripts/render-nginx-config.py'),
        join(incumbent, 'ops/nginx/templates/default.conf.template'),
        join(runtime, 'nginx/default.conf'),
        'blue',
      ],
      { env },
    ).status,
  ).toBe(0);
  const driver = join(bin, 'external');
  writeFileSync(driver, externalCommands, { mode: 0o755 });
  for (const name of ['docker', 'curl', 'cosign', 'python3', 'ln'])
    symlinkSync(driver, join(bin, name));
  return {
    runtime,
    incumbent,
    candidate,
    current,
    previous,
    env,
    pins,
    run(script: 'deploy' | 'rollback' | 'run-admin-migrations', failure = '') {
      return spawnSync(
        'bash',
        [
          join(candidate, `ops/scripts/${script}.sh`),
          ...(script === 'deploy'
            ? [candidate, 'b'.repeat(40)]
            : script === 'run-admin-migrations'
              ? ['blue']
              : []),
        ],
        {
          env: { ...env, TEST_FAILURE: failure },
          encoding: 'utf8',
          timeout: 15000,
        },
      );
    },
    events: () =>
      readFileSync(join(runtime, 'events.jsonl'), 'utf8')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as string[]),
    state: () =>
      JSON.parse(readFileSync(join(runtime, 'docker.json'), 'utf8')) as {
        routing: string;
        containers: Record<string, string>;
        images: string[];
      },
  };
}

function expectRecovered(test: ReturnType<typeof fixture>) {
  expect(readlinkSync(test.current)).toBe(test.incumbent);
  expect(readlinkSync(test.previous)).toBe(test.candidate);
  expect(readFileSync(join(test.runtime, 'blue-green.env'), 'utf8')).toBe(
    'BRIC_ACTIVE_SLOT=blue\n',
  );
  expect(readFileSync(join(test.runtime, 'images.env'), 'utf8')).toBe(test.pins);
  expect(readFileSync(join(test.runtime, 'nginx/default.conf'), 'utf8')).toContain(
    'storefront-api-blue',
  );
  expect(readFileSync(join(test.runtime, 'nginx-main/nginx.conf'), 'utf8')).toBe(
    readFileSync(join(test.incumbent, 'ops/nginx/nginx.conf'), 'utf8'),
  );
  expect(test.state().routing).toBe('blue');
  expect(test.state().containers['admin-worker-blue']).toBe(image('admin-worker', 'a'));
  expect(test.state().containers['storefront-meta-worker']).toBe(image('meta-worker', 'a'));
  expect(Object.keys(test.state().containers).some((name) => name.endsWith('-green'))).toBe(false);
}

describe('deployment and rollback entrypoints', () => {
  it.each(['deploy', 'rollback'] as const)(
    '%s switches routing and state before retiring the incumbent',
    (script) => {
      const test = fixture();
      const result = test.run(script);
      expect(result.status, result.stderr).toBe(0);
      expect(readlinkSync(test.current)).toBe(test.candidate);
      expect(readlinkSync(test.previous)).toBe(test.incumbent);
      expect(readFileSync(join(test.runtime, 'blue-green.env'), 'utf8')).toBe(
        'BRIC_ACTIVE_SLOT=green\n',
      );
      expect(test.state().routing).toBe('green');
      expect(test.state().containers['admin-worker-green']).toBe(image('admin-worker', 'b'));
      expect(test.state().containers['storefront-meta-worker']).toBe(image('meta-worker', 'b'));
      expect(test.state().containers['admin-worker-blue']).toBeUndefined();
      const events = test.events();
      expect(events.filter(([kind]) => kind === 'pull')).toEqual(
        Object.values(imageNames).map((name) => ['pull', image(name, 'b')]),
      );
      expect(events.filter(([kind]) => kind === 'sign')).toHaveLength(6);
      const index = (...event: string[]) => {
        const found = events.findIndex((item) => JSON.stringify(item) === JSON.stringify(event));
        expect(found, `Missing event: ${event.join(' ')}`).toBeGreaterThan(-1);
        return found;
      };
      expect(index('route', 'green')).toBeGreaterThan(index('health', 'admin-worker-green'));
      expect(index('stop', 'admin-worker-blue')).toBeGreaterThan(
        index('health', 'storefront-meta-worker'),
      );
      if (script === 'deploy') {
        expect(events.filter(([kind]) => kind === 'run').map((event) => event[1])).toEqual([
          'verify',
          'migrate',
          'verify',
          'refresh-reporting',
        ]);
        expect(index('route', 'green')).toBeGreaterThan(
          index('run', 'refresh-reporting', 'admin-migrations-green'),
        );
      }
    },
  );

  it.each(['candidate-health', 'reporting', 'cutover', 'publication'])(
    'deployment restores the actual incumbent state after %s failure',
    (failure) => {
      const test = fixture();
      const result = test.run('deploy', failure);
      expect(result.status, result.stderr).toBe(
        ['candidate-health', 'cutover'].includes(failure) ? 1 : 7,
      );
      if (failure === 'candidate-health')
        expect(test.events()).toContainEqual(['health', 'admin-worker-green']);
      if (failure === 'reporting')
        expect(test.events()).toContainEqual([
          'run',
          'refresh-reporting',
          'admin-migrations-green',
        ]);
      expectRecovered(test);
      const routing = test.events().filter(([kind]) => kind === 'route');
      expect(routing).toEqual(
        ['cutover', 'publication'].includes(failure)
          ? [
              ['route', 'green'],
              ['route', 'blue'],
            ]
          : [],
      );
    },
  );

  it('rollback restores the current release when public checks fail after cutover', () => {
    const test = fixture();
    const result = test.run('rollback', 'cutover');
    expect(result.status).not.toBe(0);
    expectRecovered(test);
    expect(test.events().filter(([kind]) => kind === 'route')).toEqual([
      ['route', 'green'],
      ['route', 'blue'],
    ]);
  });

  it('rejects an incompatible migration before executing any database task', () => {
    const test = fixture();
    const statePath = join(test.candidate, '.bric-migrations.json');
    const state = JSON.parse(readFileSync(statePath, 'utf8'));
    state.migrations.push({
      migration: '0001_drop.sql',
      sha256: 'c'.repeat(64),
      rollbackIncompatible: ['drop a column'],
    });
    writeFileSync(statePath, JSON.stringify(state));
    const result = test.run('deploy');
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('rollback-incompatible');
    expect(test.events().filter(([kind]) => kind === 'run')).toEqual([]);
    expectRecovered(test);
  });

  it('standalone migrations acquire a missing pinned image and reuse it for all tasks', () => {
    const test = fixture();
    const state = test.state();
    state.images = state.images.filter((ref) => ref !== image('admin-migrations', 'a'));
    writeFileSync(join(test.runtime, 'docker.json'), JSON.stringify(state));
    const result = test.run('run-admin-migrations');
    expect(result.status, result.stderr).toBe(0);
    expect(test.events().filter(([kind]) => kind === 'pull')).toEqual([
      ['pull', image('admin-migrations', 'a')],
    ]);
    expect(
      test
        .events()
        .filter(([kind]) => kind === 'run')
        .map((event) => event[1]),
    ).toEqual(['verify', 'migrate', 'verify']);
  });
});
