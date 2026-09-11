import { getPool } from '@bric/db/client';
import type { ToolSet } from 'ai';
import { demoOrderSnapshot } from './ai-eval-demo-snapshots';

const product = ['products'];
const order = ['orders', 'order_line_items', 'order_status_history'];
const carrier = [...order, 'admin.ecotrack_order_states'];
const assets = [
  'asset_banners',
  'product_cards',
  'featured_product_groups',
  'featured_product_group_products',
  'featured_product_group_brands',
  'featured_product_group_categories',
];
const pages = ['landing_pages', 'landing_page_revisions'];
export const writeTables: Record<string, string[]> = {
  create_product: product,
  update_products: product,
  archive_products: product,
  restore_products: product,
  adjust_inventory: product,
  receive_inventory: product,
  update_inventory_state: product,
  manage_taxonomy: ['brands', 'categories', ...product],
  generate_product_content: ['ai_proposals', ...product],
  categorize_catalog: ['ai_proposals', ...product],
  manage_assets: assets,
  reorder_assets: assets,
  start_landing_page_work: pages,
  set_landing_page_active: pages,
  create_order: order,
  update_order_status: order,
  update_order_details: order,
  delete_orders: carrier,
  post_orders_to_ecotrack: carrier,
  manage_ecotrack_shipments: carrier,
  change_ecotrack_shipments: carrier,
  save_order_shopping_list: ['admin.shopping_list_drafts'],
  apply_order_shopping_list_inventory: ['admin.shopping_list_drafts', ...product],
  get_order_tracking_links: ['orders'],
  start_order_export: ['orders'],
  update_analytics_settings: ['admin.profit_tracker_settings'],
  manage_analytics_costs: ['admin.profit_tracker_operating_costs'],
  manage_analytics_day_overrides: ['admin.profit_tracker_days'],
  manage_off_pipeline_sales: ['admin.off_pipeline_sales'],
  sync_analytics_source: [
    'meta_ads_daily_insights',
    'meta_ads_sync_runs',
    'search_console_daily_totals',
    'search_console_sync_runs',
    'admin.profit_tracker_days',
  ],
  update_storefront_settings: ['storefront_settings'],
  update_storefront_announcement: ['storefront_announcements'],
};

type Row = Record<string, unknown>;
type Snapshot = Record<string, Row[]>;
export type WriteEvidence = {
  toolName: string;
  input: unknown;
  output?: unknown;
  error?: string;
  changes: Array<{ table: string; before: Row | null; after: Row | null }>;
  checks: Array<{ description: string; passed: boolean }>;
};

export async function snapshotTables(tables: string[]): Promise<Snapshot> {
  return Object.fromEntries(
    await Promise.all(
      tables.map(async (table) => {
        if (!Object.values(writeTables).flat().includes(table))
          throw new Error('Unknown snapshot table');
        const quoted = table
          .split('.')
          .map((part) => `"${part}"`)
          .join('.');
        return [
          table,
          (await demoOrderSnapshot(table, quoted)) ??
            (await getPool().query(`select to_jsonb(t) as row from ${quoted} t`)).rows.map(
              (r) => r.row,
            ),
        ];
      }),
    ),
  );
}

function rowKey(row: Row) {
  if (row.id !== undefined) return String(row.id);
  if (row.day !== undefined) return String(row.day);
  return JSON.stringify(row);
}

export function diffSnapshots(before: Snapshot, after: Snapshot): WriteEvidence['changes'] {
  return Object.keys(before).flatMap((table) => {
    const previous = new Map(before[table].map((row) => [rowKey(row), row]));
    const current = new Map(after[table].map((row) => [rowKey(row), row]));
    return [...new Set([...previous.keys(), ...current.keys()])].flatMap((key) => {
      const a = previous.get(key) ?? null;
      const b = current.get(key) ?? null;
      return JSON.stringify(a) === JSON.stringify(b) ? [] : [{ table, before: a, after: b }];
    });
  });
}

