import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const [operation, input, revisionOrNotes] = process.argv.slice(2);
const repository = process.env.GITHUB_REPOSITORY;
assert.ok(repository, 'GITHUB_REPOSITORY is required');
assert.ok(['prepare', 'publish'].includes(operation), 'Expected prepare or publish');
const manifest =
  operation === 'publish'
    ? JSON.parse(readFileSync(resolve(input, 'release.json'), 'utf8'))
    : { version: input, revision: revisionOrNotes };
assert.match(manifest.version, /^[A-Za-z0-9][A-Za-z0-9._-]*$/);
assert.match(manifest.revision, /^[a-f0-9]{40}$/);
const tag = `demo-${manifest.version}`;
const apiRoot = `repos/${repository}`;
const gh = (...args) =>
  execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const api = (...args) => JSON.parse(gh('api', ...args));

function releaseExists() {
  try {
    const release = JSON.parse(
      gh('release', 'view', tag, '--repo', repository, '--json', 'isDraft'),
    );
    assert.equal(release.isDraft, true, 'A published demo release cannot be overwritten');
    return true;
  } catch (error) {
    if (error.status && /release not found/i.test(String(error.stderr))) return false;
    throw error;
  }
}

function verifyTag() {
  const refs = api(`${apiRoot}/git/matching-refs/tags/${tag}`);
  let object = refs.find((ref) => ref.ref === `refs/tags/${tag}`)?.object;
  if (!object) return false;
  for (let depth = 0; object.type === 'tag' && depth < 10; depth++) {
    object = api(`${apiRoot}/git/tags/${object.sha}`).object;
  }
  assert.equal(object.type, 'commit', 'Demo tag must resolve to a commit');
  assert.equal(object.sha, manifest.revision, 'Demo tag belongs to a different source revision');
  return true;
}

const existingRelease = releaseExists();
if (operation === 'prepare') {
  // Reserve the revision before native builds run and main can advance. Historical
  // revisions may require an operator-created tag because GITHUB_TOKEN cannot
  // grant itself workflow-write permission.
  if (!verifyTag()) {
    api(
      `${apiRoot}/git/refs`,
      '--method',
      'POST',
      '-f',
      `ref=refs/tags/${tag}`,
      '-f',
      `sha=${manifest.revision}`,
    );
    assert.ok(verifyTag(), 'Created demo tag could not be verified');
  }
  console.log(`Reserved ${tag} at ${manifest.revision}`);
} else {
  assert.ok(verifyTag(), 'Reserve the demo tag before building the release');
  const archive = resolve(dirname(resolve(input)), `bricomaitre-demo-${manifest.version}.tar.gz`);
  if (existingRelease) {
    gh('release', 'upload', tag, archive, `${archive}.sha256`, '--repo', repository, '--clobber');
  } else {
    // Do not send target_commitish for an existing tag: a historical workflow
    // revision can otherwise trigger GitHub's workflow-write permission check.
    gh(
      'release',
      'create',
      tag,
      archive,
      `${archive}.sha256`,
      '--repo',
      repository,
      '--verify-tag',
      '--draft',
      '--title',
      `Bricomaitre demo ${manifest.version}`,
      '--notes-file',
      revisionOrNotes,
    );
  }
  console.log(`Draft ${tag} contains the verified bundle and checksum`);
}
