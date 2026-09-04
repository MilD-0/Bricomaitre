import { readFileSync, writeFileSync } from 'node:fs';

const [, , command, inputPath, outputPath] = process.argv;

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function packageUrl(name, version) {
  const segments = name.startsWith('@') ? name.split('/') : [name];
  const encodedName = segments.map((segment) => encodeURIComponent(segment)).join('/');
  return `pkg:npm/${encodedName}@${encodeURIComponent(version)}`;
}

function generateSbom(licensesPath, destinationPath) {
  const licenseGroups = readJson(licensesPath);
  if (!licenseGroups || Array.isArray(licenseGroups) || typeof licenseGroups !== 'object') {
    throw new Error('Expected pnpm license output grouped by license.');
  }

  const componentsByIdentity = new Map();
  for (const packages of Object.values(licenseGroups)) {
    if (!Array.isArray(packages)) continue;
    for (const packageEntry of packages) {
      if (!packageEntry || typeof packageEntry.name !== 'string') continue;
      for (const version of packageEntry.versions ?? []) {
        if (typeof version !== 'string' || /^(?:link|workspace):/.test(version)) continue;
        const identity = `${packageEntry.name}\0${version}`;
        componentsByIdentity.set(identity, {
          type: 'library',
          name: packageEntry.name,
          version,
          purl: packageUrl(packageEntry.name, version),
        });
      }
    }
  }

  const components = [...componentsByIdentity.values()].sort((left, right) =>
    left.purl.localeCompare(right.purl),
  );
  if (components.length === 0) {
    throw new Error('pnpm reported no installed production dependency versions.');
  }

  writeFileSync(
    destinationPath,
    `${JSON.stringify(
      {
        bomFormat: 'CycloneDX',
        specVersion: '1.5',
        version: 1,
        components,
      },
      null,
      2,
    )}\n`,
  );
  console.log(`Prepared ${components.length} production dependency versions for OSV-Scanner.`);
}

const advisoryExceptions = new Map([
  [
    'xlsx\0' + '0.20.3\0' + 'GHSA-4r6h-8v6p-xvw6',
    "SheetJS 0.20.3 is newer than the advisory's CDN-only fixed boundary of 0.19.3.",
  ],
  [
    'xlsx\0' + '0.20.3\0' + 'GHSA-5pgg-2g8v-p4x9',
    "SheetJS 0.20.3 is newer than the advisory's CDN-only fixed boundary of 0.20.2.",
  ],
]);

function severityFor(group, vulnerabilities) {
  const reported = String(group.max_severity ?? '').trim();
  if (/^\d+(?:\.\d+)?$/.test(reported)) {
    const score = Number(reported);
    return { fails: score >= 7, label: `CVSS ${reported}` };
  }

  const normalized = reported.toUpperCase();
  if (normalized === 'HIGH' || normalized === 'CRITICAL') {
    return { fails: true, label: normalized };
  }
  if (['LOW', 'MEDIUM', 'MODERATE', 'NONE'].includes(normalized)) {
    return { fails: false, label: normalized };
  }

  const databaseSeverities = vulnerabilities
    .map((vulnerability) => vulnerability.database_specific?.severity)
    .filter((severity) => typeof severity === 'string')
    .map((severity) => severity.toUpperCase());
  if (databaseSeverities.some((severity) => severity === 'HIGH' || severity === 'CRITICAL')) {
    return { fails: true, label: databaseSeverities.join('/') };
  }
  if (
    databaseSeverities.length > 0 &&
    databaseSeverities.every((severity) => ['LOW', 'MEDIUM', 'MODERATE', 'NONE'].includes(severity))
  ) {
    return { fails: false, label: databaseSeverities.join('/') };
  }

  return { fails: true, label: 'UNKNOWN (fail-closed)' };
}

function evaluateResults(resultsPath, sbomPath) {
  const report = readJson(resultsPath);
  const sbom = readJson(sbomPath);
  if (!Array.isArray(report.results) || !Array.isArray(sbom.components)) {
    throw new Error('OSV-Scanner did not return the expected result structure.');
  }

  const failures = [];
  let ignoredCount = 0;
  for (const result of report.results) {
    for (const packageResult of result.packages ?? []) {
      const name = packageResult.package?.name;
      const version = packageResult.package?.version;
      if (typeof name !== 'string' || typeof version !== 'string') {
        failures.push({ identity: 'unknown package', ids: ['unknown advisory'], label: 'UNKNOWN' });
        continue;
      }

      const vulnerabilities = packageResult.vulnerabilities ?? [];
      const groups =
        packageResult.groups?.length > 0
          ? packageResult.groups
          : vulnerabilities.map((vulnerability) => ({ ids: [vulnerability.id] }));
      for (const group of groups) {
        const ids = (group.ids ?? []).filter((id) => typeof id === 'string');
        const exception = ids
          .map((id) => advisoryExceptions.get(`${name}\0${version}\0${id}`))
          .find(Boolean);
        if (exception) {
          ignoredCount += 1;
          console.log(`Accepted ${name}@${version} ${ids.join(', ')}: ${exception}`);
          continue;
        }

        const matchingVulnerabilities = vulnerabilities.filter((vulnerability) =>
          ids.includes(vulnerability.id),
        );
        const severity = severityFor(group, matchingVulnerabilities);
        if (severity.fails) {
          failures.push({
            identity: `${name}@${version}`,
            ids: ids.length > 0 ? ids : ['unknown advisory'],
            label: severity.label,
          });
        }
      }
    }
  }

  if (failures.length > 0) {
    console.error('Production dependency audit found HIGH, CRITICAL, or unclassified advisories:');
    for (const failure of failures) {
      console.error(`- ${failure.identity}: ${failure.ids.join(', ')} (${failure.label})`);
    }
    process.exitCode = 1;
    return;
  }

  const exceptionSummary =
    ignoredCount === 1 ? '1 scoped exception' : `${ignoredCount} scoped exceptions`;
  console.log(
    `No HIGH or CRITICAL advisories affect ${sbom.components.length} production dependency versions (${exceptionSummary}).`,
  );
}

if (command === 'generate' && inputPath && outputPath) {
  generateSbom(inputPath, outputPath);
} else if (command === 'evaluate' && inputPath && outputPath) {
  evaluateResults(inputPath, outputPath);
} else {
  console.error(
    'Usage: production-dependency-audit.mjs <generate licenses.json sbom.json | evaluate results.json sbom.json>',
  );
  process.exitCode = 2;
}
