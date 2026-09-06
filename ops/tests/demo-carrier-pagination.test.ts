import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';

type OrderPage = { last_page: number; data: Array<{ status: string; tracking: string }> };

it('preserves imported historical outcomes and bounds provider-filtered order pages', async () => {
  const socket = createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const address = socket.address();
  if (!address || typeof address === 'string') throw new Error('Missing port');
  await new Promise<void>((done) => socket.close(() => done()));
  const child = spawn(
    process.execPath,
    [resolve(import.meta.dirname, '../demo/mock-services.mjs')],
    {
      env: { ...process.env, PORT: String(address.port) },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  const origin = `http://127.0.0.1:${address.port}`;
  try {
    await once(child.stdout!, 'data');
    const shipments = Array.from({ length: 250 }, (_, id) => ({
      tracking: `HISTORICAL-${id}`,
      reference: String(id),
      status: 'livre_non_encaisse',
      amount: 12000,
      provider: id < 205 ? 'delivro' : 'emir',
      createdAt: '2024-03-01T12:00:00Z',
    }));
    expect(
      (
        await fetch(`${origin}/__demo/shipments`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ shipments }),
        })
      ).status,
    ).toBe(200);
    const page = (await (
      await fetch(`${origin}/ecotrack/delivro/api/v1/get/orders?page=3`)
    ).json()) as OrderPage;
    expect(page.last_page).toBe(3);
    expect(page.data).toHaveLength(5);
    expect(page.data[0].status).toBe('livre_non_encaisse');
    const tracked = (await (
      await fetch(`${origin}/ecotrack/delivro/api/v1/get/orders?tracking=HISTORICAL-7`)
    ).json()) as OrderPage;
    expect(tracked.data).toHaveLength(1);
    expect(tracked.data[0].tracking).toBe('HISTORICAL-7');
    const emir = (await (
      await fetch(`${origin}/ecotrack/emir/api/v1/get/orders`)
    ).json()) as OrderPage;
    expect(emir.data).toHaveLength(45);
    const filtered = (await (
      await fetch(`${origin}/ecotrack/delivro/api/v1/get/orders?start_date=2025-01-01`)
    ).json()) as OrderPage;
    expect(filtered.data).toEqual([]);

    const carrier = `${origin}/ecotrack/delivro/api/v1`;
    const created = await fetch(`${carrier}/create/orders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        orders: { 73: { reference: '73', montant: 5000, nom_client: 'Demo customer' } },
      }),
    });
    expect(created.status).toBe(200);
    const tracking = 'DLD00000073';
    const info = async () =>
      (await fetch(`${carrier}/get/tracking/info?tracking=${tracking}`)).json();
    expect(await info()).toMatchObject({
      status: 'prete_a_expedier',
      recipientName: 'Demo customer',
    });
    await fetch(`${carrier}/update/order?tracking=${tracking}&montant=6200&nom_client=Updated`, {
      method: 'POST',
    });
    expect(await info()).toMatchObject({
      recipientName: 'Updated',
      OrderInfo: { montant: '6200' },
    });

    // Parse and merge through the same PDF library as the real label API.
    const { PDFDocument } = createRequire(
      resolve(import.meta.dirname, '../../apps/admin/package.json'),
    )('pdf-lib');
    const label = await fetch(`${carrier}/get/order/label?tracking=${tracking}`);
    const document = await PDFDocument.load(await label.arrayBuffer());
    expect(document.getPageCount()).toBe(1);
    const merged = await PDFDocument.create();
    const [pageToCopy] = await merged.copyPages(document, [0]);
    merged.addPage(pageToCopy);
    expect((await merged.save()).length).toBeGreaterThan(100);

    await fetch(`${carrier}/valid/order?tracking=${tracking}`, { method: 'POST' });
    expect(await info()).toMatchObject({ status: 'en_ramassage' });
    await fetch(`${carrier}/add/maj?tracking=${tracking}&content=Call%20after%2017h`, {
      method: 'POST',
    });
    expect(await (await fetch(`${carrier}/get/maj?tracking=${tracking}`)).json()).toEqual([
      expect.objectContaining({ remarque: 'Call after 17h', tracking }),
    ]);
    await fetch(`${carrier}/ask/for/order/return?tracking=${tracking}`, { method: 'POST' });
    expect(await info()).toMatchObject({ status: 'retour_en_traitement' });
    await fetch(`${carrier}/delete/order?tracking=${tracking}`, { method: 'DELETE' });
    expect((await fetch(`${carrier}/get/tracking/info?tracking=${tracking}`)).status).toBe(404);
  } finally {
    child.kill('SIGTERM');
    await once(child, 'exit');
  }
});
