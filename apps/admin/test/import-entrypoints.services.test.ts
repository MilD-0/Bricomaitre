import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';

const execute = promisify(execFile);
const database = `bric_import_${randomUUID().replaceAll('-', '')}`;
const control = new Pool({ connectionString: process.env.DATABASE_URL });
let pool: Pool;
let directory: string;
let environment: NodeJS.ProcessEnv;

async function child(script: string, args: string[] = []) {
  return execute(process.execPath, ['--import', 'tsx', script, ...args], {
    cwd: process.cwd(),
    env: environment,
    timeout: 60_000,
    maxBuffer: 1024 * 1024,
  });
}
async function exportsFor(order: Record<string, unknown>) {
  for (const [target, rows] of Object.entries({
    brands: [{ _id: 'new-brand', name: 'Replacement brand', createdAt: { $date: 1704067200000 } }],
    categories: [],
    products: [
      {
        _id: 'new-product',
        title: 'Replacement product',
        price: 100,
        purchase_price: 40,
        brand: 'new-brand',
      },
    ],
    orders: [order],
  }))
    await writeFile(join(directory, `mongo-${target}.json`), JSON.stringify(rows));
}
async function importLegacy(args: string[]) {
  return child(resolve('tools/legacy-data/import-legacy-mongo.ts'), ['--dir', directory, ...args]);
}
async function counts() {
  return (
    await pool.query(`select (select count(*)::int from brands) as brands,
    (select count(*)::int from products) as products, (select count(*)::int from orders) as orders,
    (select count(*)::int from order_line_items) as lines`)
  ).rows[0];
}
async function spreadsheet(name: string, rows: Record<string, unknown>[]) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), 'Data');
  const file = join(directory, name);
  await writeFile(file, XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer);
  return file;
}
async function importSheet(kind: 'ads' | 'settlement', file: string) {
  const code = `import { readFileSync } from 'node:fs';
    import { getPool } from '@bric/db/client';
    import { ${kind === 'ads' ? 'importAdCostsSpreadsheet' : 'importStatsSpreadsheet'} } from './lib/${kind === 'ads' ? 'stats-ad-costs' : 'stats-order-import'}.ts';
    try { console.log(JSON.stringify(await ${kind === 'ads' ? 'importAdCostsSpreadsheet(readFileSync(process.argv[1]), 150, "parser-contract.xlsx")' : 'importStatsSpreadsheet(readFileSync(process.argv[1]), "parser-contract.xlsx")'})); }
    finally { await getPool().end(); }`;
  return execute(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', code, file], {
    cwd: process.cwd(),
    env: environment,
    timeout: 60_000,
    maxBuffer: 1024 * 1024,
  });
}

