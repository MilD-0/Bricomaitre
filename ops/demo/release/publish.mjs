import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cp, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { verifyPublicImages } from './verify-public.mjs';

// Invoked only by the explicit publish job after both native installation gates.
const [amd64Directory, arm64Directory, destination] = process.argv.slice(2);
if (!destination) throw new Error('Usage: publish.mjs <amd64-bundle> <arm64-bundle> <output>');
const bundles = [resolve(amd64Directory), resolve(arm64Directory)];
const manifests = await Promise.all(
  bundles.map(async (directory) =>
    JSON.parse(await readFile(resolve(directory, 'release.json'), 'utf8')),
  ),
);
const [base, arm] = manifests;
assert.equal(base.version, arm.version);
assert.equal(base.revision, arm.revision);
assert.deepEqual(base.platforms, ['linux/amd64']);
assert.deepEqual(arm.platforms, ['linux/arm64']);
assert.deepEqual(Object.keys(base.images).sort(), Object.keys(arm.images).sort());
assert.equal(
  await readFile(resolve(bundles[0], 'MEDIA-SHA256SUMS'), 'utf8'),
  await readFile(resolve(bundles[1], 'MEDIA-SHA256SUMS'), 'utf8'),
  'Native builds must package identical media',
);
const output = resolve(destination);
await cp(bundles[0], output, { recursive: true });
let compose = await readFile(resolve(output, 'compose.yaml'), 'utf8');
const images = {};
for (const [name, amdImage] of Object.entries(base.images)) {
  const tag = amdImage.replace(/-amd64$/, '');
  assert.equal(arm.images[name], `${tag}-arm64`);
  execFileSync(
    'docker',
    ['buildx', 'imagetools', 'create', '-t', tag, amdImage, arm.images[name]],
    { stdio: 'inherit' },
  );
  const inspection = execFileSync('docker', ['buildx', 'imagetools', 'inspect', tag], {
    encoding: 'utf8',
  });
  const digest = /^Digest:\s+(sha256:[a-f0-9]{64})$/m.exec(inspection)?.[1];
  assert.ok(digest, `No registry digest for ${tag}`);
  images[name] = `${tag}@${digest}`;
  compose = compose.replaceAll(amdImage, images[name]);
}
await writeFile(resolve(output, 'compose.yaml'), compose);
await writeFile(
  resolve(output, 'release.json'),
  `${JSON.stringify(
    {
      ...base,
      platforms: ['linux/amd64', 'linux/arm64'],
      images,
    },
    null,
    2,
  )}\n`,
);
execFileSync('docker', ['compose', '-f', resolve(output, 'compose.yaml'), 'config', '--quiet'], {
  stdio: 'inherit',
});
// A login-free pull is part of the release contract. Public source repositories
// do not automatically guarantee public package visibility.
if (process.env.DEMO_PRIVATE_DRAFT === '1') {
  console.log(
    `Private draft bundle: ${output}. Run verify-public.mjs before publishing the release.`,
  );
} else {
  await verifyPublicImages(images);
  console.log(`Public multi-architecture bundle: ${output}`);
}
