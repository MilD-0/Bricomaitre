#!/usr/bin/env node

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const licenseFilePattern = /^(?:licen[cs]e|copying|notice)(?:[._-].*)?$/i;

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function pathExists(path) {
  try {
    await readFile(path);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'EISDIR') return false;
    throw error;
  }
}

async function directPackageRoots(nodeModulesPath) {
  let entries;
  try {
    entries = await readdir(nodeModulesPath, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }

  const roots = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const entryPath = join(nodeModulesPath, entry.name);
    if (entry.name.startsWith('@')) {
      let scopedEntries;
      try {
        scopedEntries = await readdir(entryPath, { withFileTypes: true });
      } catch (error) {
        if (error?.code === 'ENOENT') continue;
        throw error;
      }
      for (const scopedEntry of scopedEntries) {
        if (!scopedEntry.name.startsWith('.')) roots.push(join(entryPath, scopedEntry.name));
      }
      continue;
    }
    roots.push(entryPath);
  }
  return roots;
}

async function packageMetadata(packageRoot) {
  const packageJsonPath = join(packageRoot, 'package.json');
  if (!(await pathExists(packageJsonPath))) return null;
  const manifest = await readJson(packageJsonPath);
  if (!manifest.name || !manifest.version) return null;
  return { manifest, packageRoot };
}

async function collectRuntimePackages(runtimeRoots) {
  const packages = new Map();
  const visitedDirectories = new Set();

  async function walk(directory) {
    const absolute = resolve(directory);
    if (visitedDirectories.has(absolute)) return;
    visitedDirectories.add(absolute);

    const metadata = await packageMetadata(absolute);
    if (metadata && !metadata.manifest.private && !metadata.manifest.name.startsWith('@bric/')) {
      packages.set(`${metadata.manifest.name}@${metadata.manifest.version}`, metadata);
    }

    let entries;
    try {
      entries = await readdir(absolute, { withFileTypes: true });
    } catch (error) {
      if (error?.code === 'ENOENT') return;
      throw error;
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
      await walk(join(absolute, entry.name));
    }
  }

  for (const runtimeRoot of runtimeRoots) await walk(runtimeRoot);
  return packages;
}

async function collectWorkspacePackageIndex(workspaceNodeModules) {
  const virtualStore = join(resolve(workspaceNodeModules), '.pnpm');
  let entries;
  try {
    entries = await readdir(virtualStore, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new Error(`pnpm virtual store not found at ${virtualStore}`);
    }
    throw error;
  }

  const index = new Map();
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const packageRoots = await directPackageRoots(join(virtualStore, entry.name, 'node_modules'));
    for (const packageRoot of packageRoots) {
      const metadata = await packageMetadata(packageRoot);
      if (!metadata) continue;
      const key = `${metadata.manifest.name}@${metadata.manifest.version}`;
      if (!index.has(key)) index.set(key, metadata);
    }
  }
  return index;
}

