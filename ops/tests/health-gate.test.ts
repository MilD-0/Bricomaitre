import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, it } from 'vitest';

it('emits container state and bounded logs when health retries expire', () => {
  const directory = mkdtempSync(join(tmpdir(), 'bric-health-'));
  try {
    writeFileSync(
      join(directory, 'docker'),
      `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$DOCKER_CALLS"
if [[ "$1" == compose ]]; then echo candidate-id
elif [[ "$1" == inspect && "$3" == state=* ]]; then echo 'state=exited exit=137 oom=true'
elif [[ "$1" == inspect ]]; then echo unhealthy
elif [[ "$1" == logs ]]; then echo 'worker startup failed'
fi
`,
      { mode: 0o755 },
    );
    const result = spawnSync(
      'bash',
      [resolve(import.meta.dirname, '../scripts/wait-for-health.sh'), 'admin-green'],
      {
        encoding: 'utf8',
        timeout: 5000,
        env: {
          ...process.env,
          PATH: `${directory}:${process.env.PATH}`,
          DOCKER_CALLS: join(directory, 'calls'),
          ATTEMPTS: '1',
          SLEEP_SECONDS: '0',
        },
      },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('state=exited exit=137 oom=true');
    expect(result.stderr).toContain('worker startup failed');
    expect(readFileSync(join(directory, 'calls'), 'utf8')).toContain(
      'logs --tail 100 candidate-id',
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
