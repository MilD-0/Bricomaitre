import { and, eq, sql } from 'drizzle-orm';

import { getDb } from '@bric/db/client';
import { aiConversations, aiMessages } from '@bric/db/schema';

export type AiTaskTerminalStatus = 'completed' | 'cancelled' | 'failed';

const summaryKeys = [
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

export function formatAiTaskTerminalMessage(input: {
  jobId: string;
  kind: string;
  status: AiTaskTerminalStatus;
  progress?: { current?: number; total?: number; phase?: string } | null;
  summary?: Record<string, unknown> | null;
  errorMessage?: string | null;
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
      },
    })
    .returning({ id: aiMessages.id });
  await db
    .update(aiConversations)
    .set({ updatedAt: new Date() })
    .where(eq(aiConversations.id, input.conversationId));
  return { kind: 'published' as const, messageId: message.id };
}
