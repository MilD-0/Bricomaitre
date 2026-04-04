type ProductExportJobPhase = 'counting' | 'loading' | 'processing-images' | 'packaging';
type ProductExportJobStatus = 'running' | 'completed' | 'cancelled' | 'failed';

export type ProductExportJobSnapshot = {
  id: string;
  ownerKey: string;
  status: ProductExportJobStatus;
  fileName: string | null;
  mimeType: string | null;
  progress: {
    phase: ProductExportJobPhase;
    current: number;
    total: number;
    percentage: number;
  };
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  downloadPath: string | null;
};

type ProductExportJobResult = {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
};

type InternalProductExportJob = ProductExportJobSnapshot & {
  buffer: Buffer | null;
  cancelRequested: boolean;
};

type ProductExportJobHandle = {
  setProgress: (progress: { phase: ProductExportJobPhase; current: number; total: number }) => void;
  sleep: (delayMs: number) => Promise<void>;
  throwIfCancelled: () => void;
  isCancelled: () => boolean;
};

type StartJobResult =
  | { kind: 'started'; job: ProductExportJobSnapshot }
  | { kind: 'existing'; job: ProductExportJobSnapshot }
  | { kind: 'busy'; job: ProductExportJobSnapshot }
  | { kind: 'throttled'; retryAfterMs: number };

const DEFAULT_THROTTLE_MS = 15_000;
const DEFAULT_RETENTION_MS = 15 * 60 * 1000;

function nowIso(now = Date.now()) {
  return new Date(now).toISOString();
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return 'Export failed.';
}

export class ProductExportJobManager {
  private jobs = new Map<string, InternalProductExportJob>();
  private activeJobId: string | null = null;
  private lastStartedAt = 0;

  constructor(
    private readonly options: {
      throttleMs?: number;
      retentionMs?: number;
      now?: () => number;
      createId?: () => string;
    } = {},
  ) {}

  private getNow() {
    return this.options.now?.() ?? Date.now();
  }

  private getThrottleMs() {
    const configured = Number(process.env.PRODUCT_EXPORT_THROTTLE_MS ?? this.options.throttleMs ?? DEFAULT_THROTTLE_MS);
    return Number.isFinite(configured) && configured >= 0 ? configured : DEFAULT_THROTTLE_MS;
  }

  private getRetentionMs() {
    const configured = this.options.retentionMs ?? DEFAULT_RETENTION_MS;
    return Number.isFinite(configured) && configured >= 0 ? configured : DEFAULT_RETENTION_MS;
  }

  private createSnapshot(job: InternalProductExportJob): ProductExportJobSnapshot {
    const { buffer: _buffer, cancelRequested: _cancelRequested, ...snapshot } = job;
    return snapshot;
  }

  private cleanupExpiredJobs() {
    const now = this.getNow();
    const retentionMs = this.getRetentionMs();

    for (const [id, job] of this.jobs.entries()) {
      if (job.status === 'running') {
        continue;
      }

      if (now - Date.parse(job.updatedAt) > retentionMs) {
        this.jobs.delete(id);
      }
    }
  }

