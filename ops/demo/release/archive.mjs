import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';

const bundle = resolve(process.argv[2]);
const parent = dirname(bundle);
const release = JSON.parse(await readFile(resolve(bundle, 'release.json'), 'utf8'));
const archive = `bricomaitre-demo-${release.version}.tar.gz`;
execFileSync('tar', ['-czf', resolve(parent, archive), '-C', parent, basename(bundle)], {
  stdio: 'inherit',
});
const digest = createHash('sha256')
  .update(await readFile(resolve(parent, archive)))
  .digest('hex');
await writeFile(resolve(parent, `${archive}.sha256`), `${digest}  ${archive}\n`);
console.log(resolve(parent, archive));
