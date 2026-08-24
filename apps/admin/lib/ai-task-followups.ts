import { and, eq, sql } from 'drizzle-orm';

import { getDb } from '@bric/db/client';
import { aiConversations, aiMessages } from '@bric/db/schema';

export type AiTaskTerminalStatus = 'completed' | 'cancelled' | 'failed';

const summaryKeys = [
  'totalRequested',
  'eligible',
  'created',
  'skippedAlreadyPosted',
  'invalid',
  'processed',
  'total',
  'applied',
  'autoApplyFailed',
  'proposed',
  'unchanged',
  'skipped',
  'ambiguous',
  'alreadyProposed',
  'failed',
  'accounted',
  'complete',
] as const;

type EcotrackTerminalRow = {
  orderId: number | null;
  reference: string | null;
  tracking: string | null;
  message: string;
};

type EcotrackTerminalOutput = {
  kind: 'ecotrack_posting_terminal';
  jobId: string;
  status: AiTaskTerminalStatus;
  provider: string | null;
  attemptNumber: number;
  retryCount: number;
  counts: {
    requested: number;
    eligible: number;
    succeeded: number;
    validationFailed: number;
    providerRejected: number;
    alreadyPosted: number;
  };
  successes: EcotrackTerminalRow[];
  validationFailures: EcotrackTerminalRow[];
  providerRejections: EcotrackTerminalRow[];
  alreadyPosted: EcotrackTerminalRow[];
  repairableOrderIds: number[];
  retryableOrderIds: number[];
};

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function ecotrackTerminalRow(value: unknown): (EcotrackTerminalRow & { status: string }) | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (!['created', 'invalid', 'failed', 'skipped'].includes(String(row.status))) return null;
  return {
    orderId: typeof row.orderId === 'number' ? row.orderId : null,
    reference: typeof row.reference === 'string' ? row.reference : null,
    tracking: typeof row.tracking === 'string' ? row.tracking : null,
    status: String(row.status),
    message:
      typeof row.message === 'string' && row.message.trim()
        ? row.message.trim()
        : 'No provider explanation was returned.',
  };
}

export function buildEcotrackTerminalOutput(input: {
  jobId: string;
  status: AiTaskTerminalStatus;
  summary: Record<string, unknown>;
  attemptsMade?: number;
}): EcotrackTerminalOutput {
  const rows = Array.isArray(input.summary.results)
    ? input.summary.results.flatMap((value) => {
        const row = ecotrackTerminalRow(value);
        return row ? [row] : [];
      })
    : [];
  const rowsWithStatus = (status: string) =>
    rows
      .filter((row) => row.status === status)
      .map((row) => ({
        orderId: row.orderId,
        reference: row.reference,
        tracking: row.tracking,
        message: row.message,
      }));
  const successes = rowsWithStatus('created');
  const validationFailures = rowsWithStatus('invalid');
  const providerRejections = rowsWithStatus('failed');
  const alreadyPosted = rowsWithStatus('skipped');
  const orderIds = (selected: EcotrackTerminalRow[]) =>
    selected.flatMap((row) => (row.orderId === null ? [] : [row.orderId]));
  const attemptNumber = Math.max(1, Math.trunc(input.attemptsMade ?? 1));
  const retryCount = attemptNumber - 1;

  return {
    kind: 'ecotrack_posting_terminal',
    jobId: input.jobId,
    status: input.status,
    provider:
      typeof input.summary.provider === 'string' && input.summary.provider.trim()
        ? input.summary.provider
        : null,
    attemptNumber,
    retryCount,
    counts: {
      requested: numberValue(input.summary.totalRequested),
      eligible: numberValue(input.summary.eligible),
      succeeded: numberValue(input.summary.created),
      validationFailed: numberValue(input.summary.invalid),
      providerRejected: numberValue(input.summary.failed),
      alreadyPosted: numberValue(input.summary.skippedAlreadyPosted),
    },
    successes,
    validationFailures,
    providerRejections,
    alreadyPosted,
    repairableOrderIds: [...new Set(orderIds([...validationFailures, ...providerRejections]))],
    retryableOrderIds: [...new Set(orderIds(providerRejections))],
  };
}

function ecotrackResultLines(output: EcotrackTerminalOutput) {
  const identity = (row: EcotrackTerminalRow) =>
    row.orderId !== null
      ? `Order #${row.orderId}`
      : row.reference
        ? `Order ${row.reference}`
        : 'Order';
  const section = (
    heading: string,
    rows: EcotrackTerminalRow[],
    detail: (row: EcotrackTerminalRow) => string,
  ) =>
    rows.length > 0
      ? ['', heading, ...rows.map((row) => `- ${identity(row)} · ${detail(row)}`)]
      : [];

  return [
    `Worker attempt: ${output.attemptNumber} · retries: ${output.retryCount}`,
    ...section(
      'Posted successfully:',
      output.successes,
      (row) => `${row.tracking ? `tracking ${row.tracking} · ` : ''}${row.message}`,
    ),
    ...section(
      'Validation failures (not sent to the provider):',
      output.validationFailures,
      (row) => row.message,
    ),
    ...section('Provider rejections:', output.providerRejections, (row) => row.message),
    ...section('Already posted:', output.alreadyPosted, (row) => row.message),
  ];
}

