import { lstatSync, readdirSync, rmdirSync, statSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const DEFAULT_FETCH_CACHE_MAX_BYTES = 256 * 1024 * 1024;
const DEFAULT_FETCH_CACHE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

function isMissing(error) {
  return error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT';
}

function readNonNegativeInteger(environment, name, fallback) {
  const value = environment[name]?.trim();
  if (!value) return fallback;
  if (!/^\d+$/.test(value)) {
    throw new Error(`${name} must be a non-negative integer.`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`${name} exceeds the safe integer range.`);
  }
  return parsed;
}

export function readNextFetchCacheOptions(environment = process.env) {
  return {
    maxBytes: readNonNegativeInteger(
      environment,
      'BRIC_NEXT_FETCH_CACHE_MAX_BYTES',
      DEFAULT_FETCH_CACHE_MAX_BYTES,
    ),
    maxAgeSeconds: readNonNegativeInteger(
      environment,
      'BRIC_NEXT_FETCH_CACHE_MAX_AGE_SECONDS',
      DEFAULT_FETCH_CACHE_MAX_AGE_SECONDS,
    ),
  };
}

function collectFiles(directory) {
  const files = [];
  const directories = [directory];

  while (directories.length > 0) {
    const current = directories.pop();
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch (error) {
      if (isMissing(error)) continue;
      throw error;
    }
    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        directories.push(entryPath);
      } else if (entry.isFile()) {
        let stats;
        try {
          stats = statSync(entryPath);
        } catch (error) {
          if (isMissing(error)) continue;
          throw error;
        }
        files.push({ path: entryPath, bytes: stats.size, modifiedAt: stats.mtimeMs });
      }
      // Ignore symlinks and special files. A runtime cache must never make the
      // startup cleanup follow a path outside its configured cache directory.
    }
  }

  return files;
}

function removeEmptyDirectories(directory, root) {
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch (error) {
    if (isMissing(error)) return;
    throw error;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    removeEmptyDirectories(path.join(directory, entry.name), root);
  }
  try {
    if (directory !== root && readdirSync(directory).length === 0) rmdirSync(directory);
  } catch (error) {
    if (isMissing(error) || (error && error.code === 'ENOTEMPTY')) return;
    throw error;
  }
}

export function pruneNextFetchCache(cacheRoot, options = {}) {
  const root = path.resolve(cacheRoot);
  const fetchCache = path.join(root, 'fetch-cache');
  const maxBytes = options.maxBytes ?? DEFAULT_FETCH_CACHE_MAX_BYTES;
  const maxAgeSeconds = options.maxAgeSeconds ?? DEFAULT_FETCH_CACHE_MAX_AGE_SECONDS;
  const now = options.now ?? Date.now();

  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
    throw new Error('maxBytes must be a non-negative safe integer.');
  }
  if (!Number.isSafeInteger(maxAgeSeconds) || maxAgeSeconds < 0) {
    throw new Error('maxAgeSeconds must be a non-negative safe integer.');
  }

  try {
    const stats = lstatSync(fetchCache);
    if (!stats.isDirectory() || stats.isSymbolicLink()) {
      throw new Error(`Refusing to prune a non-directory fetch cache: ${fetchCache}`);
    }
  } catch (error) {
    if (isMissing(error)) {
      return { scanned: 0, removed: 0, removedBytes: 0, retainedBytes: 0 };
    }
    throw error;
  }

  const files = collectFiles(fetchCache);
  const cutoff = now - maxAgeSeconds * 1_000;
  const retained = [];
  let removed = 0;
  let removedBytes = 0;
  let retainedBytes = 0;

  for (const file of files) {
    if (maxAgeSeconds > 0 && file.modifiedAt < cutoff) {
      try {
        unlinkSync(file.path);
        removed += 1;
        removedBytes += file.bytes;
      } catch (error) {
        if (!isMissing(error)) throw error;
      }
    } else {
      retained.push(file);
      retainedBytes += file.bytes;
    }
  }

  retained.sort((left, right) => left.modifiedAt - right.modifiedAt);
  for (const file of retained) {
    if (retainedBytes <= maxBytes) break;
    try {
      unlinkSync(file.path);
      removed += 1;
      removedBytes += file.bytes;
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
    retainedBytes -= file.bytes;
  }

  removeEmptyDirectories(fetchCache, fetchCache);
  return { scanned: files.length, removed, removedBytes, retainedBytes };
}

function main() {
  const cacheRoot = process.argv[2];
  if (!cacheRoot) {
    throw new Error('Usage: node prune-next-runtime-cache.mjs <next-cache-directory>');
  }

  const result = pruneNextFetchCache(cacheRoot, {
    ...readNextFetchCacheOptions(),
  });
  console.info(JSON.stringify({ event: 'next_fetch_cache_pruned', ...result }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main();
}
