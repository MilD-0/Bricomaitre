import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, it } from 'vitest';

it.each(['db:migrate', 'db:verify', 'autovacuum', 'roles', 'test:services', 'success'])(
  'preserves the first failing service gate (%s)',
  (failure) => {
    const directory = mkdtempSync(join(tmpdir(), 'bric-service-gate-'));
    const scripts = join(directory, 'ops/scripts');
    const bin = join(directory, 'bin');
    const log = join(directory, 'steps');
    mkdirSync(scripts, { recursive: true });
    mkdirSync(bin);
    const stub = `#!/usr/bin/env bash
set -euo pipefail
step="$1"
printf '%s\\n' "$step" >> "$GATE_LOG"
[[ "$step" != "$FAIL_STEP" ]] || exit 19
`;
    try {
      copyFileSync(
        resolve(import.meta.dirname, '../scripts/run-service-contract-tests.sh'),
        join(scripts, 'run-service-contract-tests.sh'),
      );
      writeFileSync(
        join(scripts, 'run-with-ci-services.sh'),
        '#!/usr/bin/env bash\nshift 3\nexport BRIC_CI_POSTGRES_CONTAINER=fixture BRIC_CI_POSTGRES_PORT=55432\nexec "$@"\n',
        { mode: 0o755 },
      );
      writeFileSync(join(bin, 'gate-step'), stub, { mode: 0o755 });
      writeFileSync(join(bin, 'pnpm'), '#!/usr/bin/env bash\nexec gate-step "${@: -1}"\n', {
        mode: 0o755,
      });
      writeFileSync(
        join(scripts, 'configure-postgres-autovacuum.sh'),
        '#!/usr/bin/env bash\nexec gate-step autovacuum\n',
        { mode: 0o755 },
      );
      mkdirSync(join(directory, 'ops/docker/postgres'), { recursive: true });
      writeFileSync(join(directory, 'ops/docker/postgres/init-roles.sh'), 'role fixture\n');
      writeFileSync(
        join(bin, 'docker'),
        '#!/usr/bin/env bash\nif [[ "$*" == *"psql "* ]]; then echo "t|t|f|f|f|f"; else gate-step roles; fi\n',
        { mode: 0o755 },
      );

      const result = spawnSync('bash', [join(scripts, 'run-service-contract-tests.sh')], {
        encoding: 'utf8',
        timeout: 5000,
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH}`,
          GATE_LOG: log,
          FAIL_STEP: failure,
        },
      });
      const steps = ['db:migrate', 'db:verify', 'autovacuum', 'roles', 'roles', 'test:services'];
      const failedIndex = steps.indexOf(failure);
      expect(result.status, result.stderr).toBe(failedIndex < 0 ? 0 : 19);
      expect(readFileSync(log, 'utf8').trim().split('\n')).toEqual(
        failedIndex < 0 ? steps : steps.slice(0, failedIndex + 1),
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  },
);
