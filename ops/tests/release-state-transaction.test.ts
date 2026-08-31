import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const workspaceRoot = resolve(import.meta.dirname, '../..');
const blueGreenScript = resolve(workspaceRoot, 'ops/scripts/blue-green.sh');
const temporaryDirectories: string[] = [];

const commonReleaseFiles = [
  'ops/scripts/deploy.sh',
  'ops/docker/compose.prod.yml',
  'ops/nginx/nginx.conf',
  'ops/nginx/templates/default.conf.template',
  '.bric-images.env',
];
const publicLegalFiles = [
  'LICENSE',
  'NOTICE',
  'SECURITY.md',
  'ASSET-LICENSING.md',
  'THIRD_PARTY_NOTICES.md',
  'third_party/licenses/GPL-3.0-only.txt',
  'third_party/licenses/LGPL-3.0-or-later.txt',
  'third_party/licenses/SHARP-LIBVIPS-THIRD-PARTY-NOTICES.md',
  'third_party/licenses/SHARP-LIBVIPS-VERSIONS.json',
];
const legacyLegalFiles = [
  'ops/ownership/AI_AGENT_BOUNDARY.md',
  'ops/ownership/BRICOMAITRE_AUTHORIZED_RELEASE.txt',
  'ops/ownership/AI_POLICY.md',
  'ops/ownership/LICENSE',
  'ops/ownership/NOTICE',
  'ops/ownership/SECURITY.md',
  'AGENTS.md',
  'CLAUDE.md',
  'LICENSE',
  'NOTICE',
  'SECURITY.md',
  '.well-known/ai-policy.md',
];

function createRuntime() {
  const directory = mkdtempSync(join(tmpdir(), 'bric-release-state-'));
  temporaryDirectories.push(directory);
  const runtime = join(directory, 'runtime');
  const releases = join(directory, 'releases');
  mkdirSync(runtime);
  mkdirSync(releases);

  return {
    directory,
    runtime,
    releases,
    env: {
      ...process.env,
      BRIC_INFRA_ENV_FILE: join(directory, 'missing-infra.env'),
      BRIC_RUNTIME_DIR: runtime,
      BRIC_IMAGE_STATE_FILE: join(runtime, 'images.env'),
      BRIC_DEPLOY_STATE_FILE: join(runtime, 'blue-green.env'),
      BRIC_RELEASES_DIR: releases,
      BRIC_CURRENT_LINK: join(directory, 'current'),
      BRIC_PREVIOUS_LINK: join(directory, 'previous'),
    },
  };
}

function createRelease(
  fixture: ReturnType<typeof createRuntime>,
  name: string,
  legalLayout: 'public' | 'legacy',
) {
  const release = join(fixture.releases, name);
  const files = [
    ...commonReleaseFiles,
    ...(legalLayout === 'public' ? publicLegalFiles : legacyLegalFiles),
  ];
  for (const file of files) {
    const path = join(release, file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, '\n');
  }
  writeFileSync(
    join(release, '.bric-release.env'),
    `BRIC_RELEASE_ID=${name}\nBRIC_RELEASE_COMMIT=${name}-commit\n`,
  );
  return release;
}