  getVisibleJob(ownerKey: string) {
    this.cleanupExpiredJobs();

    const matchingJobs = [...this.jobs.values()]
      .filter((job) => job.ownerKey === ownerKey)
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));

    return matchingJobs[0] ? this.createSnapshot(matchingJobs[0]) : null;
  }

  getDownload(ownerKey: string, jobId: string) {
    this.cleanupExpiredJobs();

    const job = this.jobs.get(jobId);
    if (!job || job.ownerKey !== ownerKey || job.status !== 'completed' || !job.buffer || !job.fileName || !job.mimeType) {
      return null;
    }

    return {
      buffer: job.buffer,
      fileName: job.fileName,
      mimeType: job.mimeType,
    };
  }

  startJob(ownerKey: string, runner: (handle: ProductExportJobHandle) => Promise<ProductExportJobResult>): StartJobResult {
    this.cleanupExpiredJobs();

    if (this.activeJobId) {
      const activeJob = this.jobs.get(this.activeJobId);

      if (activeJob) {
        if (activeJob.ownerKey === ownerKey) {
          return { kind: 'existing', job: this.createSnapshot(activeJob) };
        }

        return { kind: 'busy', job: this.createSnapshot(activeJob) };
      }

      this.activeJobId = null;
    }

    const now = this.getNow();
    const throttleMs = this.getThrottleMs();
    const elapsed = now - this.lastStartedAt;

    if (throttleMs > 0 && this.lastStartedAt > 0 && elapsed < throttleMs) {
      return { kind: 'throttled', retryAfterMs: throttleMs - elapsed };
    }

    const jobId = this.options.createId?.() ?? crypto.randomUUID();
    const createdAt = nowIso(now);
    const job: InternalProductExportJob = {
      id: jobId,
      ownerKey,
      status: 'running',
      fileName: null,
      mimeType: null,
      progress: {
        phase: 'counting',
        current: 0,
        total: 0,
        percentage: 0,
      },
      errorMessage: null,
      createdAt,
      updatedAt: createdAt,
      completedAt: null,
      downloadPath: null,
      buffer: null,
      cancelRequested: false,
    };

    this.jobs.set(job.id, job);
    this.activeJobId = job.id;
    this.lastStartedAt = now;
    void this.runJob(job.id, runner);

    return { kind: 'started', job: this.createSnapshot(job) };
  }

  cancelJob(ownerKey: string) {
    if (!this.activeJobId) {
      return null;
    }

    const activeJob = this.jobs.get(this.activeJobId);
    if (!activeJob || activeJob.ownerKey !== ownerKey) {
      return null;
    }

    activeJob.cancelRequested = true;
    activeJob.updatedAt = nowIso(this.getNow());
    return this.createSnapshot(activeJob);
  }

  resetForTests() {
    this.jobs.clear();
    this.activeJobId = null;
    this.lastStartedAt = 0;
  }

  private updateProgress(jobId: string, progress: { phase: ProductExportJobPhase; current: number; total: number }) {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== 'running') {
      return;
    }

    const safeTotal = Math.max(progress.total, 0);
    const safeCurrent = Math.max(0, Math.min(progress.current, safeTotal));
    job.progress = {
      phase: progress.phase,
      current: safeCurrent,
      total: safeTotal,
      percentage: safeTotal === 0 ? 0 : Math.round((safeCurrent / safeTotal) * 100),
    };
    job.updatedAt = nowIso(this.getNow());
  }

  private assertNotCancelled(jobId: string) {
    const job = this.jobs.get(jobId);
    if (job?.cancelRequested) {
      throw new Error('Export cancelled.');
    }
  }

  private async runJob(jobId: string, runner: (handle: ProductExportJobHandle) => Promise<ProductExportJobResult>) {
    const handle: ProductExportJobHandle = {
      setProgress: (progress) => this.updateProgress(jobId, progress),
      sleep: async (delayMs) => {
        if (delayMs <= 0) {
          return;
        }

        await new Promise((resolve) => setTimeout(resolve, delayMs));
      },
      throwIfCancelled: () => this.assertNotCancelled(jobId),
      isCancelled: () => this.jobs.get(jobId)?.cancelRequested ?? true,
    };

    try {
      const result = await runner(handle);
      const job = this.jobs.get(jobId);
      if (!job) {
        return;
      }

      if (job.cancelRequested) {
        job.status = 'cancelled';
        job.errorMessage = null;
        job.buffer = null;
        job.fileName = null;
        job.mimeType = null;
        job.downloadPath = null;
      } else {
        job.status = 'completed';
        job.buffer = result.buffer;
        job.fileName = result.fileName;
        job.mimeType = result.mimeType;
        job.downloadPath = `/api/products/export-all/download?jobId=${encodeURIComponent(job.id)}`;
        job.progress = {
          phase: 'packaging',
          current: job.progress.total,
          total: job.progress.total,
          percentage: job.progress.total === 0 ? 100 : 100,
        };
      }

      job.completedAt = nowIso(this.getNow());
      job.updatedAt = job.completedAt;
    } catch (error) {
      const job = this.jobs.get(jobId);
      if (!job) {
        return;
      }

      job.status = job.cancelRequested || getErrorMessage(error) === 'Export cancelled.' ? 'cancelled' : 'failed';
      job.errorMessage = job.status === 'failed' ? getErrorMessage(error) : null;
      job.buffer = null;
      job.fileName = null;
      job.mimeType = null;
      job.downloadPath = null;
      job.completedAt = nowIso(this.getNow());
      job.updatedAt = job.completedAt;
    } finally {
      if (this.activeJobId === jobId) {
        this.activeJobId = null;
      }
    }
  }
}

const globalForProductExports = globalThis as typeof globalThis & {
  __productExportJobManager?: ProductExportJobManager;
};

export const productExportJobManager =
  globalForProductExports.__productExportJobManager ??
  new ProductExportJobManager();

if (!globalForProductExports.__productExportJobManager) {
  globalForProductExports.__productExportJobManager = productExportJobManager;
}
