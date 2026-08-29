export type ConversationSummary = {
  id: number;
  sessionKey: string;
  title: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type AiJob = {
  id: string;
  queue: string;
  kind: string;
  type?: string;
  conversationId?: number | null;
  cancellable?: boolean;
  status: 'queued' | 'running' | 'completed' | 'cancelled' | 'failed';
  progress: { phase: string; current: number; total: number; percentage: number };
  errorMessage: string | null;
  resultSummary: Record<string, unknown> | null;
  downloadPath: string | null;
};
