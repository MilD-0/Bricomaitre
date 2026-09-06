import { sql } from 'drizzle-orm';

import { aiConversations, aiMessages, aiProposals, aiRuns, aiToolCalls } from '@bric/db/schema';
import {
  aiRate,
  bucketExpression,
  classifyAiWorkload,
  isoValue,
  nullableNumber,
  numberValue,
  rows,
  timestampCondition,
  type AiOperationsStats,
  type AiStatsFilters,
  type Database,
} from './ai-stats-contract';
import { estimateAdminAiModelCost } from './stats-experience-ai';

export async function loadOperations(
  db: Database,
  filters: AiStatsFilters,
): Promise<AiOperationsStats> {
  const runWhere = timestampCondition(aiRuns.startedAt, filters);
  const bucket = bucketExpression(aiRuns.startedAt, filters.resolvedGrain);
  const [
    summaryResult,
    feedbackResult,
    trendResult,
    workflowResult,
    workflowCostResult,
    toolsResult,
    releasesResult,
    changesResult,
    exceptionsResult,
  ] = await Promise.all([
    db.execute(sql`
      select
        count(*)::int as runs,
        count(*) filter (where ${aiRuns.status} = 'completed')::int as completed,
        count(*) filter (where ${aiRuns.status} = 'failed')::int as failed,
        count(*) filter (where ${aiRuns.status} = 'cancelled')::int as cancelled,
        count(*) filter (where ${aiRuns.status} = 'running')::int as running,
        count(distinct ${aiRuns.actorId}) filter (where ${aiRuns.actorId} is not null)::int
          as active_operators,
        coalesce(sum(${aiRuns.totalTokens}), 0)::bigint as total_tokens,
        count(*) filter (where ${aiRuns.completedAt} >= ${aiRuns.startedAt})::int
          as valid_duration_samples,
        percentile_cont(0.95) within group (
          order by extract(epoch from (${aiRuns.completedAt} - ${aiRuns.startedAt})) * 1000
        ) filter (where ${aiRuns.completedAt} >= ${aiRuns.startedAt}) as p95_duration_ms
      from ${aiRuns}
      where ${aiRuns.surface} = 'admin' and ${aiRuns.task} = 'admin_chat' and ${runWhere}
    `),
    db.execute(sql`
      select
        count(*)::int as assistant_answers,
        count(*) filter (where ${aiMessages.content}->>'feedback' in ('helpful', 'not_helpful'))::int
          as rated_answers,
        count(*) filter (where ${aiMessages.content}->>'feedback' = 'helpful')::int
          as helpful_answers
      from ${aiMessages}
      inner join ${aiConversations} on ${aiConversations.id} = ${aiMessages.conversationId}
      where ${aiConversations.surface} = 'admin' and ${aiMessages.role} = 'assistant'
        and ${timestampCondition(aiMessages.createdAt, filters)}
    `),
    db.execute(sql`
      select to_char(${bucket}, 'YYYY-MM-DD') as bucket,
        count(*)::int as runs,
        count(*) filter (where ${aiRuns.status} = 'completed')::int as completed,
        count(*) filter (where ${aiRuns.status} = 'failed')::int as failed,
        count(*) filter (where ${aiRuns.status} = 'cancelled')::int as cancelled,
        coalesce(sum(${aiRuns.totalTokens}), 0)::bigint as tokens
      from ${aiRuns}
      where ${aiRuns.surface} = 'admin' and ${aiRuns.task} = 'admin_chat' and ${runWhere}
      group by 1 order by 1
    `),
    db.execute(sql`
      select ${aiRuns.task} as task,
        min(${aiRuns.model}) as representative_model,
        count(*)::int as runs,
        count(*) filter (where ${aiRuns.status} = 'completed')::int as completed,
        count(*) filter (where ${aiRuns.status} = 'failed')::int as failed,
        count(*) filter (where ${aiRuns.status} = 'cancelled')::int as cancelled,
        coalesce(sum(${aiRuns.totalTokens}), 0)::bigint as tokens,
        percentile_cont(0.95) within group (
          order by extract(epoch from (${aiRuns.completedAt} - ${aiRuns.startedAt})) * 1000
        ) filter (where ${aiRuns.completedAt} >= ${aiRuns.startedAt}) as p95_duration_ms
      from ${aiRuns}
      where ${aiRuns.surface} = 'admin' and ${runWhere}
      group by ${aiRuns.task}
      order by count(*) desc, ${aiRuns.task} asc
      limit 20
    `),
    db.execute(sql`
      select ${aiRuns.task} as task, ${aiRuns.model} as model,
        count(*)::int as runs,
        coalesce(sum(${aiRuns.inputTokens}), 0)::bigint as input_tokens,
        coalesce(sum(${aiRuns.outputTokens}), 0)::bigint as output_tokens,
        coalesce(sum(${aiRuns.totalTokens}), 0)::bigint as tokens
      from ${aiRuns}
      where ${aiRuns.surface} = 'admin' and ${runWhere}
      group by ${aiRuns.task}, ${aiRuns.model}
    `),
    db.execute(sql`
      select ${aiToolCalls.toolName} as name,
        count(*)::int as calls,
        count(*) filter (where ${aiToolCalls.status} = 'completed')::int as completed,
        count(*) filter (where ${aiToolCalls.status} <> 'completed')::int as failed,
        percentile_cont(0.95) within group (
          order by extract(epoch from (${aiToolCalls.completedAt} - ${aiToolCalls.startedAt})) * 1000
        ) filter (where ${aiToolCalls.completedAt} >= ${aiToolCalls.startedAt}) as p95_duration_ms
      from ${aiToolCalls}
      inner join ${aiRuns} on ${aiRuns.id} = ${aiToolCalls.runId}
      where ${aiRuns.surface} = 'admin' and ${aiRuns.task} = 'admin_chat'
        and ${timestampCondition(aiToolCalls.startedAt, filters)}
      group by ${aiToolCalls.toolName}
      order by count(*) desc, ${aiToolCalls.toolName} asc
    `),
    db.execute(sql`
      select ${aiRuns.promptVersion} as prompt_version, ${aiRuns.model} as model,
        count(*)::int as runs,
        count(*) filter (where ${aiRuns.status} = 'completed')::int as completed,
        count(*) filter (where ${aiRuns.status} = 'failed')::int as failed,
        count(*) filter (where ${aiRuns.status} = 'cancelled')::int as cancelled,
        coalesce(sum(${aiRuns.inputTokens}), 0)::bigint as input_tokens,
        coalesce(sum(${aiRuns.outputTokens}), 0)::bigint as output_tokens,
        coalesce(sum(${aiRuns.totalTokens}), 0)::bigint as tokens,
        percentile_cont(0.95) within group (
          order by extract(epoch from (${aiRuns.completedAt} - ${aiRuns.startedAt})) * 1000
        ) filter (where ${aiRuns.completedAt} >= ${aiRuns.startedAt}) as p95_duration_ms
      from ${aiRuns}
      where ${aiRuns.surface} = 'admin' and ${aiRuns.task} = 'admin_chat' and ${runWhere}
      group by ${aiRuns.promptVersion}, ${aiRuns.model}
      order by max(${aiRuns.startedAt}) desc
      limit 12
    `),
    db.execute(sql`
      select ${aiProposals.proposalType} as type, ${aiProposals.status} as status,
        count(*)::int as count
      from ${aiProposals}
      inner join ${aiRuns} on ${aiRuns.id} = ${aiProposals.runId}
      where ${aiRuns.surface} = 'admin' and ${timestampCondition(aiProposals.createdAt, filters)}
      group by ${aiProposals.proposalType}, ${aiProposals.status}
      order by count(*) desc, ${aiProposals.proposalType}, ${aiProposals.status}
      limit 16
    `),
    db.execute(sql`
      select ${aiRuns.id}, ${aiRuns.startedAt}, ${aiRuns.task}, ${aiRuns.model},
        ${aiRuns.promptVersion}, ${aiRuns.status}, ${aiRuns.errorCode}
      from ${aiRuns}
      where ${aiRuns.surface} = 'admin' and ${runWhere}
        and ${aiRuns.status} in ('failed', 'cancelled')
      order by ${aiRuns.startedAt} desc
      limit 20
    `),
  ]);

  const summary = rows(summaryResult)[0] ?? {};
  const feedback = rows(feedbackResult)[0] ?? {};
  const interactiveRuns = numberValue(summary.runs);
  const completed = numberValue(summary.completed);
  const failed = numberValue(summary.failed);
  const cancelled = numberValue(summary.cancelled);
  const terminalAttempted = completed + failed;
  const modelUsage = rows(workflowCostResult)
    .filter((row) => String(row.task) === 'admin_chat')
    .map((row) => ({
      name: String(row.model),
      runs: numberValue(row.runs),
      tokens: numberValue(row.tokens),
      inputTokens: numberValue(row.input_tokens),
      outputTokens: numberValue(row.output_tokens),
    }));
  const interactiveCost = estimateAdminAiModelCost(modelUsage, interactiveRuns);
  const workflowCosts = new Map<string, { cost: number; coveredRuns: number; runs: number }>();
  for (const row of rows(workflowCostResult)) {
    const task = String(row.task);
    const runs = numberValue(row.runs);
    const estimate = estimateAdminAiModelCost(
      [
        {
          name: String(row.model),
          runs,
          tokens: numberValue(row.tokens),
          inputTokens: numberValue(row.input_tokens),
          outputTokens: numberValue(row.output_tokens),
        },
      ],
      runs,
    );
    const current = workflowCosts.get(task) ?? { cost: 0, coveredRuns: 0, runs: 0 };
    current.runs += runs;
    if (estimate.estimatedCostUsd != null) {
      current.cost += estimate.estimatedCostUsd;
      current.coveredRuns += runs;
    }
    workflowCosts.set(task, current);
  }
  const toolRows = rows(toolsResult);
  const toolCalls = toolRows.reduce((sum, row) => sum + numberValue(row.calls), 0);
  const completedToolCalls = toolRows.reduce((sum, row) => sum + numberValue(row.completed), 0);
  const ratedAnswers = numberValue(feedback.rated_answers);
  const helpfulAnswers = numberValue(feedback.helpful_answers);
  const p95DurationMs = nullableNumber(summary.p95_duration_ms);

  return {
    kind: 'operations',
    metrics: [
      { key: 'interactiveRequests', value: interactiveRuns, unit: 'number' },
      {
        key: 'responseCompletion',
        value: aiRate(completed, terminalAttempted),
        unit: 'percent',
        sample: terminalAttempted,
      },
      {
        key: 'toolCompletion',
        value: aiRate(completedToolCalls, toolCalls),
        unit: 'percent',
        sample: toolCalls,
      },
      {
        key: 'p95Latency',
        value: p95DurationMs,
        unit: 'milliseconds',
        sample: numberValue(summary.valid_duration_samples),
      },
      {
        key: 'helpfulRatings',
        value: aiRate(helpfulAnswers, ratedAnswers),
        unit: 'percent',
        sample: ratedAnswers,
      },
      {
        key: 'costPerCompletion',
        value:
          interactiveCost.estimatedCostUsd != null && completed > 0
            ? interactiveCost.estimatedCostUsd / completed
            : null,
        unit: 'usd',
        sample: completed,
      },
    ],
    summary: {
      interactiveRuns,
      completed,
      failed,
      cancelled,
      running: numberValue(summary.running),
      activeOperators: numberValue(summary.active_operators),
      validDurationSamples: numberValue(summary.valid_duration_samples),
      totalTokens: numberValue(summary.total_tokens),
      estimatedCostUsd: interactiveCost.estimatedCostUsd,
      costCoveragePct: interactiveRuns ? interactiveCost.costCoverageRate : null,
      assistantAnswers: numberValue(feedback.assistant_answers),
      ratedAnswers,
      helpfulAnswers,
      toolCalls,
      completedToolCalls,
    },
    trend: rows(trendResult).map((row) => ({
      bucket: String(row.bucket),
      runs: numberValue(row.runs),
      completed: numberValue(row.completed),
      failed: numberValue(row.failed),
      cancelled: numberValue(row.cancelled),
      tokens: numberValue(row.tokens),
    })),
    workflows: rows(workflowResult).map((row) => {
      const runs = numberValue(row.runs);
      const completed = numberValue(row.completed);
      const failed = numberValue(row.failed);
      const cost = workflowCosts.get(String(row.task));
      return {
        task: String(row.task),
        mode: classifyAiWorkload(String(row.task), String(row.representative_model)),
        runs,
        completed,
        failed,
        cancelled: numberValue(row.cancelled),
        completionPct: aiRate(completed, completed + failed),
        p95DurationMs: nullableNumber(row.p95_duration_ms),
        tokens: numberValue(row.tokens),
        estimatedCostUsd: cost && cost.coveredRuns === cost.runs ? cost.cost : null,
      };
    }),
    tools: toolRows.slice(0, 16).map((row) => {
      const calls = numberValue(row.calls);
      const completed = numberValue(row.completed);
      return {
        name: String(row.name),
        calls,
        completed,
        failed: numberValue(row.failed),
        completionPct: aiRate(completed, calls),
        p95DurationMs: nullableNumber(row.p95_duration_ms),
      };
    }),
    releases: rows(releasesResult).map((row) => {
      const runs = numberValue(row.runs);
      const completed = numberValue(row.completed);
      const failed = numberValue(row.failed);
      const estimate = estimateAdminAiModelCost(
        [
          {
            name: String(row.model),
            runs,
            tokens: numberValue(row.tokens),
            inputTokens: numberValue(row.input_tokens),
            outputTokens: numberValue(row.output_tokens),
          },
        ],
        runs,
      );
      return {
        promptVersion: String(row.prompt_version),
        model: String(row.model),
        runs,
        completed,
        failed,
        cancelled: numberValue(row.cancelled),
        completionPct: aiRate(completed, completed + failed),
        p95DurationMs: nullableNumber(row.p95_duration_ms),
        tokens: numberValue(row.tokens),
        estimatedCostUsd: estimate.estimatedCostUsd,
      };
    }),
    changes: rows(changesResult).map((row) => ({
      type: String(row.type),
      status: String(row.status),
      count: numberValue(row.count),
    })),
    exceptions: rows(exceptionsResult).map((row) => ({
      id: numberValue(row.id),
      startedAt: isoValue(row.started_at) ?? '',
      task: String(row.task),
      model: String(row.model),
      promptVersion: String(row.prompt_version),
      status: String(row.status),
      errorCode: row.error_code == null ? null : String(row.error_code),
    })),
  };
}
