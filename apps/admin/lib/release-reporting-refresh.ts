import { refreshAnalyticsFacts } from './analytics-facts';

export async function refreshReleaseReporting(release: string) {
  const facts = await refreshAnalyticsFacts();
  return { trigger: `release:${release.trim() || 'unknown'}`, facts };
}
