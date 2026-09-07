import './ai-eval-live-boundaries';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { appendFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getPool } from '@bric/db/client';
import { buildAdminAiTools } from '../lib/admin-ai-tools';
import { suites } from './ai-eval-scenarios';
import { runScenario } from './run-ai-evals';
import { assertMatrixIsolation, matrixActor, seedMatrixFixtures } from './ai-eval-live-fixtures';
import { installMatrixNetworkGuard } from './ai-eval-live-boundaries';
import { startMatrixWorkers } from './ai-eval-live-jobs';
import {
  diffSnapshots,
  observeWriteTools,
  snapshotTables,
  writeTables,
  type WriteEvidence,
} from './ai-eval-write-evidence';

const suite = process.env.ADMIN_AI_EVAL_SUITE ?? 'all';
const scenarioId = process.env.ADMIN_AI_EVAL_SCENARIO;
const selected = (
  suite === 'all'
    ? Object.entries(suites)
        .filter(([name]) => name !== 'workflows')
        .flatMap(([, scenarios]) => scenarios)
        .concat(suites.workflows)
    : (suites[suite] ?? [])
)
  .filter((scenario) => !scenarioId || scenarioId.split(',').includes(scenario.id))
  .map((scenario) =>
    process.env.ADMIN_AI_EVAL_SOURCE === 'demo' && scenario.id === 'commerce_inventory_receive'
      ? {
          ...scenario,
          turns: ['Scan barcode 9900000000012 and receive two units for the matched product.'],
        }
      : scenario,
  );
if (!selected.length) throw new Error('No matching matrix scenarios');
const directory = process.env.ADMIN_AI_EVAL_DIRECTORY!;
let conversationId: number;
let restoreNetwork: () => void;
let workers: ReturnType<typeof startMatrixWorkers>;
const returned = new Set<string>();
const changed = new Set<string>();
const failures: Array<{ scenario: string; error: string }> = [];

describe('Admin assistant operator matrix with real local writes', () => {
  beforeAll(async () => {
    await assertMatrixIsolation();
    restoreNetwork = installMatrixNetworkGuard();
    conversationId = await seedMatrixFixtures();
    workers = startMatrixWorkers();
  });
  afterAll(async () => {
    const all = buildAdminAiTools({
      permissions: [
        'products_write',
        'orders_write',
        'assets_write',
        'brands_categories_write',
        'analytics_manage',
        'settings_manage',
      ],
      locale: 'en',
      runtime: { kind: 'evaluation' },
    });
    await writeFile(
      join(directory, 'coverage.json'),
      JSON.stringify(
        {
          scenarios: selected.length,
          registered: Object.keys(all),
          returned: [...returned].sort(),
          notReturned: Object.keys(all).filter((name) => !returned.has(name)),
          writesWithObservedStateChanges: [...changed].sort(),
          failures,
          boundaries: [
            'Carrier/Meta/Search Console HTTP simulators',
            'Generation provider responses',
            'Cache invalidation',
            'Object storage saved to local files',
          ],
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
    await workers?.close();
    restoreNetwork?.();
    await getPool().end();
  });

  for (const scenario of selected)
    it(scenario.id, async () => {
      const evidence: WriteEvidence[] = [];
      const tables = [...new Set(Object.values(writeTables).flat())];
      const before = await snapshotTables(tables);
      const live = buildAdminAiTools({
        permissions: [
          'products_write',
          'orders_write',
          'assets_write',
          'brands_categories_write',
          'analytics_manage',
          'settings_manage',
        ],
        locale: 'en',
        runtime: {
          kind: 'live',
          actor: matrixActor,
          actorId: matrixActor.email,
          exportOwnerKey: matrixActor.email,
          conversationId,
          autoAcceptProposals: false,
        },
      });
      const tools = observeWriteTools(live, evidence);
      const turns: Record<string, unknown>[] = [];
      try {
        const failedTurns = await runScenario(scenario, {
          tools,
          onTurn: async (row) => {
            row.executionMode = 'real-local-writes';
            turns.push(row);
            const coverage = row.coverage as { returned?: string[] } | undefined;
            coverage?.returned?.forEach((name) => returned.add(name));
            await appendFile(join(directory, 'turns.jsonl'), `${JSON.stringify(row)}\n`, {
              mode: 0o600,
            });
            await workers.settle();
          },
        });
        if (failedTurns) throw new Error(`${failedTurns} assistant turns did not complete`);
      } catch (error) {
        failures.push({ scenario: scenario.id, error: String(error) });
        throw error;
      } finally {
        const jobs = await workers.settle();
        const after = await snapshotTables(tables);
        const changes = diffSnapshots(before, after);
        for (const record of evidence) if (record.changes.length) changed.add(record.toolName);
        await writeFile(
          join(directory, `${scenario.id}.json`),
          JSON.stringify({
            scenario,
            turns,
            evidence,
            changes,
            jobs,
            operatorVerdict: 'pending-human-review',
          }),
          { mode: 0o600 },
        );
        console.log(
          JSON.stringify({
            scenario: scenario.id,
            turns: turns.length,
            mutations: evidence.length,
            changedRows: changes.length,
            checksFailed: evidence.flatMap((e) => e.checks.filter((check) => !check.passed)).length,
          }),
        );
      }
    });
});
