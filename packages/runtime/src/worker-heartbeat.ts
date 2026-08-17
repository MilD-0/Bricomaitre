import { writeFile } from 'node:fs/promises';

export const DEFAULT_WORKER_HEARTBEAT_MAX_AGE_MS = 45_000;

export async function writeWorkerHeartbeat(path: string, now = Date.now()) {
  await writeFile(path, `${now}\n`, { encoding: 'utf8', mode: 0o600 });
}

export function isWorkerHeartbeatFresh(
  value: string,
  now = Date.now(),
  maxAgeMs = DEFAULT_WORKER_HEARTBEAT_MAX_AGE_MS,
) {
  const recordedAt = Number(value.trim());
  return Number.isFinite(recordedAt) && recordedAt <= now && recordedAt >= now - maxAgeMs;
}
