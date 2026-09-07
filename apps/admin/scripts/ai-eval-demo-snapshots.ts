import { getPool } from '@bric/db/client';

// Full before/after rows for the matrix's exact order targets; a table-wide
// transaction fingerprint detects unexpected writes elsewhere without loading
// a million historical order lines into the Node process for every turn.
export async function demoOrderSnapshot(table: string, quoted: string) {
  if (process.env.ADMIN_AI_EVAL_SOURCE !== 'demo') return null;
  const key = (
    {
      orders: 'id',
      order_line_items: 'order_id',
      order_status_history: 'order_id',
      'admin.ecotrack_order_states': 'order_id',
    } as Record<string, string>
  )[table];
  if (!key) return null;
  const scope = `(${key} = 16360 or ${key} >= 500001)`;
  const rows = await getPool().query(`
    select to_jsonb(t) as row from ${quoted} t where ${scope}
    union all
    select jsonb_build_object('id','other-order-rows','count',count(*),
      'transactionFingerprint',bit_xor(hashtextextended(id::text || ':' || xmin::text,0))::text)
    from ${quoted} where not ${scope}`);
  return rows.rows.map((row) => row.row);
}
