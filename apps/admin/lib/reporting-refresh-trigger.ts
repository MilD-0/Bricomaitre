export async function triggerAdminReportingRefresh(
  trigger: string,
  sourceImportBatchId?: string | null,
) {
  try {
    const jobs = await import('./background-jobs');
    return await jobs.startAdminReportingRefreshJob(trigger, sourceImportBatchId ?? null);
  } catch (error) {
    console.error('[admin-reporting] refresh trigger failed', error);
    return null;
  }
}
