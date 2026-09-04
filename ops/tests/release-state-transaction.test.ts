import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const workspaceRoot = resolve(import.meta.dirname, '../..');
const blueGreenScript = resolve(workspaceRoot, 'ops/scripts/blue-green.sh');
const temporaryDirectories: string[] = [];
const currentSignerIdentity =
  'https://github.com/MilD-0/Bricomaitre/.github/workflows/deploy.yml@refs/heads/main';
const formerSignerIdentity =
  'https://github.com/MilD-0/Bricomaitre2/.github/workflows/deploy.yml@refs/heads/main';

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
  const envDirectory = join(directory, 'env');
  mkdirSync(runtime);
  mkdirSync(releases);
  mkdirSync(envDirectory);

  return {
    directory,
    runtime,
    releases,
    envDirectory,
    env: {
      ...process.env,
      BRIC_INFRA_ENV_FILE: join(directory, 'missing-infra.env'),
      BRIC_RUNTIME_DIR: runtime,
      BRIC_IMAGE_STATE_FILE: join(runtime, 'images.env'),
      BRIC_DEPLOY_STATE_FILE: join(runtime, 'blue-green.env'),
      BRIC_RELEASES_DIR: releases,
      BRIC_ENV_DIR: envDirectory,
      BRIC_CURRENT_LINK: join(directory, 'current'),
      BRIC_PREVIOUS_LINK: join(directory, 'previous'),
    },
  };
}

function createRelease(
  fixture: ReturnType<typeof createRuntime>,
  name: string,
  legalLayout: 'public' | 'legacy',
  signerIdentity?: string,
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
    `BRIC_RELEASE_ID=${name}\nBRIC_RELEASE_COMMIT=${name}-commit\n${signerIdentity ? `BRIC_RELEASE_SIGNER_IDENTITY=${signerIdentity}\n` : ''}`,
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
      'set -euo pipefail; source "$1"; verify_release_dir "$2" "${3:-}"; printf "LAYOUT=%s\\nPROFILE=%s\\n" "$verified_release_layout" "$verified_release_image_profile"',
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
    const release = createRelease(fixture, 'public-release', 'public', currentSignerIdentity);

    const result = verifyRelease(fixture, release, 'public-release-commit');

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('LAYOUT=public');
    expect(result.stdout).toContain('PROFILE=public');
  });

  it('rejects a new deployment candidate without the current repository signer', () => {
    const fixture = createRuntime();
    const unsignedRelease = createRelease(fixture, 'unsigned-release', 'public');
    const formerRelease = createRelease(fixture, 'former-release', 'public', formerSignerIdentity);

    const unsignedResult = verifyRelease(fixture, unsignedRelease, 'unsigned-release-commit');
    const formerResult = verifyRelease(fixture, formerRelease, 'former-release-commit');

    expect(unsignedResult.status).not.toBe(0);
    expect(unsignedResult.stderr).toContain('release signer mismatch');
    expect(formerResult.status).not.toBe(0);
    expect(formerResult.stderr).toContain('release signer mismatch');
  });

  it('retains rollback compatibility for canonical releases signed by the former repository', () => {
    const fixture = createRuntime();
    const release = createRelease(fixture, 'former-public-release', 'public');

    const result = verifyRelease(fixture, release);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('LAYOUT=public');
    expect(result.stdout).toContain('PROFILE=legacy-public');
    expect(result.stderr).toContain(
      'warning: accepting a canonical release signed by the former repository for rollback compatibility',
    );
  });

  it('retains one-way compatibility with the previous legacy rollback bundle', () => {
    const fixture = createRuntime();
    const release = createRelease(fixture, 'legacy-release', 'legacy');

    const rollbackResult = verifyRelease(fixture, release);
    const deploymentResult = verifyRelease(fixture, release, 'legacy-release-commit');

    expect(rollbackResult.status).toBe(0);
    expect(rollbackResult.stdout).toContain('LAYOUT=legacy');
    expect(rollbackResult.stdout).toContain('PROFILE=legacy');
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
    rmSync(join(release, 'NOTICE'));

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

  it('restores every previous runtime environment file and removes newly introduced files', () => {
    const fixture = createRuntime();
    writeFileSync(join(fixture.envDirectory, 'admin.env'), 'ADMIN_VALUE=previous\n', {
      mode: 0o600,
    });
    writeFileSync(join(fixture.envDirectory, 'storefront.env'), 'STORE_VALUE=previous\n', {
      mode: 0o600,
    });

    const result = spawnSync(
      'bash',
      [
        '-c',
        'set -euo pipefail; source "$1"; begin_runtime_env_transaction; printf "ADMIN_VALUE=candidate\\n" >"$runtime_env_dir/admin.env"; rm "$runtime_env_dir/storefront.env"; printf "API_VALUE=candidate\\n" >"$runtime_env_dir/storefront-api.env"; rollback_runtime_env_transaction',
        'bash',
        blueGreenScript,
      ],
      { env: fixture.env, encoding: 'utf8' },
    );

    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(readFileSync(join(fixture.envDirectory, 'admin.env'), 'utf8')).toBe(
      'ADMIN_VALUE=previous\n',
    );
    expect(readFileSync(join(fixture.envDirectory, 'storefront.env'), 'utf8')).toBe(
      'STORE_VALUE=previous\n',
    );
    expect(() => readFileSync(join(fixture.envDirectory, 'storefront-api.env'))).toThrow();
  });

  it('keeps committed runtime environment values and removes their rollback snapshot', () => {
    const fixture = createRuntime();
    const adminEnv = join(fixture.envDirectory, 'admin.env');
    writeFileSync(adminEnv, 'ADMIN_VALUE=previous\n', { mode: 0o600 });

    const result = spawnSync(
      'bash',
      [
        '-c',
        'set -euo pipefail; source "$1"; begin_runtime_env_transaction; printf "ADMIN_VALUE=candidate\\n" >"$runtime_env_dir/admin.env"; commit_runtime_env_transaction; test ! -e "$runtime_env_transaction_dir"',
        'bash',
        blueGreenScript,
      ],
      { env: fixture.env, encoding: 'utf8' },
    );

    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(readFileSync(adminEnv, 'utf8')).toBe('ADMIN_VALUE=candidate\n');
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
