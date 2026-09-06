import { execFileSync, spawnSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const auditScript = resolve(workspaceRoot, 'ops/scripts/production-dependency-audit.mjs');
const temporaryDirectories: string[] = [];

function temporaryDirectory() {
  const directory = mkdtempSync(join(tmpdir(), 'bric-dependency-audit-test-'));
  temporaryDirectories.push(directory);
  return directory;
}

function writeJson(path: string, value: unknown) {
  writeFileSync(path, `${JSON.stringify(value)}\n`);
}

function cleanSbom(componentCount = 1) {
  return {
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    version: 1,
    components: Array.from({ length: componentCount }, (_, index) => ({
      type: 'library',
      name: `dependency-${index}`,
      version: '1.0.0',
    })),
  };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('production dependency audit', () => {
  it('builds a deduplicated CycloneDX inventory from pnpm production license output', () => {
    const directory = temporaryDirectory();
    const licensesPath = join(directory, 'licenses.json');
    const sbomPath = join(directory, 'sbom.json');
    writeJson(licensesPath, {
      MIT: [
        { name: '@scope/alpha', versions: ['1.2.3', '1.2.3'] },
        { name: 'local-package', versions: ['link:../local-package'] },
      ],
      ISC: [{ name: 'beta', versions: ['2.0.0'] }],
    });

    execFileSync(process.execPath, [auditScript, 'generate', licensesPath, sbomPath]);

    const sbom = JSON.parse(readFileSync(sbomPath, 'utf8')) as {
      components: Array<{ name: string; purl: string }>;
    };
    expect(sbom.components).toEqual([
      {
        type: 'library',
        name: '@scope/alpha',
        version: '1.2.3',
        purl: 'pkg:npm/%40scope/alpha@1.2.3',
      },
      { type: 'library', name: 'beta', version: '2.0.0', purl: 'pkg:npm/beta@2.0.0' },
    ]);
  });

  it('fails on high severity and unclassified advisories but permits lower severities', () => {
    const directory = temporaryDirectory();
    const sbomPath = join(directory, 'sbom.json');
    writeJson(sbomPath, cleanSbom());

    for (const [severity, expectedStatus] of [
      ['8.1', 1],
      ['6.9', 0],
      [undefined, 1],
    ] as const) {
      const resultsPath = join(directory, `results-${severity ?? 'unknown'}.json`);
      writeJson(resultsPath, {
        results: [
          {
            packages: [
              {
                package: { name: 'dependency', version: '1.0.0' },
                groups: [{ ids: ['GHSA-test-test-test'], max_severity: severity }],
                vulnerabilities: [],
              },
            ],
          },
        ],
      });

      const result = spawnSync(process.execPath, [auditScript, 'evaluate', resultsPath, sbomPath]);
      expect(result.status).toBe(expectedStatus);
    }
  });

  it('limits SheetJS range exceptions to the patched version and exact advisories', () => {
    const directory = temporaryDirectory();
    const sbomPath = join(directory, 'sbom.json');
    writeJson(sbomPath, cleanSbom());

    for (const [version, advisory, expectedStatus] of [
      ['0.20.3', 'GHSA-4r6h-8v6p-xvw6', 0],
      ['0.20.2', 'GHSA-4r6h-8v6p-xvw6', 1],
      ['0.20.3', 'GHSA-new-advisory', 1],
    ] as const) {
      const resultsPath = join(directory, `${version}-${advisory}.json`);
      writeJson(resultsPath, {
        results: [
          {
            packages: [
              {
                package: { name: 'xlsx', version },
                groups: [{ ids: [advisory], max_severity: '7.8' }],
                vulnerabilities: [],
              },
            ],
          },
        ],
      });

      const result = spawnSync(process.execPath, [auditScript, 'evaluate', resultsPath, sbomPath]);
      expect(result.status).toBe(expectedStatus);
    }
  });

  it.each([
    { scanStatus: 0, severity: null, expectedStatus: 0 },
    { scanStatus: 1, severity: '6.9', expectedStatus: 0 },
    { scanStatus: 1, severity: '8.1', expectedStatus: 1 },
    { scanStatus: 2, severity: null, expectedStatus: 2 },
  ])(
    'enforces the scanner result and cleans temporary files: $scanStatus / $severity',
    ({ scanStatus, severity, expectedStatus }) => {
      const directory = temporaryDirectory();
      const scripts = join(directory, 'ops/scripts');
      const bin = join(directory, 'bin');
      const scratch = join(directory, 'scratch');
      for (const path of [scripts, bin, scratch]) mkdirSync(path, { recursive: true });
      for (const name of ['check-production-dependencies.sh', 'production-dependency-audit.mjs']) {
        copyFileSync(resolve(workspaceRoot, 'ops/scripts', name), join(scripts, name));
      }
      writeFileSync(
        join(bin, 'pnpm'),
        `#!/bin/bash
[[ "$*" == 'licenses list --prod --json' ]] || exit 64
printf '%s\n' '{"MIT":[{"name":"dependency","versions":["1.0.0"]}]}'
`,
        { mode: 0o755 },
      );
      writeFileSync(
        join(scripts, 'install-osv-scanner.sh'),
        `#!/bin/bash
printf '%s\n' "$PWD/bin/scanner"
`,
      );
      const report = {
        results:
          severity === null
            ? []
            : [
                {
                  packages: [
                    {
                      package: { name: 'dependency', version: '1.0.0' },
                      groups: [{ ids: ['GHSA-test-test-test'], max_severity: severity }],
                    },
                  ],
                },
              ],
      };
      writeJson(join(directory, 'report.json'), report);
      writeFileSync(
        join(bin, 'scanner'),
        `#!/bin/bash
for arg in "$@"; do
  case "$arg" in --output-file=*) cp "$PWD/report.json" "\${arg#--output-file=}";; esac
done
exit ${scanStatus}
`,
        { mode: 0o755 },
      );

      const result = spawnSync('bash', [join(scripts, 'check-production-dependencies.sh')], {
        encoding: 'utf8',
        env: { PATH: `${bin}:${process.env.PATH}`, TMPDIR: scratch },
      });
      expect(result.status, result.stderr).toBe(expectedStatus);
      if (scanStatus === 2) {
        expect(result.stderr).toContain('failed before producing an advisory result');
        expect(result.stdout).not.toContain('No HIGH or CRITICAL advisories');
      }
      expect(readdirSync(scratch)).toEqual([]);
    },
  );
});
