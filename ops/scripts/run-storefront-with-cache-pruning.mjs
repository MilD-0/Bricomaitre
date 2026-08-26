import { spawn } from 'node:child_process';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { pruneNextFetchCache, readNextFetchCacheOptions } from './prune-next-runtime-cache.mjs';

const DEFAULT_PRUNE_INTERVAL_SECONDS = 15 * 60;

function readPositiveInteger(environment, name, fallback) {
  const value = environment[name]?.trim();
  if (!value) return fallback;
  if (!/^\d+$/.test(value)) throw new Error(`${name} must be a positive integer.`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive safe integer.`);
  }
  return parsed;
}

function logPrune(cacheRoot, options, phase) {
  const result = pruneNextFetchCache(cacheRoot, options);
  console.info(JSON.stringify({ event: 'next_fetch_cache_pruned', phase, ...result }));
}

export function runStorefrontWithCachePruning(
  cacheRoot,
  command,
  commandArguments,
  environment = process.env,
) {
  const pruneOptions = readNextFetchCacheOptions(environment);
  const intervalSeconds = readPositiveInteger(
    environment,
    'BRIC_NEXT_FETCH_CACHE_PRUNE_INTERVAL_SECONDS',
    DEFAULT_PRUNE_INTERVAL_SECONDS,
  );

  logPrune(cacheRoot, pruneOptions, 'startup');

  const child = spawn(command, commandArguments, {
    env: environment,
    stdio: 'inherit',
  });
  const timer = setInterval(() => {
    try {
      logPrune(cacheRoot, pruneOptions, 'periodic');
    } catch (error) {
      console.error(
        JSON.stringify({
          event: 'next_fetch_cache_prune_failed',
          phase: 'periodic',
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }, intervalSeconds * 1_000);

  const forwardedSignals = ['SIGINT', 'SIGTERM'];
  for (const signal of forwardedSignals) {
    process.once(signal, () => {
      if (child.exitCode === null && child.signalCode === null) child.kill(signal);
    });
  }

  return new Promise((resolve, reject) => {
    child.once('error', (error) => {
      clearInterval(timer);
      reject(error);
    });
    child.once('exit', (code, signal) => {
      clearInterval(timer);
      resolve(code ?? (signal === 'SIGINT' ? 130 : signal === 'SIGTERM' ? 143 : 1));
    });
  });
}

async function main() {
  const [cacheRoot, command, ...commandArguments] = process.argv.slice(2);
  if (!cacheRoot || !command) {
    throw new Error(
      'Usage: node run-storefront-with-cache-pruning.mjs <next-cache-directory> <command> [arguments...]',
    );
  }

  process.exitCode = await runStorefrontWithCachePruning(cacheRoot, command, commandArguments);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
