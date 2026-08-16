export async function triggerAdminReportingRefresh(
  trigger: string,
  sourceImportBatchId?: string | null,
) {
  try {
    const jobs = await import('./background-jobs');
    if (typeof jobs.startAdminReportingRefreshJob !== 'function') {
      return null;
    }

    return await jobs.startAdminReportingRefreshJob(trigger, sourceImportBatchId ?? null);
  } catch (error) {
    console.error('[admin-reporting] refresh trigger failed', error);
    return null;
  }
}