function same(a: unknown, b: unknown) {
  return (
    JSON.stringify(a) === JSON.stringify(b) ||
    ((typeof a === 'number' || typeof b === 'number') &&
      a != null &&
      b != null &&
      Number(a) === Number(b))
  );
}
const column = (name: string) => name.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);

// Checks compare requested values to independently read SQL rows, not mutation receipts.
export function inputChecks(name: string, raw: unknown, before: Snapshot, after: Snapshot) {
  const input = raw as {
    items?: Array<{
      productId?: number;
      orderId?: number;
      quantity?: number;
      changes?: Row;
      operations?: Array<{ field: string; value: unknown }>;
    }>;
    mode?: string;
    productIds?: number[];
    orderIds?: number[];
    planningReturnRate?: number;
  };
  const checks: WriteEvidence['checks'] = [];
  const add = (description: string, passed: boolean) => checks.push({ description, passed });
  const request = raw as Record<string, unknown>;
  const matches = (row: Row | undefined, values: Row, aliases: Record<string, string> = {}) =>
    Boolean(row) &&
    Object.entries(values).every(([key, value]) => same(row![aliases[key] ?? column(key)], value));
  if (name === 'create_product') {
    const created = after.products.filter(
      (row) => !before.products.some((old) => old.id === row.id),
    );
    add(
      'new product saved with requested price, cost and visibility',
      created.some((row) =>
        matches(
          row,
          Object.fromEntries(
            ['title', 'price', 'purchasePrice', 'active', 'inStock']
              .filter((key) => request[key] !== undefined)
              .map((key) => [key, request[key]]),
          ),
        ),
      ),
    );
  }
  if (name === 'update_storefront_settings') {
    const operations = request.operations as Array<{ field: string; value: unknown }>;
    const values = Object.fromEntries(operations.map((op) => [op.field, op.value]));
    const saved = after.storefront_settings[0];
    add('requested storefront settings saved', matches(saved, values));
    const allowed = new Set(['updated_at', ...Object.keys(values).map(column)]);
    add(
      'other storefront settings preserved',
      Object.entries(before.storefront_settings[0]).every(
        ([key, value]) => allowed.has(key) || same(saved[key], value),
      ),
    );
  }
  if (name === 'update_storefront_announcement') {
    for (const [locale, key] of [
      ['fr', 'messageFr'],
      ['ar', 'messageAr'],
    ]) {
      add(
        `${locale} announcement text and visibility saved`,
        after.storefront_announcements.some(
          (row) =>
            row.locale === locale && row.message === request[key] && row.active === request.active,
        ),
      );
    }
  }
  if (name === 'manage_taxonomy' || name === 'manage_assets') {
    const entity = (request.entity ?? request.asset) as {
      kind: string;
      id?: number;
      data?: Row;
      changes?: Row;
    };
    const table = (
      {
        brand: 'brands',
        category: 'categories',
        banner: 'asset_banners',
        'product-card': 'product_cards',
        'featured-group': 'featured_product_groups',
      } as Record<string, string>
    )[entity.kind];
    const rows = after[table] ?? [];
    const saved = entity.id
      ? rows.find((row) => Number(row.id) === entity.id)
      : rows.find((row) => !(before[table] ?? []).some((old) => old.id === row.id));
    if (request.operation === 'delete') add('requested record deleted', !saved);
    else {
      const fields = entity.changes ?? entity.data ?? {};
      const scalars = Object.fromEntries(
        Object.entries(fields)
          .filter(([, value]) => !Array.isArray(value))
          .map(([key, value]) =>
            name === 'manage_taxonomy' && key === 'status'
              ? ['is_active', value === 'active']
              : [key, value],
          ),
      );
      add(
        'requested record fields saved',
        matches(saved, scalars, {
          prioritizeRecommendations: 'show_at_top_of_products_page',
          imageUrl: 'image',
        }),
      );
    }
  }
  if (name === 'reorder_assets') {
    const table = (
      {
        banner: 'asset_banners',
        'product-card': 'product_cards',
        'featured-group': 'featured_product_groups',
      } as Record<string, string>
    )[String(request.kind)];
    add(
      'complete requested asset order saved',
      same(
        [...after[table]]
          .sort((a, b) => Number(a.sort_order) - Number(b.sort_order))
          .map((row) => Number(row.id)),
        request.orderedIds,
      ),
    );
  }
  if (name === 'set_landing_page_active') {
    const page = after.landing_pages.find((row) => Number(row.id) === request.landingPageId);
    add('publication state saved', page?.status === (request.active ? 'published' : 'draft'));
    const latestDocument = (snapshot: Snapshot) =>
      [...snapshot.landing_page_revisions]
        .filter((row) => Number(row.landing_page_id) === request.landingPageId)
        .sort((a, b) => Number(b.revision) - Number(a.revision))[0]?.document;
    // Canonical page writes force SEO indexability off, including legacy revisions.
    const content = (document: unknown) => {
      const value = document as Row | undefined;
      return value ? { ...value, seo: { ...(value.seo as Row), indexable: false } } : value;
    };
    add(
      'page uses canonical no-index policy',
      ((latestDocument(after) as Row | undefined)?.seo as Row | undefined)?.indexable === false,
    );
    add(
      'page content unchanged except canonical no-index policy',
      same(content(latestDocument(before)), content(latestDocument(after))),
    );
  }
  if (name === 'manage_analytics_costs') {
    for (const operation of request.operations as Row[]) {
      const rows = after['admin.profit_tracker_operating_costs'];
      const saved = operation.id
        ? rows.find((row) => Number(row.id) === operation.id)
        : rows.find((row) => row.name === operation.name);
      const action = operation.action;
      const values = Object.fromEntries(
        Object.entries(operation).filter(([key]) => key !== 'action' && key !== 'id'),
      );
      add(
        `operating expense ${operation.id ?? operation.name} saved`,
        action === 'delete' ? !saved : matches(saved, (operation.changes ?? values) as Row),
      );
    }
  }
  if (name === 'manage_analytics_day_overrides') {
    for (const operation of request.operations as Row[]) {
      const saved = after['admin.profit_tracker_days'].find((row) => row.day === operation.date);
      add(
        `day ${operation.date}: requested override saved`,
        operation.action === 'reset'
          ? !saved
          : matches(saved, operation.changes as Row, { planningReturnRate: 'return_rate_pct' }),
      );
    }
  }
  if (name === 'manage_off_pipeline_sales') {
    for (const operation of request.operations as Row[]) {
      const rows = after['admin.off_pipeline_sales'];
      const saved = operation.id
        ? rows.find((row) => Number(row.id) === operation.id)
        : rows.find((row) => row.reference === operation.reference);
      const values = Object.fromEntries(
        Object.entries(operation).filter(([key]) => !['action', 'id', 'requestId'].includes(key)),
      );
      add(
        `off-pipeline sale ${operation.id ?? operation.reference} saved`,
        operation.action === 'delete'
          ? !saved
          : matches(saved, (operation.changes ?? values) as Row, {
              recognizedOn: 'recognized_on',
              amountCollectedDzd: 'amount_collected',
              feesDzd: 'fees',
              productCostDzd: 'product_cost',
            }),
      );
    }
  }
  if (name === 'update_order_status') {
    const statuses = {
      not_contacted: 0,
      no_answer: 1,
      confirmed: 2,
      dispatched: 3,
      completed: 4,
      delayed: 5,
      cancelled: 6,
      in_delivery: 7,
      returned: 8,
      failed: 9,
      manual_completed: 10,
      posted: 11,
    } as Record<string, number>;
    for (const item of request.items as Row[]) {
      add(
        `order ${item.orderId}: status saved`,
        after.orders.some(
          (row) =>
            Number(row.id) === item.orderId &&
            Number(row.confirmed) === statuses[String(item.status)],
        ),
      );
    }
  }
  if (name === 'get_order_tracking_links')
    for (const id of input.orderIds ?? []) {
      add(
        `order ${id}: usable tracking token saved`,
        after.orders.some(
          (row) =>
            Number(row.id) === id &&
            typeof row.public_token === 'string' &&
            Date.parse(String(row.public_token_expires_at)) > Date.now(),
        ),
      );
    }
  if (
    ['update_products', 'adjust_inventory', 'receive_inventory', 'update_inventory_state'].includes(
      name,
    )
  ) {
    for (const item of input.items ?? []) {
      const old = before.products.find((row) => Number(row.id) === item.productId);
      const saved = after.products.find((row) => Number(row.id) === item.productId);
      const requested =
        item.changes ??
        Object.fromEntries((item.operations ?? []).map((op) => [op.field, op.value]));
      for (const [field, value] of Object.entries(requested)) {
        add(
          `product ${item.productId}: ${field} saved`,
          Boolean(saved) && same(saved![column(field)], value),
        );
      }
      if (item.quantity !== undefined)
        add(
          `product ${item.productId}: requested stock delta`,
          Boolean(old && saved) &&
            Number(saved!.inventory_quantity) ===
              Number(old!.inventory_quantity) +
                item.quantity * (input.mode === 'decrease' ? -1 : 1),
        );
      const allowed = new Set(['updated_at', ...Object.keys(requested).map(column)]);
      if (item.quantity !== undefined) {
        allowed.add('inventory_quantity');
        allowed.add('in_stock');
        allowed.add('availability_status');
      }
      if ('inStock' in requested) allowed.add('availability_status');
      if (old && saved)
        add(
          `product ${item.productId}: unrequested fields preserved`,
          Object.keys(old).every((key) => allowed.has(key) || same(old[key], saved[key])),
        );
    }
  }
  if (name === 'update_analytics_settings')
    add(
      'planning return rate saved',
      Number(after['admin.profit_tracker_settings'][0]?.default_return_rate) ===
        input.planningReturnRate,
    );
  if (name === 'delete_orders')
    for (const id of input.orderIds ?? [])
      add(`order ${id}: deleted`, !after.orders.some((row) => Number(row.id) === id));
  if (name === 'archive_products' || name === 'restore_products')
    for (const id of input.productIds ?? []) {
      const row = after.products.find((row) => Number(row.id) === id);
      add(
        `product ${id}: requested archive state`,
        Boolean(row) &&
          (name === 'archive_products' ? row!.archived_at != null : row!.archived_at == null),
      );
    }
  return checks;
}

export function observeWriteTools(tools: ToolSet, evidence: WriteEvidence[]): ToolSet {
  return Object.fromEntries(
    Object.entries(tools).map(([toolName, tool]) => {
      const execute = tool.execute;
      if (!writeTables[toolName] || !execute) return [toolName, tool];
      return [
        toolName,
        {
          ...tool,
          execute: async (...args: Parameters<typeof execute>) => {
            const before = await snapshotTables(writeTables[toolName]);
            const record: WriteEvidence = { toolName, input: args[0], changes: [], checks: [] };
            try {
              const output = await execute(...args);
              record.output = output;
              return output;
            } catch (error) {
              record.error = error instanceof Error ? error.message : String(error);
              throw error;
            } finally {
              // Jobs remain asynchronous to the model; drain after the turn separately.
              const after = await snapshotTables(writeTables[toolName]);
              record.changes = diffSnapshots(before, after);
              record.checks = inputChecks(toolName, args[0], before, after);
              evidence.push(record);
            }
          },
        },
      ];
    }),
  );
}
