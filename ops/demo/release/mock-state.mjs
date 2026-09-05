import { execFileSync } from 'node:child_process';

const container = process.env.DEMO_POSTGRES_CONTAINER;
const origin = process.env.DEMO_MOCK_ORIGIN ?? 'http://mock-services:8080';
async function post(path, body) {
  const response = await fetch(`${origin}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Demo provider initialization failed: ${response.status}`);
}

let afterId = 0;
let total = 0;
while (true) {
  const sql = `SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', shipment.id,
      'tracking', shipment.tracking_number, 'reference', shipment.reference,
      'status', shipment.current_status, 'amount', shipment.current_amount,
      'provider', shipment.provider, 'createdAt', shipment.provider_created_at
    ) ORDER BY shipment.id), '[]'::jsonb)
    FROM (SELECT * FROM admin.ecotrack_order_states
      WHERE deleted_at IS NULL AND id > ${afterId}
      ORDER BY id LIMIT 1000) shipment`;
  const args = ['-X', '-U', 'bricomaitre_demo_owner', '-d', 'bricomaitre_demo', '-Atc', sql];
  const shipments = JSON.parse(
    execFileSync(
      container ? 'docker' : 'psql',
      container ? ['exec', '-i', container, 'psql', ...args] : ['-h', 'postgres', ...args],
      { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 },
    ),
  );
  if (!shipments.length) break;
  await post('/__demo/shipments', { shipments });
  afterId = shipments[shipments.length - 1].id;
  total += shipments.length;
}
console.log(`Demo provider shipments are ready: ${total}.`);
