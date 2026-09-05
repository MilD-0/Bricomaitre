import assert from 'node:assert/strict';
import { randomUUID, createHmac } from 'node:crypto';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, expect as baseExpect } from '@playwright/test';
import { runtime, identity, loadManifest, saveJson } from './state.mjs';
import {
  checks,
  query,
  supervisorAlive,
  composeOutput,
  processEnvironment,
} from './environment.mjs';

const laneModules = {
  storefront: () => import('./gauntlet/storefront.mjs'),
  orders: () => import('./gauntlet/orders.mjs'),
  management: () => import('./gauntlet/management.mjs'),
};
const laneNames = Object.keys(laneModules);
export async function gauntlet(args = []) {
  const lane = args[0] && !args[0].startsWith('-') ? args[0] : 'all';
  const matchIndex = args.indexOf('--match');
  const match = matchIndex < 0 ? '' : args[matchIndex + 1];
  if (matchIndex >= 0 && (!match || match.startsWith('-')))
    throw new Error('--match requires a scenario ID fragment.');
  const requested = lane === 'all' ? laneNames : [lane];
  if (requested.some((name) => !laneNames.includes(name)))
    throw new Error(`Choose all or ${laneNames.join(', ')}.`);
  const unknown = args.filter(
    (a, i) =>
      a !== lane && a !== '--list' && a !== '--match' && !(matchIndex >= 0 && i === matchIndex + 1),
  );
  if (unknown.length) throw new Error(`Unknown gauntlet arguments: ${unknown.join(' ')}`);
  const scenarios = [];
  let active = args.includes('--list') ? undefined : loadManifest();
  const ctx = {
    urls: active?.urls ?? {},
    runId: randomUUID(),
    artifactDir: '',
    query(sql) {
      return query(active, sql);
    },
    seedContentProposal(productId, description) {
      assert.ok(Number.isSafeInteger(productId) && productId > 0, 'Expected a product ID.');
      assert.ok(typeof description === 'string' && description.length <= 4000);
      const literal = (value) => `'${value.replaceAll("'", "''")}'`;
      const output = composeOutput(active, [
        'exec',
        '-T',
        'postgres',
        'psql',
        '-X',
        '-U',
        'bricomaitre_demo_owner',
        '-d',
        'bricomaitre_demo',
        '-v',
        'ON_ERROR_STOP=1',
        '-Atqc',
        `WITH product AS (
          SELECT * FROM products WHERE id=${productId}
          AND title LIKE ${literal(`Gauntlet ${ctx.runId}%`)}
        ), run AS (
          INSERT INTO ai_runs(surface,task,status,model,prompt_version,actor_id,completed_at)
          SELECT 'admin','product_content_proposal','completed','gauntlet-fixture',
            'product-content-v1','operator@demo.bricomaitre.invalid',now() FROM product
          RETURNING id
        ) INSERT INTO ai_proposals(run_id,proposal_type,entity_type,entity_id,
            source_updated_at,payload,expires_at,requested_by)
          SELECT run.id,'product_content','products',product.id,product.updated_at,
            jsonb_build_object('before',jsonb_build_object('title',product.title,
              'titleAr',product.title_ar,'description',product.description,
              'descriptionAr',product.description_ar),
              'changes',jsonb_build_object('description',${literal(description)})),
            now()+interval '1 hour','operator@demo.bricomaitre.invalid'
          FROM product CROSS JOIN run RETURNING id`,
      ]);
      const id = Number(output.trim());
      assert.ok(Number.isSafeInteger(id) && id > 0, 'Proposal target must belong to this run.');
      return id;
    },
    async loginAs(context, userId) {
      if (!['demo-viewer', 'demo-amine', 'demo-yacine'].includes(userId))
        throw new Error('Only seeded task identities may be used.');
      const token = randomUUID();
      composeOutput(active, [
        'exec',
        '-T',
        'postgres',
        'psql',
        '-X',
        '-U',
        'bricomaitre_demo_owner',
        '-d',
        'bricomaitre_demo',
        '-v',
        'ON_ERROR_STOP=1',
        '-c',
        `INSERT INTO admin.sessions(session_token,user_id,expires) VALUES ('${token}','${userId}',now()+interval '1 hour')`,
      ]);
      const signature = createHmac('sha256', processEnvironment('admin').BETTER_AUTH_SECRET)
        .update(token)
        .digest('base64');
      await context.clearCookies();
      await context.addCookies([
        {
          name: 'better-auth.session_token',
          value: `${token}.${signature}`,
          domain: new URL(ctx.urls.admin).hostname,
          path: '/',
          expires: Math.floor(Date.now() / 1000) + 3600,
          httpOnly: true,
          secure: false,
          sameSite: 'Lax',
        },
      ]);
    },
    async loginAdmin(page) {
      await page.goto(`${ctx.urls.admin}/en`, { waitUntil: 'domcontentloaded' });
      const button = page.getByRole('button', { name: 'Enter the demo' });
      if (await button.count()) {
        await button.click();
        await page.waitForURL(/\/en\/administration/, { timeout: 90000 });
      } else await page.waitForURL(/\/en\/(administration|products)/, { timeout: 90000 });
    },
    async test(id, title, fn) {
      if (!/^[a-z0-9-]+$/.test(id) || scenarios.some((s) => s.id === id))
        throw new Error(`Invalid or duplicate scenario ID: ${id}`);
      scenarios.push({ id, title, fn });
    },
    async skip(id, title, reason) {
      scenarios.push({ id, title, reason });
    },
  };
  for (const name of requested) {
    const suite = await laneModules[name]();
    await suite.run(ctx);
  }
  const selected = scenarios.filter((s) => s.id.includes(match));
  if (!selected.length) throw new Error('No matching scenarios.');
  if (args.includes('--list')) {
    console.log(
      JSON.stringify(
        selected.map(({ id, title, reason }) => ({ id, title, reason })),
        null,
        2,
      ),
    );
    return;
  }
  active = loadManifest();
  const before = identity();
  assert.equal(
    before.fingerprint,
    active.source.fingerprint,
    'Restart the task environment against current source before running the gauntlet.',
  );
  assert.ok(supervisorAlive(active), 'Task supervisor must be running.');
  const health = await checks(active);
  assert.ok(
    health.every((c) => c.ok),
    `Task readiness failed: ${JSON.stringify(health)}`,
  );
  const dir = join(
    runtime,
    'gauntlet',
    `${new Date().toISOString().replaceAll(':', '-')}-${lane}-${process.pid}`,
  );
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  Object.assign(ctx, { urls: active.urls, artifactDir: dir });
  const report = {
    version: 1,
    runId: ctx.runId,
    lane,
    sourceBefore: before,
    environment: active,
    startedAt: new Date().toISOString(),
    status: 'running',
    scenarios: [],
  };
  saveJson(join(dir, 'report.json'), report);
  const browser = await chromium.launch({ headless: true });
  let interrupted = false;
  const interrupt = () => {
    interrupted = true;
    void browser.close();
  };
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);
  try {
    for (const scenario of selected) {
      const item = {
        id: scenario.id,
        title: scenario.title,
        status: scenario.reason ? 'skipped' : 'running',
        startedAt: new Date().toISOString(),
        logs: [],
      };
      report.scenarios.push(item);
      if (scenario.reason) {
        item.reason = scenario.reason;
        continue;
      }
      const folder = join(dir, scenario.id);
      mkdirSync(folder, { mode: 0o700 });
      const context = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
        reducedMotion: 'reduce',
        extraHTTPHeaders: { 'x-real-ip': `192.0.2.${report.scenarios.length}` },
      });
      context.setDefaultTimeout(15000);
      context.setDefaultNavigationTimeout(90000);
      const network = [];
      const consoleMessages = [];
      const starts = new WeakMap();
      context.on('request', (r) => starts.set(r, Date.now()));
      context.on('response', (r) => {
        if (network.length < 1000)
          network.push({
            url: r.url(),
            method: r.request().method(),
            status: r.status(),
            requestId: r.headers()['x-request-id'] ?? null,
            durationMs: Date.now() - (starts.get(r.request()) ?? Date.now()),
          });
      });
      context.on('requestfailed', (r) => {
        if (network.length < 1000)
          network.push({ url: r.url(), method: r.method(), error: r.failure()?.errorText });
      });
      context.on('page', (p) => {
        p.on('pageerror', (error) =>
          consoleMessages.push({ type: 'pageerror', message: error.message }),
        );
        p.on('console', (message) => {
          if (consoleMessages.length < 500 && ['error', 'warning'].includes(message.type()))
            consoleMessages.push({ type: message.type(), message: message.text() });
        });
      });
      await context.tracing.start({ screenshots: true, snapshots: true });
      const page = await context.newPage();
      const started = Date.now();
      let timer;
      console.log(`RUN ${scenario.id}: ${scenario.title}`);
      try {
        await Promise.race([
          scenario.fn({
            page,
            context,
            expect: baseExpect.configure({ timeout: 15000 }),
            log: (message) => item.logs.push(String(message)),
            save: (name, data) => {
              if (!/^[a-zA-Z0-9_-]+(?:\.json)?$/.test(name))
                throw new Error('Artifact names must be simple filenames.');
              saveJson(join(folder, name.endsWith('.json') ? name : `${name}.json`), data);
            },
          }),
          new Promise((_, reject) => {
            timer = setTimeout(
              () => reject(new Error('Scenario exceeded its 120-second budget.')),
              120000,
            );
          }),
        ]);
        item.status = 'passed';
      } catch (error) {
        item.status = 'failed';
        item.error = error.stack ?? String(error);
      } finally {
        clearTimeout(timer);
        item.durationMs = Date.now() - started;
        for (const [index, p] of context.pages().slice(0, 3).entries()) {
          await p
            .screenshot({ path: join(folder, `page-${index}.png`), fullPage: true, timeout: 5000 })
            .catch(() => {});
          await p
            .locator('body')
            .innerText({ timeout: 3000 })
            .then((text) =>
              writeFileSync(join(folder, `page-${index}.txt`), text.slice(0, 60000), {
                mode: 0o600,
              }),
            )
            .catch(() => {});
        }
        await context.tracing.stop({ path: join(folder, 'trace.zip') }).catch(() => {});
        await context.close().catch(() => {});
        saveJson(join(folder, 'network.json'), network);
        saveJson(join(folder, 'console.json'), consoleMessages);
        saveJson(join(folder, 'result.json'), item);
        saveJson(join(dir, 'report.json'), report);
      }
      console.log(
        `${item.status.toUpperCase()} ${scenario.id} ${item.durationMs}ms${item.error ? ` ${item.error.split('\n')[0]}` : ''}`,
      );
      if (interrupted) break;
    }
  } finally {
    await browser.close().catch(() => {});
    process.off('SIGINT', interrupt);
    process.off('SIGTERM', interrupt);
    report.sourceAfter = identity();
    report.sourceMatches = report.sourceAfter.fingerprint === before.fingerprint;
    report.finishedAt = new Date().toISOString();
    report.status = interrupted
      ? 'interrupted'
      : !report.sourceMatches
        ? 'invalidated'
        : report.scenarios.some((s) => s.status === 'failed')
          ? 'failed'
          : 'passed';
    report.counts = Object.fromEntries(
      ['passed', 'failed', 'skipped'].map((status) => [
        status,
        report.scenarios.filter((s) => s.status === status).length,
      ]),
    );
    for (const name of [
      'supervisor',
      'api',
      'admin',
      'storefront',
      'admin-worker',
      'meta-worker',
    ]) {
      const path = join(runtime, `${name}.log`);
      if (existsSync(path))
        writeFileSync(
          join(dir, `${name}.log`),
          readFileSync(path, 'utf8').split('\n').slice(-1000).join('\n'),
          { mode: 0o600 },
        );
    }
    saveJson(join(dir, 'report.json'), report);
    const rows = report.scenarios
      .map(
        (s) => `| ${s.id} | ${s.status} | ${s.durationMs ?? 0} | ${s.title.replaceAll('|', '/')} |`,
      )
      .join('\n');
    writeFileSync(
      join(dir, 'report.md'),
      `# E2E gauntlet\n\nSource: ${before.commit}\n\nStatus: ${report.status}. Failed scenarios require triage before being called product defects.\n\n| Scenario | Result | Duration ms | Behavior |\n| --- | --- | --- | --- |\n${rows}\n`,
      { mode: 0o600 },
    );
    console.log(`Gauntlet ${report.status}: ${join(dir, 'report.json')}`);
  }
  if (report.status !== 'passed') process.exitCode = 1;
}
