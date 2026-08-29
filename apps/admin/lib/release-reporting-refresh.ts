import { refreshAnalyticsFacts } from './analytics-facts';
import { refreshAdminReportingSnapshots } from './stats';

type ReleaseReportingRefreshDependencies = {
  refreshSnapshots: typeof refreshAdminReportingSnapshots;
  refreshFacts: typeof refreshAnalyticsFacts;
};

const defaultDependencies: ReleaseReportingRefreshDependencies = {
  refreshSnapshots: refreshAdminReportingSnapshots,
  refreshFacts: refreshAnalyticsFacts,
};

export async function refreshReleaseReporting(
  release: string,
  dependencies: ReleaseReportingRefreshDependencies = defaultDependencies,
) {
  const trigger = `release:${release.trim() || 'unknown'}`;
  const snapshots = await dependencies.refreshSnapshots({ trigger });
  const facts = await dependencies.refreshFacts();

  return { trigger, snapshots, facts };
}
