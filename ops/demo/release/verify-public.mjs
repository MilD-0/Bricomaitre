import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function verifyPublicImages(images, fetchImpl = fetch) {
  for (const reference of Object.values(images)) {
    const [, path, digest] =
      /^ghcr\.io\/([^:]+):[^@]+@(sha256:[a-f0-9]{64})$/.exec(reference) ?? [];
    assert.ok(path && digest, 'Expected a digest-pinned GHCR image');
    const auth = await fetchImpl(
      `https://ghcr.io/token?service=ghcr.io&scope=repository:${path}:pull`,
    );
    assert.equal(auth.status, 200, `Make ${path} public in GitHub package settings`);
    const { token } = await auth.json();
    const manifest = await fetchImpl(`https://ghcr.io/v2/${path}/manifests/${digest}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.oci.image.index.v1+json',
      },
    });
    assert.equal(manifest.status, 200, `Anonymous pull failed for ${path}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const release = JSON.parse(await readFile(resolve(process.argv[2], 'release.json'), 'utf8'));
  await verifyPublicImages(release.images);
  console.log('Every demo image is digest-pinned and anonymously accessible.');
}
