import { refreshAnalytics2Facts } from './analytics2-facts';
import { refreshAdminReportingSnapshots } from './stats';

type ReleaseReportingRefreshDependencies = {
  refreshSnapshots: typeof refreshAdminReportingSnapshots;
  refreshFacts: typeof refreshAnalytics2Facts;
};

const defaultDependencies: ReleaseReportingRefreshDependencies = {
  refreshSnapshots: refreshAdminReportingSnapshots,
  refreshFacts: refreshAnalytics2Facts,
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
