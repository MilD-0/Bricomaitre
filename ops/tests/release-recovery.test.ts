import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
function functionBody(source: string, name: string) {
  const start = source.indexOf(`${name}() {`);
  if (start < 0) throw new Error(`Missing ${name}`);
  return source.slice(start, source.indexOf('\n}\n', start) + 3);
}
function runRecovery(
  script: 'deploy' | 'rollback',
  failure: string,
  shared = false,
  reloadFails = false,
) {
  const source = readFileSync(resolve(root, `ops/scripts/${script}.sh`), 'utf8');
  const cleanup = `cleanup_failed_${script === 'deploy' ? 'deployment' : 'rollback'}`;
  const finalization = source.slice(source.lastIndexOf('compose pull "$meta_worker_service"'));
  const commands = [
    'set_previous_release',
    'set_current_release',
    'set_active_slot',
    'commit_image_state_transaction',
    'commit_nginx_main_config_transaction',
    'commit_runtime_env_transaction',
  ];
  const setup = `
set -euo pipefail
deployment_committed=false
rollback_committed=false
routing_changed=true
shared_runtime_changed=${shared}
previous_slot=blue
current_slot=blue
target_slot=green
previous_worker_service=admin-worker-blue
current_worker_service=admin-worker-blue
original_current_release=old-release
original_previous_release=older-release
current_release=old-release
target_release=new-release
release_dir=new-release
current_link=current
previous_link=previous
image_state_file=/not-a-file
meta_worker_service=storefront-meta-worker
script_dir=/not-used
failed_once=false
compose() { printf 'compose %s\\n' "$*"; }
rollback_runtime_env_transaction() { echo restore-env; }
rollback_nginx_main_config_transaction() { echo restore-nginx; }
render_release_nginx_config() { echo restore-routing; }
reload_nginx() { :; }
remove_slot_release_services() { echo remove-candidate; }
rollback_image_state_transaction() { echo restore-images; }
reconcile_incumbent_slot() { echo reload-incumbent; ${reloadFails ? 'return 7' : ':'}; }
assert_service_image() { :; }
bash() { :; }
restore_release_link() { :; }
stop_slot_app_services() { echo stop-incumbent-apps; }
remove_obsolete_compose_containers() { :; }
prune_old_releases() { :; }
step() {
  echo "$1"
  if [[ "$1" == "$FAIL_STEP" && "$failed_once" == false ]]; then failed_once=true; return 9; fi
}
${commands.map((name) => `${name}() { step ${name}; }`).join('\n')}
`;
  return spawnSync(
    'bash',
    ['-c', `${setup}\n${functionBody(source, cleanup)}\ntrap ${cleanup} EXIT\n${finalization}`],
    {
      encoding: 'utf8',
      env: { ...process.env, FAIL_STEP: failure },
      timeout: 5000,
    },
  );
}

describe('release finalization and recovery', () => {
  for (const script of ['deploy', 'rollback'] as const) {
    it.each([
      'set_previous_release',
      'set_current_release',
      'set_active_slot',
      'commit_image_state_transaction',
      'commit_nginx_main_config_transaction',
    ])(`${script} retains the incumbent worker when %s fails`, (step) => {
      const result = runRecovery(script, step);
      expect(result.status).toBe(9);
      expect(result.stdout).toContain('remove-candidate');
      expect(result.stdout).not.toContain('compose stop admin-worker-blue');
    });
    it(`${script} retires the incumbent only after finalization succeeds`, () => {
      const result = runRecovery(script, '');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('compose stop admin-worker-blue');
      expect(result.stdout).not.toContain('remove-candidate');
    });
  }
  it('reloads the incumbent with restored env before removing the candidate', () => {
    const result = runRecovery('deploy', 'set_current_release', true);
    expect(result.status).toBe(9);
    const calls = result.stdout.split('\n');
    expect(calls.indexOf('restore-env')).toBeLessThan(calls.indexOf('reload-incumbent'));
    expect(calls.indexOf('reload-incumbent')).toBeLessThan(calls.indexOf('remove-candidate'));
  });
  it('keeps candidate services when restored incumbent configuration fails health checks', () => {
    const result = runRecovery('deploy', 'set_current_release', true, true);
    expect(result.status).toBe(9);
    expect(result.stdout).toContain('reload-incumbent');
    expect(result.stdout).not.toContain('remove-candidate');
    expect(result.stderr).toContain('preserving candidate services');
  });
});
