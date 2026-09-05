import { execFileSync } from 'node:child_process';

async function post(path, body) {
  const response = await fetch(`http://mock-services:8080${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Demo provider initialization failed: ${response.status}`);
}

const shipments = JSON.parse(
  execFileSync(
    'psql',
    [
      '-X',
      '-h',
      'postgres',
      '-U',
      'bricomaitre_demo_owner',
      '-d',
      'bricomaitre_demo',
      '-Atc',
      `SELECT jsonb_build_object('shipments', coalesce(jsonb_agg(jsonb_build_object(
      'tracking', shipment.tracking_number, 'reference', shipment.reference,
      'status', shipment.current_status, 'amount', shipment.current_amount,
      'provider', shipment.provider, 'createdAt', shipment.provider_created_at
    )), '[]'::jsonb))
    FROM admin.ecotrack_order_states shipment JOIN orders ON orders.id = shipment.order_id
    WHERE orders.mongo_id LIKE 'demo-live-order:%' AND shipment.deleted_at IS NULL`,
    ],
    { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
  ),
);
await post('/__demo/shipments', shipments);
console.log('Demo provider shipments are ready.');
