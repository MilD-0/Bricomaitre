import { expect, it, vi } from 'vitest';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const { verifyPublicImages } = (await import(
  pathToFileURL(resolve(import.meta.dirname, '../demo/release/verify-public.mjs')).href
)) as {
  verifyPublicImages: (images: Record<string, string>, fetchImpl?: typeof fetch) => Promise<void>;
};

const images = {
  admin: `ghcr.io/mild-0/bricomaitre-demo/admin:2026.09.05@sha256:${'a'.repeat(64)}`,
};

it('checks digest-pinned images using anonymous registry credentials', async () => {
  const request = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ token: 'anonymous-test-token' })))
    .mockResolvedValueOnce(new Response('{}'));
  await verifyPublicImages(images, request);
  expect(request).toHaveBeenCalledTimes(2);
  expect(request.mock.calls[0][0]).toContain('scope=repository:mild-0/bricomaitre-demo/admin:pull');
  expect(request.mock.calls[1][0]).toContain(`/manifests/sha256:${'a'.repeat(64)}`);
});

it('rejects private packages, missing manifests, and unpinned images', async () => {
  await expect(
    verifyPublicImages(images, vi.fn().mockResolvedValue(new Response('', { status: 403 }))),
  ).rejects.toThrow('public in GitHub');
  const missing = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ token: 'anonymous-test-token' })))
    .mockResolvedValueOnce(new Response('', { status: 404 }));
  await expect(verifyPublicImages(images, missing)).rejects.toThrow('Anonymous pull failed');
  await expect(
    verifyPublicImages({ admin: 'ghcr.io/mild-0/bricomaitre-demo/admin:latest' }),
  ).rejects.toThrow('digest-pinned');
});
