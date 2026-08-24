import 'dotenv/config';

import { refreshReleaseReporting } from '../lib/release-reporting-refresh';

async function main() {
  const result = await refreshReleaseReporting(process.env.SENTRY_RELEASE ?? 'unknown');
  console.log(
    `Release reporting refreshed: trigger=${result.trigger} snapshots=${result.snapshots.snapshots} dailyFacts=${result.facts.dailyFacts}`,
  );
}

main().catch((error) => {
  console.error('Release reporting refresh failed', error);
  process.exitCode = 1;
});
