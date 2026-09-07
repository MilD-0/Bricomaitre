import { Job, type JobsOptions } from 'bullmq';

export type JobState = 'queued' | 'running' | 'completed' | 'cancelled' | 'failed';

export type JobSnapshot = {
  id: string;
  queue: string;
  kind: string;
  ownerKey: string;
  origin?: string | null;
  conversationId?: number | null;
  status: JobState;
  progress: {
    phase: string;
    current: number;
    total: number;
    percentage: number;
  };
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  errorMessage: string | null;
  downloadUrl: string | null;
  resultSummary: Record<string, unknown> | null;
  cancelRequested: boolean;
  requestFingerprint?: string;
};

export type StartJobResult =
  | { kind: 'started'; job: JobSnapshot }
  | { kind: 'existing'; job: JobSnapshot }
  | { kind: 'busy'; job: JobSnapshot };

export type StartJobOptions<T> = {
  queueName: string;
  kind: string;
  ownerKey: string;
  origin?: string;
  conversationId?: number;
  data: T;
  requestId?: string;
  activeScope?: 'owner' | 'global';
  jobName?: string;
  ttlSeconds?: number;
  queueOptions?: JobsOptions;
};

export type QueueProcessorContext<T> = {
  job: Job<T>;
  updateProgress: (progress: { phase: string; current: number; total: number }) => Promise<void>;
  updateSummary: (summary: Record<string, unknown>) => Promise<void>;
  setDownloadUrl: (url: string) => Promise<void>;
  throwIfCancelled: () => Promise<void>;
};

export type LightweightJobOptions<T> = {
  queueName: string;
  jobName: string;
  dedupeKey: string;
  data: T;
  attempts?: number;
  backoffDelayMs?: number;
};

export type LightweightWorkerOptions = {
  concurrency?: number;
};

export const JOB_TTL_SECONDS = 60 * 60 * 24;