function verifyRelease(
  fixture: ReturnType<typeof createRuntime>,
  release: string,
  expectedCommit?: string,
) {
  return spawnSync(
    'bash',
    [
      '-c',
      'set -euo pipefail; source "$1"; verify_release_dir "$2" "${3:-}"',
      'bash',
      blueGreenScript,
      release,
      expectedCommit ?? '',
    ],
    { env: fixture.env, encoding: 'utf8' },
  );
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('release-state transactions', () => {
  it('requires the public legal layout for a new deployment candidate', () => {
    const fixture = createRuntime();
    const release = createRelease(fixture, 'public-release', 'public');

    const result = verifyRelease(fixture, release, 'public-release-commit');

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
  });

  it('retains one-way compatibility with the previous legacy rollback bundle', () => {
    const fixture = createRuntime();
    const release = createRelease(fixture, 'legacy-release', 'legacy');

    const rollbackResult = verifyRelease(fixture, release);
    const deploymentResult = verifyRelease(fixture, release, 'legacy-release-commit');

    expect(rollbackResult.status).toBe(0);
    expect(rollbackResult.stderr).toContain(
      'warning: accepting a retained legacy release for rollback compatibility',
    );
    expect(deploymentResult.status).not.toBe(0);
    expect(deploymentResult.stderr).toContain(
      'release is missing the complete public legal/license surface',
    );
  });

  it('rejects an incomplete public release layout', () => {
    const fixture = createRuntime();
    const release = createRelease(fixture, 'incomplete-release', 'public');
    rmSync(join(release, 'THIRD_PARTY_NOTICES.md'));

    const result = verifyRelease(fixture, release, 'incomplete-release-commit');

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('release is missing the complete public legal/license surface');
  });

  it('restores the previous Nginx main config after a rejected release', () => {
    const fixture = createRuntime();
    const fallback = join(fixture.directory, 'previous-nginx.conf');
    const candidate = join(fixture.directory, 'candidate-nginx.conf');
    const liveConfig = join(fixture.runtime, 'nginx-main', 'nginx.conf');
    writeFileSync(fallback, 'previous config\n');
    writeFileSync(candidate, 'candidate config\n');

    const result = spawnSync(
      'bash',
      [
        '-c',
        'set -euo pipefail; source "$1"; begin_nginx_main_config_transaction "$2"; stage_nginx_main_config; grep -qx "candidate config" "$nginx_main_conf_file"; rollback_nginx_main_config_transaction',
        'bash',
        blueGreenScript,
        fallback,
      ],
      {
        env: { ...fixture.env, BRIC_NGINX_MAIN_SOURCE_FILE: candidate },
        encoding: 'utf8',
      },
    );

    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(readFileSync(liveConfig, 'utf8')).toBe('previous config\n');
  });

  it('renders rollback routing from the retained release template', () => {
    const fixture = createRuntime();
    const retainedRelease = join(fixture.releases, 'retained-release');
    const retainedTemplate = join(retainedRelease, 'ops/nginx/templates/default.conf.template');
    const retainedRenderer = join(retainedRelease, 'ops/scripts/render-nginx-config.py');
    const liveConfig = join(fixture.runtime, 'nginx', 'default.conf');
    mkdirSync(dirname(retainedTemplate), { recursive: true });
    mkdirSync(dirname(retainedRenderer), { recursive: true });
    writeFileSync(retainedTemplate, 'proxy_pass http://adminstration-${BRIC_ACTIVE_SLOT}:3000;\n');
    copyFileSync(resolve(workspaceRoot, 'ops/scripts/render-nginx-config.py'), retainedRenderer);

    const result = spawnSync(
      'bash',
      [
        '-c',
        'set -euo pipefail; source "$1"; render_release_nginx_config "$2" green',
        'bash',
        blueGreenScript,
        retainedRelease,
      ],
      { env: fixture.env, encoding: 'utf8' },
    );

    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(readFileSync(liveConfig, 'utf8')).toBe('proxy_pass http://adminstration-green:3000;\n');
  });

  it('restores image state byte-for-byte after a failed candidate', () => {
    const fixture = createRuntime();
    const imageState = join(fixture.runtime, 'images.env');
    writeFileSync(imageState, 'BRIC_IMAGE_STOREFRONT_API_BLUE=verified\n', { mode: 0o600 });

    const result = spawnSync(
      'bash',
      [
        '-c',
        'set -euo pipefail; source "$1"; begin_image_state_transaction; printf "candidate\\n" >"$image_state_file"; rollback_image_state_transaction',
        'bash',
        blueGreenScript,
      ],
      { env: fixture.env, encoding: 'utf8' },
    );

    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(readFileSync(imageState, 'utf8')).toBe('BRIC_IMAGE_STOREFRONT_API_BLUE=verified\n');
  });

  it('keeps committed image state and removes the rollback snapshot', () => {
    const fixture = createRuntime();
    const imageState = join(fixture.runtime, 'images.env');
    writeFileSync(imageState, 'verified\n');

    const result = spawnSync(
      'bash',
      [
        '-c',
        'set -euo pipefail; source "$1"; begin_image_state_transaction; printf "candidate\\n" >"$image_state_file"; commit_image_state_transaction; compgen -G "$runtime_dir/images.env.rollback.*" >/dev/null && exit 9 || exit 0',
        'bash',
        blueGreenScript,
      ],
      { env: fixture.env, encoding: 'utf8' },
    );

    expect(result.status).toBe(0);
    expect(readFileSync(imageState, 'utf8')).toBe('candidate\n');
  });

  it('maintains explicit current and previous verified release links', () => {
    const fixture = createRuntime();
    const firstRelease = join(fixture.releases, 'release-1');
    const secondRelease = join(fixture.releases, 'release-2');
    mkdirSync(firstRelease);
    mkdirSync(secondRelease);

    const result = spawnSync(
      'bash',
      [
        '-c',
        'set -euo pipefail; source "$1"; set_current_release "$2"; set_previous_release "$3"; test "$(release_link_target "$current_link")" = "$2"; test "$(release_link_target "$previous_link")" = "$3"',
        'bash',
        blueGreenScript,
        secondRelease,
        firstRelease,
      ],
      { env: fixture.env, encoding: 'utf8' },
    );

    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
  });

  it('rejects release links outside the managed release directory', () => {
    const fixture = createRuntime();

    const result = spawnSync(
      'bash',
      [
        '-c',
        'set -euo pipefail; source "$1"; set_current_release "$2"',
        'bash',
        blueGreenScript,
        fixture.runtime,
      ],
      { env: fixture.env, encoding: 'utf8' },
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('release link target must be inside');
  });

  it('removes only containers whose Compose services no longer exist', () => {
    const fixture = createRuntime();
    const removed = join(fixture.directory, 'removed-containers');

    const result = spawnSync(
      'bash',
      [
        '-c',
        `set -euo pipefail
        source "$1"
        removed_file="$2"
        compose() {
          if [[ "$1" == "config" && "$2" == "--services" ]]; then
            printf 'admin-blue\\nstorefront-blue\\n'
            return 0
          fi
          return 64
        }
        docker() {
          if [[ "$1" == "ps" ]]; then
            printf 'current-id admin-blue\\nobsolete-id retired-admin\\n'
            return 0
          fi
          if [[ "$1" == "rm" && "$2" == "-f" ]]; then
            printf '%s\\n' "$3" >>"$removed_file"
            return 0
          fi
          return 65
        }
        remove_obsolete_compose_containers`,
        'bash',
        blueGreenScript,
        removed,
      ],
      { env: fixture.env, encoding: 'utf8' },
    );

    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(readFileSync(removed, 'utf8')).toBe('obsolete-id\n');
  });
});
