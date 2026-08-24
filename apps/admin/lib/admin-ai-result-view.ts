export type AdminAiToolResult = {
  toolName: string;
  output: unknown;
};

export type AdminAiMetric = {
  key: string;
  value: string | number | boolean | null;
  previous?: string | number | boolean | null;
  changePct?: number | null;
  unit?: string;
};

export type AdminAiResultTable = {
  path: string;
  rows: Record<string, unknown>[];
  columns: string[];
  available: number;
};

export type AdminAiDisplayValue =
  string | number | boolean | null | Array<string | number | boolean | null>;

export function isAdminAiScalar(value: unknown): value is string | number | boolean | null {
  return value === null || ['string', 'number', 'boolean'].includes(typeof value);
}

function isAdminAiDisplayValue(value: unknown): value is AdminAiDisplayValue {
  return isAdminAiScalar(value) || (Array.isArray(value) && value.every(isAdminAiScalar));
}

export function adminAiToolResultsFromUnknown(value: unknown, depth = 0): AdminAiToolResult[] {
  if (depth > 5 || value == null) return [];
  if (Array.isArray(value))
    return value.flatMap((item) => adminAiToolResultsFromUnknown(item, depth + 1));
  if (typeof value !== 'object') return [];
  const item = value as Record<string, unknown>;
  if (item.type === 'tool-result' && typeof item.toolName === 'string' && 'output' in item) {
    return [{ toolName: item.toolName, output: item.output }];
  }
  return Object.values(item).flatMap((child) => adminAiToolResultsFromUnknown(child, depth + 1));
}

export function adminAiScalarEntries(
  value: unknown,
  maxEntries = 10,
): Array<[string, AdminAiDisplayValue]> {
  const entries: Array<[string, AdminAiDisplayValue]> = [];
  const visit = (current: unknown, path: string, depth: number) => {
    if (entries.length >= maxEntries || depth > 3 || !current || typeof current !== 'object')
      return;
    for (const [key, child] of Object.entries(current as Record<string, unknown>)) {
      if (entries.length >= maxEntries) return;
      const nextPath = path ? `${path}.${key}` : key;
      if (isAdminAiDisplayValue(child)) {
        if (key !== 'kind' && key !== 'type') entries.push([nextPath, child]);
      } else if (!Array.isArray(child)) {
        visit(child, nextPath, depth + 1);
      }
    }
  };
  visit(value, '', 0);
  return entries;
}

export function adminAiResultTables(value: unknown, maxTables = 3): AdminAiResultTable[] {
  const tables: AdminAiResultTable[] = [];
  const addTable = (rows: unknown[], path: string) => {
    const records = rows.filter(
      (row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object',
    );
    if (records.length === 0) return;
    const columns = [...new Set(records.flatMap((row) => Object.keys(row)))]
      .filter((column) => records.some((row) => isAdminAiDisplayValue(row[column])))
      .slice(0, 6);
    if (columns.length > 0) {
      tables.push({
        path,
        rows: records.slice(0, 10),
        columns,
        available: records.length,
      });
    }
  };
  const visit = (current: unknown, path: string, depth: number) => {
    if (tables.length >= maxTables || depth > 4 || !current || typeof current !== 'object') return;
    for (const [key, child] of Object.entries(current as Record<string, unknown>)) {
      if (tables.length >= maxTables) return;
      const nextPath = path ? `${path}.${key}` : key;
      if (Array.isArray(child)) {
        addTable(child, nextPath);
        child.slice(0, 2).forEach((row, index) => {
          if (tables.length < maxTables && row && typeof row === 'object') {
            visit(row, `${nextPath}[${index}]`, depth + 1);
          }
        });
      } else if (child && typeof child === 'object') {
        visit(child, nextPath, depth + 1);
      }
    }
  };
  if (Array.isArray(value)) addTable(value, 'results');
  else visit(value, '', 0);
  return tables;
}

export function adminAiMetricsFromUnknown(value: unknown, depth = 0): AdminAiMetric[] {
  if (depth > 6 || value == null) return [];
  if (Array.isArray(value))
    return value.flatMap((item) => adminAiMetricsFromUnknown(item, depth + 1));
  if (typeof value !== 'object') return [];
  const item = value as Record<string, unknown>;
  const isMetric =
    typeof item.key === 'string' &&
    isAdminAiScalar(item.value) &&
    ('previous' in item || 'changePct' in item || typeof item.unit === 'string');
  if (isMetric) {
    return [
      {
        key: item.key as string,
        value: item.value as AdminAiMetric['value'],
        ...(isAdminAiScalar(item.previous) ? { previous: item.previous } : {}),
        ...(typeof item.changePct === 'number' || item.changePct === null
          ? { changePct: item.changePct }
          : {}),
        ...(typeof item.unit === 'string' ? { unit: item.unit } : {}),
      },
    ];
  }
  return Object.values(item).flatMap((child) => adminAiMetricsFromUnknown(child, depth + 1));
}