export function formatAiTaskTerminalMessage(input: {
  jobId: string;
  kind: string;
  status: AiTaskTerminalStatus;
  progress?: { current?: number; total?: number; phase?: string } | null;
  summary?: Record<string, unknown> | null;
  errorMessage?: string | null;
  downloadPath?: string | null;
  attemptsMade?: number;
}) {
  const heading =
    input.status === 'completed'
      ? 'Background task completed on the server.'
      : input.status === 'cancelled'
        ? 'Background task cancelled on the server.'
        : 'Background task failed on the server.';
  const lines = [
    heading,
    '',
    `Job ID: ${input.jobId}`,
    `Task: ${input.kind}`,
    `Status: ${input.status}`,
  ];
  if (input.progress?.total !== undefined) {
    lines.push(
      `Progress: ${input.progress.current ?? 0}/${input.progress.total}${input.progress.phase ? ` · ${input.progress.phase}` : ''}`,
    );
  }
  const summary = input.summary ?? {};
  const summaryParts = summaryKeys.flatMap((key) =>
    key in summary ? [`${key}: ${String(summary[key])}`] : [],
  );
  if (summaryParts.length > 0) lines.push(`Reconciled result: ${summaryParts.join(' · ')}`);
  if (input.kind.startsWith('order-ecotrack:')) {
    lines.push(
      ...ecotrackResultLines(
        buildEcotrackTerminalOutput({
          jobId: input.jobId,
          status: input.status,
          summary,
          attemptsMade: input.attemptsMade,
        }),
      ),
    );
  }
  if (input.errorMessage) lines.push(`Error: ${input.errorMessage}`);
  if (typeof summary.proposed === 'number' && summary.proposed > 0) {
    lines.push(
      `${summary.proposed} proposal${summary.proposed === 1 ? ' is' : 's are'} awaiting review and ${summary.proposed === 1 ? 'has' : 'have'} not been applied.`,
    );
  }
  if (typeof summary.autoApplyFailed === 'number' && summary.autoApplyFailed > 0) {
    lines.push(
      `${summary.autoApplyFailed} automatic application attempt${summary.autoApplyFailed === 1 ? '' : 's'} encountered a live-record conflict or verification failure; the proposal${summary.autoApplyFailed === 1 ? ' remains' : 's remain'} pending for review.`,
    );
  }
  if (input.status === 'completed' && summary.complete !== true && 'complete' in summary) {
    lines.push(
      'The task is not being reported as fully reconciled because the server did not confirm complete: true.',
    );
  }
  if (
    input.status === 'completed' &&
    input.downloadPath &&
    (input.downloadPath.startsWith('/') || /^https?:\/\//i.test(input.downloadPath))
  ) {
    lines.push(`Download: [Open the completed file](${input.downloadPath})`);
  }
  return lines.join('\n');
}

export async function publishAiTaskTerminalMessage(input: {
  conversationId?: number;
  jobId: string;
  kind: string;
  status: AiTaskTerminalStatus;
  progress?: { current?: number; total?: number; phase?: string } | null;
  summary?: Record<string, unknown> | null;
  errorMessage?: string | null;
  downloadPath?: string | null;
  attemptsMade?: number;
}) {
  if (!input.conversationId) return { kind: 'not-linked' as const };
  const db = getDb();
  const [existing] = await db
    .select({ id: aiMessages.id })
    .from(aiMessages)
    .where(
      and(
        eq(aiMessages.conversationId, input.conversationId),
        sql`${aiMessages.content} ->> 'jobId' = ${input.jobId}`,
        sql`${aiMessages.content} ->> 'terminal' = 'true'`,
      ),
    )
    .limit(1);
  if (existing) return { kind: 'existing' as const, messageId: existing.id };

  const text = formatAiTaskTerminalMessage(input);
  const terminalToolResult = input.kind.startsWith('order-ecotrack:')
    ? {
        type: 'tool-result' as const,
        toolName: 'ecotrack_posting_terminal',
        output: buildEcotrackTerminalOutput({
          jobId: input.jobId,
          status: input.status,
          summary: input.summary ?? {},
          attemptsMade: input.attemptsMade,
        }),
      }
    : null;
  const [message] = await db
    .insert(aiMessages)
    .values({
      conversationId: input.conversationId,
      role: 'assistant',
      content: {
        text,
        jobId: input.jobId,
        jobKind: input.kind,
        jobStatus: input.status,
        terminal: true,
        ...(input.downloadPath ? { downloadPath: input.downloadPath } : {}),
        ...(terminalToolResult ? { toolResults: [terminalToolResult] } : {}),
      },
    })
    .returning({ id: aiMessages.id });
  await db
    .update(aiConversations)
    .set({ updatedAt: new Date() })
    .where(eq(aiConversations.id, input.conversationId));
  return { kind: 'published' as const, messageId: message.id };
}