describe(
  'actual import entrypoints on a separately migrated disposable database',
  { timeout: 45_000 },
  () => {
    beforeAll(async () => {
      directory = await mkdtemp(join(tmpdir(), 'bric-import-contract-'));
      await control.query(`create database "${database}"`);
      const url = new URL(process.env.DATABASE_URL!);
      url.pathname = `/${database}`;
      environment = { ...process.env, DATABASE_URL: url.toString() };
      pool = new Pool({ connectionString: url.toString() });
      await child(resolve('scripts/run-db-migrations.ts'));
      await pool.query(`insert into brands(id,name,slug) values(1,'Retained brand','retained-brand');
      insert into products(id,title,slug,price,purchase_price,brand_id) values(1,'Retained product','retained-product',100,40,1);
      insert into orders(id,phone_number_1,cart_products) values(1,'0661920628',ARRAY['1']);
      insert into order_line_items(order_id,product_id,content_id,raw_value,title_snapshot,original_unit_price,effective_unit_price,quantity,line_total,unit_purchase_price_snapshot,purchase_cost_source)
      values(1,1,'1','1','Retained product',100,100,1,100,40,'catalog');`);
    }, 90_000);
    afterAll(async () => {
      await pool?.end();
      await control.query(`drop database if exists "${database}" with (force)`);
      await control.end();
      if (directory) await rm(directory, { recursive: true, force: true });
    });

    it('previews the same restricted scope and refuses cascading or invalid replacements before deleting', async () => {
      await exportsFor({ _id: 'missing-phone', state: 16 });
      const before = await counts();
      const preview = await importLegacy([
        '--replace',
        '--dry-run',
        '--drop-scope',
        'custom',
        '--drop-tables',
        'brands',
        '--json',
      ]);
      const plan = JSON.parse(preview.stdout.split('\nDry run')[0]);
      expect(plan.targets).toEqual(['brands']);
      expect(plan.replacement.tables).toEqual(['"public"."brands"']);
      expect(plan.replacement.outsideDependencies).toContainEqual({
        table: 'public.products',
        references: 'public.brands',
      });
      await expect(
        importLegacy(['--replace', '--drop-scope', 'custom', '--drop-tables', 'brands']),
      ).rejects.toThrow('outside the selected scope');
      expect(await counts()).toEqual(before);
      for (const skip of [[], ['--skip-blocked-orders']]) {
        await expect(importLegacy(['--replace', '--drop-scope', 'all', ...skip])).rejects.toThrow(
          'input orders failed validation',
        );
        expect(await counts()).toEqual(before);
      }
      await exportsFor({
        _id: 'unknown-wilaya',
        phoneNumber1: '0661920628',
        state: 'not-a-wilaya',
      });
      await expect(importLegacy(['--replace', '--drop-scope', 'all'])).rejects.toThrow(
        'input orders failed validation',
      );
      expect(await counts()).toEqual(before);
      for (const target of ['brands', 'categories', 'products']) {
        await exportsFor({
          _id: 'valid-order',
          phoneNumber1: '0661920628',
          state: 16,
          cartProducts: [],
        });
        await writeFile(
          join(directory, `mongo-${target}.json`),
          JSON.stringify([{ _id: `invalid-${target}` }]),
        );
        const preview = await importLegacy(['--dry-run', '--drop-scope', 'all', '--json']);
        expect(JSON.parse(preview.stdout.split('\nDry run')[0]).invalidDocuments).toContainEqual({
          target,
          mongoId: `invalid-${target}`,
          reason: expect.stringContaining('Missing'),
        });
        await expect(
          importLegacy(['--replace', '--drop-scope', 'all', '--skip-blocked-orders']),
        ).rejects.toThrow('selected documents failed validation');
        expect(await counts()).toEqual(before);
      }
    });

    it('persists localized amounts and dates, retains explicit zero, and rolls back malformed ad imports', async () => {
      await pool.query(
        `insert into admin.ad_costs(date,platform,campaign_name,spend) values('2026-08-31','facebook','Localized campaign',99)`,
      );
      const valid = await spreadsheet('ads.xlsx', [
        { Date: '31/08/2026', Campaign: 'Localized campaign', 'Amount spent': '12,50' },
      ]);
      await importSheet('ads', valid);
      expect(
        (
          await pool.query(
            `select spend from admin.ad_costs where campaign_name='Localized campaign'`,
          )
        ).rows,
      ).toEqual([{ spend: '1875.00' }]);
      const invalid = await spreadsheet('invalid-ads.xlsx', [
        { Date: '31/08/2026', Campaign: 'Localized campaign', 'Amount spent': 20 },
        { Date: '31/08/2026', Campaign: 'Localized campaign', 'Amount spent': 'broken' },
      ]);
      await expect(importSheet('ads', invalid)).rejects.toThrow('Invalid spreadsheet number');
      expect(
        (
          await pool.query(
            `select spend from admin.ad_costs where campaign_name='Localized campaign'`,
          )
        ).rows,
      ).toEqual([{ spend: '1875.00' }]);
      expect(
        (await pool.query('select count(*)::int as count from admin.ad_spend_import_batches'))
          .rows[0].count,
      ).toBe(1);

      const settlement = await spreadsheet('settlement.xlsx', [
        {
          Référence: '1',
          Tracking: 'LOCALIZED',
          Montant: '1 234,50 / 2 000,00',
          'Encaissé le': '31/08/2026',
          'Frais de livraison': '34,50',
        },
        {
          Référence: '1',
          Tracking: 'EXPLICIT-ZERO',
          Montant: 100,
          Encaissé: '0,00',
          'Total frais de service': 0,
          'Frais de livraison': 20,
          'Net recouvrement': 0,
        },
      ]);
      await importSheet('settlement', settlement);
      const rows = (
        await pool.query(
          `select tracking,amount_collected,total_fees,net_revenue,product_cost,profit,encaissed_at from admin.processed_orders order by tracking`,
        )
      ).rows;
      expect(rows).toMatchObject([
        {
          tracking: 'EXPLICIT-ZERO',
          amount_collected: '0.00',
          total_fees: '0.00',
          net_revenue: '0.00',
          product_cost: '40.00',
          profit: '-40.00',
        },
        {
          tracking: 'LOCALIZED',
          amount_collected: '1234.50',
          total_fees: '34.50',
          net_revenue: '1200.00',
          product_cost: '40.00',
          profit: '1160.00',
          encaissed_at: new Date('2026-08-31T00:00:00Z'),
        },
      ]);
      const badDate = await spreadsheet('invalid-date.xlsx', [
        { Référence: '1', Tracking: 'BAD-DATE', Montant: 100, 'Encaissé le': '31/02/2026' },
      ]);
      await expect(importSheet('settlement', badDate)).rejects.toThrow('Invalid spreadsheet date');
      expect(
        (await pool.query('select count(*)::int as count from admin.processed_orders')).rows[0]
          .count,
      ).toBe(2);
    });

    it('executes an explicitly broad valid replacement and preserves Mongo millisecond history', async () => {
      const instant = new Date('2024-01-01T00:00:00Z');
      await exportsFor({
        _id: 'valid-order',
        phoneNumber1: '0661920628',
        state: 16,
        cartProducts: ['new-product'],
        createdAt: { $date: instant.getTime() },
        updatedAt: { $date: { $numberLong: String(instant.getTime()) } },
      });
      await importLegacy(['--replace', '--drop-scope', 'all']);
      expect(await counts()).toEqual({ brands: 1, products: 1, orders: 1, lines: 0 });
      expect((await pool.query('select created_at from brands')).rows).toEqual([
        { created_at: instant },
      ]);
      expect((await pool.query('select mongo_id,created_at,updated_at from orders')).rows).toEqual([
        { mongo_id: 'valid-order', created_at: instant, updated_at: instant },
      ]);
    });
  },
);
