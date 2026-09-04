import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

  it('pins the scanner and keeps network errors fail-closed', () => {
    const installer = readFileSync(
      resolve(workspaceRoot, 'ops/scripts/install-osv-scanner.sh'),
      'utf8',
    );
    const runner = readFileSync(
      resolve(workspaceRoot, 'ops/scripts/check-production-dependencies.sh'),
      'utf8',
    );
    const packageJson = JSON.parse(
      readFileSync(resolve(workspaceRoot, 'package.json'), 'utf8'),
    ) as {
      scripts: Record<string, string>;
    };

    expect(installer).toContain("osv_version='2.5.1'");
    expect(installer.match(/binary_sha256='[a-f0-9]{64}'/g)).toHaveLength(2);
    expect(installer).toContain('sha256sum -c --status');
    expect(runner).toContain('pnpm licenses list --prod --json');
    expect(runner).toContain('scan_status != 0 && scan_status != 1');
    expect(packageJson.scripts['dependencies:check']).toBe(
      'bash ops/scripts/check-production-dependencies.sh',
    );
  });
});
