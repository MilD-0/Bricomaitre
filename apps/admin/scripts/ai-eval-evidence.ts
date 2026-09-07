import 'dotenv/config';

function trimForLog(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[nested value omitted]';
  if (typeof value === 'string') return value.length > 600 ? `${value.slice(0, 599)}…` : value;
  if (Array.isArray(value)) {
    const limit = depth <= 2 ? 12 : 8;
    return value.slice(0, limit).map((item) => trimForLog(item, depth + 1));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, child]) => [
        key,
        trimForLog(child, depth + 1),
      ]),
    );
  }
  return value;
}

export function evidenceSummary(output: unknown) {
  if (!output || typeof output !== 'object') return output;
  const record = output as Record<string, unknown>;
  const keys = [
    'kind',
    'view',
    'surface',
    'filters',
    'appliedQuery',
    'effectiveRanges',
    'metrics',
    'sourceCoverage',
    'warnings',
    'pagination',
    'matchedOrders',
    'requestedIds',
    'missingIds',
    'items',
    'topics',
    'settings',
    'announcement',
    'configuredAiModels',
    'banners',
    'featuredGroups',
    'productCards',
    'before',
    'after',
    'applied',
    'reason',
  ];
  return trimForLog(
    Object.fromEntries(keys.flatMap((key) => (key in record ? [[key, record[key]]] : []))),
  );
}

export function compactEvidenceForLog(evidence: Array<{ toolName: string; summary: unknown }>) {
  return evidence.map(({ toolName, summary }) => {
    if (!summary || typeof summary !== 'object' || Array.isArray(summary)) {
      return { toolName, summary };
    }
    const value = summary as Record<string, unknown>;
    const metrics = Array.isArray(value.metrics)
      ? value.metrics.flatMap((metric) => {
          if (!metric || typeof metric !== 'object' || Array.isArray(metric)) return [];
          const row = metric as Record<string, unknown>;
          return [
            Object.fromEntries(
              ['key', 'value', 'coveragePct', 'effectiveRange', 'assumptions', 'warning'].flatMap(
                (key) => (key in row ? [[key, row[key]]] : []),
              ),
            ),
          ];
        })
      : undefined;
    const sourceCoverage =
      value.sourceCoverage &&
      typeof value.sourceCoverage === 'object' &&
      !Array.isArray(value.sourceCoverage)
        ? Object.fromEntries(
            [
              'eligibleRecords',
              'coveredRecords',
              'missingRecords',
              'coveragePct',
              'gapReasons',
            ].flatMap((key) =>
              key in (value.sourceCoverage as Record<string, unknown>)
                ? [[key, (value.sourceCoverage as Record<string, unknown>)[key]]]
                : [],
            ),
          )
        : undefined;
    return {
      toolName,
      ...Object.fromEntries(
        ['kind', 'view', 'surface', 'pagination', 'matchedOrders', 'applied', 'reason'].flatMap(
          (key) => (key in value ? [[key, value[key]]] : []),
        ),
      ),
      ...(metrics ? { metrics } : {}),
      ...(sourceCoverage ? { sourceCoverage } : {}),
      ...(Array.isArray(value.items) ? { sampleItems: value.items.slice(0, 2) } : {}),
      ...(Array.isArray(value.topics)
        ? {
            topics: value.topics.flatMap((topic) => {
              if (!topic || typeof topic !== 'object' || Array.isArray(topic)) return [];
              const name = (topic as Record<string, unknown>).topic;
              return typeof name === 'string' ? [name] : [];
            }),
          }
        : {}),
    };
  });
}

export function savedEvidence(result: {
  steps: ReadonlyArray<{
    toolResults: ReadonlyArray<{ toolName: string; input: unknown; output: unknown }>;
  }>;
}) {
  const evidence = result.steps.flatMap((step) =>
    step.toolResults.map((toolResult) => ({
      type: 'tool-result',
      toolName: toolResult.toolName,
      input: toolResult.input,
      output: toolResult.output,
    })),
  );
  const serialized = JSON.stringify(evidence);
  return serialized.length <= 12_000 ? serialized : `${serialized.slice(0, 11_900)}…`;
}