async function licenseFiles(packageRoot) {
  const entries = await readdir(packageRoot, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && licenseFilePattern.test(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
  return Promise.all(
    files.map(async (name) => ({
      name,
      content: (await readFile(join(packageRoot, name), 'utf8')).trim(),
    })),
  );
}

async function namedFiles(directory, names) {
  return Promise.all(
    names.map(async (name) => ({
      name,
      content: (await readFile(join(directory, name), 'utf8')).trim(),
    })),
  );
}

function packageByName(sourceIndex, name) {
  return [...sourceIndex.values()].find((metadata) => metadata.manifest.name === name) ?? null;
}

async function resolveLicenseMaterial(key, runtimeMetadata, sourceIndex, workspaceRoot) {
  const exactSource = sourceIndex.get(key) ?? runtimeMetadata;
  const exactFiles = await licenseFiles(exactSource.packageRoot);
  if (exactFiles.length > 0) return { files: exactFiles, source: key };

  if (key.startsWith('@img/sharp-libvips-')) {
    const directory = join(workspaceRoot, 'third_party/licenses');
    return {
      files: await namedFiles(directory, [
        'Apache-2.0-Sharp-Libvips.txt',
        'LGPL-3.0-or-later.txt',
        'GPL-3.0-only.txt',
        'SHARP-LIBVIPS-THIRD-PARTY-NOTICES.md',
      ]),
      source: 'Bricomaitre sharp-libvips redistribution materials',
    };
  }

  const normalizedRuntimePath = runtimeMetadata.packageRoot.replaceAll('\\', '/');
  const nextCompiledMarker = '/node_modules/next/dist/compiled/';
  const nextCompiledIndex = normalizedRuntimePath.indexOf(nextCompiledMarker);
  if (nextCompiledIndex !== -1) {
    const component = normalizedRuntimePath
      .slice(nextCompiledIndex + nextCompiledMarker.length)
      .split('/')[0];
    const nextPackage = packageByName(sourceIndex, 'next');
    if (nextPackage) {
      const files = await licenseFiles(join(nextPackage.packageRoot, 'dist/compiled', component));
      if (files.length > 0) {
        return { files, source: `next/dist/compiled/${component}` };
      }
    }
  }

  if (runtimeMetadata.manifest.name.startsWith('@edge-runtime/')) {
    const nextPackage = packageByName(sourceIndex, 'next');
    if (nextPackage) {
      const files = await licenseFiles(join(nextPackage.packageRoot, 'dist/compiled/edge-runtime'));
      if (files.length > 0) {
        return { files, source: 'next/dist/compiled/edge-runtime' };
      }
    }
  }

  const name = runtimeMetadata.manifest.name;
  const fallbackName = name.startsWith('@aws-sdk/')
    ? '@aws-sdk/client-s3'
    : name.startsWith('@smithy/')
      ? '@smithy/types'
      : name.startsWith('@esbuild/')
        ? 'esbuild'
        : name.startsWith('@next/') || name === 'client-only'
          ? 'next'
          : name === 'pg-types' || name === 'pgpass'
            ? 'pg'
            : null;
  if (fallbackName) {
    const fallback = packageByName(sourceIndex, fallbackName);
    if (fallback) {
      const files = await licenseFiles(fallback.packageRoot);
      if (files.length > 0) return { files, source: `${fallbackName} monorepo license` };
    }
  }

  return null;
}

function declaredLicense(manifest) {
  if (typeof manifest.license === 'string') return manifest.license;
  if (Array.isArray(manifest.licenses)) {
    return manifest.licenses
      .map((license) => (typeof license === 'string' ? license : license?.type))
      .filter(Boolean)
      .join(' OR ');
  }
  return 'UNKNOWN';
}

function repositoryUrl(manifest) {
  if (typeof manifest.repository === 'string') return manifest.repository;
  if (typeof manifest.repository?.url === 'string') return manifest.repository.url;
  if (typeof manifest.homepage === 'string') return manifest.homepage;
  return null;
}

export async function generateRuntimeLicenseBundle({
  runtimeRoots,
  workspaceNodeModules,
  outputPath,
}) {
  if (!runtimeRoots?.length) throw new Error('at least one runtime root is required');

  const runtimePackages = await collectRuntimePackages(runtimeRoots);
  const sourceIndex = await collectWorkspacePackageIndex(workspaceNodeModules);
  const workspaceRoot = dirname(resolve(workspaceNodeModules));
  const sections = [];
  const missing = [];

  for (const key of [...runtimePackages.keys()].sort((left, right) => left.localeCompare(right))) {
    const runtimeMetadata = runtimePackages.get(key);
    const sourceMetadata = sourceIndex.get(key) ?? runtimeMetadata;
    const material = await resolveLicenseMaterial(key, runtimeMetadata, sourceIndex, workspaceRoot);
    if (!material) {
      missing.push(key);
      continue;
    }

    const repository = repositoryUrl(sourceMetadata.manifest);
    const section = [
      '='.repeat(80),
      `Package: ${key}`,
      `Declared license: ${declaredLicense(sourceMetadata.manifest)}`,
      ...(repository ? [`Upstream: ${repository}`] : []),
      ...(material.source === key ? [] : [`License material source: ${material.source}`]),
    ];
    for (const file of material.files) {
      section.push('', `--- ${file.name} ---`, '', file.content);
    }
    sections.push(section.join('\n'));
  }

  if (runtimePackages.size === 0) {
    throw new Error(`no runtime packages found beneath: ${runtimeRoots.join(', ')}`);
  }
  if (missing.length > 0) {
    throw new Error(
      `runtime packages are missing distributable license or notice files:\n${missing
        .map((key) => `- ${key}`)
        .join('\n')}`,
    );
  }

  const header = [
    'Bricomaitre Runtime Third-Party License Bundle',
    '',
    'This file is generated from third-party packages present in the production runtime.',
    'Those packages remain under their respective licenses.',
    '',
    `Packages covered: ${runtimePackages.size}`,
    '',
  ].join('\n');
  const output = `${header}${sections.join('\n\n')}\n`;
  await mkdir(dirname(resolve(outputPath)), { recursive: true });
  await writeFile(resolve(outputPath), output, 'utf8');
  return { packageCount: runtimePackages.size, output };
}

async function main(argv) {
  const [workspaceNodeModules, outputPath, ...runtimeRoots] = argv;
  if (!workspaceNodeModules || !outputPath || runtimeRoots.length === 0) {
    throw new Error(
      'usage: generate-runtime-license-bundle.mjs <workspace-node_modules> <output> <runtime-root> [runtime-root...]',
    );
  }
  const result = await generateRuntimeLicenseBundle({
    runtimeRoots,
    workspaceNodeModules,
    outputPath,
  });
  process.stdout.write(`Generated ${basename(outputPath)} for ${result.packageCount} packages.\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exitCode = 1;
  });
}
