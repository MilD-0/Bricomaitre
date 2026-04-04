import { spawn } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, rmSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

function readOption(argv, name) {
  const index = argv.indexOf(name);
  return index === -1 ? null : argv[index + 1] ?? null;
}

function ensureSymlink(targetPath, linkPath) {
  if (existsSync(linkPath)) {
    const stats = lstatSync(linkPath);
    if (stats.isSymbolicLink()) {
      return;
    }

    throw new Error(`Refusing to replace non-symlink path: ${linkPath}`);
  }

  mkdirSync(path.dirname(linkPath), { recursive: true });
  symlinkSync(targetPath, linkPath, 'junction');
}

const argv = process.argv.slice(2);
const appDirOption = readOption(argv, '--app-dir');
const nestedDir = readOption(argv, '--nested-dir');
const defaultPort = readOption(argv, '--default-port');

if (!appDirOption || !nestedDir || !defaultPort) {
  throw new Error(
    'Usage: node ops/scripts/start-next-standalone.mjs --app-dir <dir> --nested-dir <dir> --default-port <port>',
  );
}

const appDir = path.resolve(process.cwd(), appDirOption);
const standaloneAppDir = path.join(appDir, '.next', 'standalone', nestedDir);
const standaloneServerPath = path.join(standaloneAppDir, 'server.js');
const buildStaticPath = path.join(appDir, '.next', 'static');
const standaloneStaticPath = path.join(standaloneAppDir, '.next', 'static');
const appPublicPath = path.join(appDir, 'public');
const standalonePublicPath = path.join(standaloneAppDir, 'public');

if (!existsSync(standaloneServerPath)) {
  throw new Error(`Standalone server not found at ${standaloneServerPath}. Run the app build first.`);
}

if (!existsSync(buildStaticPath)) {
  throw new Error(`Static asset directory not found at ${buildStaticPath}. Run the app build first.`);
}

ensureSymlink(buildStaticPath, standaloneStaticPath);

if (existsSync(appPublicPath)) {
  ensureSymlink(appPublicPath, standalonePublicPath);
} else if (existsSync(standalonePublicPath)) {
  const stats = lstatSync(standalonePublicPath);
  if (stats.isSymbolicLink()) {
    rmSync(standalonePublicPath);
  }
}

const child = spawn(process.execPath, [standaloneServerPath], {
  cwd: appDir,
  stdio: 'inherit',
  env: {
    ...process.env,
    PORT: process.env.PORT ?? defaultPort,
  },
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
