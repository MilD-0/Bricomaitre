import { getDb, getPool } from '@bric/db/client';
import { saveAdminAiShoppingList } from '../lib/admin-ai-shopping-list';
import { updateAdminOrder } from '../lib/admin-order-update';

export const matrixActor = { email: 'matrix@example.invalid', name: 'Local matrix operator' };

export async function assertMatrixIsolation() {
  const database = new URL(process.env.DATABASE_URL ?? '');
  const redis = new URL(process.env.REDIS_URL ?? '');
  if (
    process.env.ADMIN_AI_EVAL_HARNESS !== '1' ||
    !/^\/bric_ai_eval_[a-f0-9]{32}$/.test(database.pathname) ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(database.hostname) ||
    redis.hostname !== '127.0.0.1' ||
    redis.port === '6379'
  ) {
    throw new Error('Real eval writes require the disposable matrix database and Redis.');
  }
  const { rows } = await getPool().query('select current_database() as name');
  if (`/${rows[0].name}` !== database.pathname) throw new Error('Unexpected connected database');
}

export async function seedMatrixFixtures() {
  await assertMatrixIsolation();
  const pool = getPool();
  // Copied manual picking rows are unrelated to this run's known order selection.
  await pool.query('delete from admin.shopping_list_drafts');
  // Add a small known set to the local clone. Historical read evidence stays intact.
  await pool.query(`insert into products(id,title,slug,price,purchase_price,active,in_stock,availability_status,inventory_quantity,barcode)
    values (12,'Perceuse atelier','matrix-drill',4500,3000,true,true,'in_stock',250,'DRILL-12')
    on conflict(id) do nothing`);
  await pool.query(`insert into products(title,title_ar,slug,price,purchase_price,active,in_stock,availability_status,inventory_quantity)
    values ('Marteau atelier','مطرقة الورشة','matrix-hammer',1200,800,true,false,'out_of_stock',50),
    ('Ancien outil atelier',null,'matrix-inactive',900,500,false,false,'out_of_stock',4)
    on conflict(slug) do nothing`);
  await pool.query(`insert into orders(id,first_name,last_name,phone_number_1,normalized_phone,state,city,home_address,delivery,cart_products,confirmed,created_at,updated_at)
    select fixture.id,'Ahmed','Atelier','0550123456','0550123456',16,'Alger Centre','12 rue Didouche Mourad',0,ARRAY['12','12'],0,now(),now()
    from (values (500001,0),(500002,2),(500003,6),(500004,11)) fixture(id,status)
    on conflict(id) do nothing`);
  // Stable numeric identifiers remain ordinary order numbers in the prompts.
  await pool.query(
    `select setval(pg_get_serial_sequence('orders','id'),(select max(id) from orders),true)`,
  );
  await pool.query(
    `select setval(pg_get_serial_sequence('products','id'),(select max(id) from products),true)`,
  );
  for (const id of [500001, 500002, 500003, 500004]) {
    await updateAdminOrder(getDb(), id, { cartProducts: ['12', '12'] }, matrixActor);
  }
  for (const [id, inHouseStatus] of [
    [500002, 2],
    [500003, 6],
    [500004, 2],
    [500004, 11],
  ] as const) {
    await updateAdminOrder(getDb(), id, { inHouseStatus }, matrixActor);
  }
  await pool.query(`insert into admin.ecotrack_order_states(order_id,reference,provider,tracking_number,current_status,last_status_synced_at,last_tracking_synced_at,last_order_synced_at)
    values(500004,'500004','delivro','MATRIX500004','prete_a_expedier',now(),now(),now())
    on conflict(order_id) do nothing`);
  await pool.query(
    `update orders set ecotrack_tracking_number='MATRIX500004',ecotrack_reference='500004',ecotrack_status='prete_a_expedier' where id=500004`,
  );
  await pool.query(
    `update admin.ecotrack_order_states s set current_amount=o.total_amount
     from orders o where s.order_id=500004 and o.id=s.order_id`,
  );
  const { rows } = await pool.query(
    `insert into ai_conversations(surface,actor_id,title) values('admin',$1,'Local write matrix') returning id`,
    [matrixActor.email],
  );
  const base = process.env.ADMIN_AI_EVAL_PROVIDER_ORIGIN!;
  // Mirror existing stored shipments into this run's private provider simulator.
  const shipments = (
    await pool.query(`select tracking_number as tracking,reference,current_status as status,provider,
    coalesce(current_amount,0)::float as amount,created_at as "createdAt",coalesce(raw_create_payload,'{}'::jsonb) as input
    from admin.ecotrack_order_states where deleted_at is null and tracking_number is not null`)
  ).rows;
  for (let offset = 0; offset < shipments.length; offset += 2000) {
    const imported = await fetch(`${base}/__demo/shipments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ shipments: shipments.slice(offset, offset + 2000) }),
    });
    if (!imported.ok) throw new Error('Cannot seed private carrier simulator');
  }
  await saveAdminAiShoppingList(
    { sourceMode: 'selected', orderIds: [500002], title: 'Warehouse picking' },
    matrixActor,
  );
  return Number(rows[0].id);
}
