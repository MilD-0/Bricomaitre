import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
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
  } finally {
    child.kill('SIGTERM');
    await once(child, 'exit');
  }
});
