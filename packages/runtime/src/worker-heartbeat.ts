import { writeFile } from 'node:fs/promises';

export async function writeWorkerHeartbeat(path: string, now = Date.now()) {
  await writeFile(path, `${now}\n`, { encoding: 'utf8', mode: 0o600 });
}
