import type { AdminAiResultTable } from '../../lib/admin-ai-result-view';
import { ScrollableRegion } from '../ui/scrollable-region';

export function AdminAiResultTable({
  table,
  formatLabel,
  formatValue,
  showingRows,
  compact = false,
}: {
  table: AdminAiResultTable;
  formatLabel: (value: string) => string;
  formatValue: (value: unknown) => React.ReactNode;
  showingRows: (shown: number, available: number) => React.ReactNode;
  compact?: boolean;
}) {
  const label = formatLabel(table.path);

  return (
    <ScrollableRegion
      label={label}
      className={compact ? 'px-1 pb-2' : 'border-t border-border/50 px-3 pb-3'}
    >
      {compact ? (
        table.available > table.rows.length ? (
          <p className="min-w-[28rem] px-2 pb-1 pt-2 text-end text-[length:var(--type-size-label)] text-muted-foreground">
            {showingRows(table.rows.length, table.available)}
          </p>
        ) : null
      ) : (
        <div className="flex min-w-[28rem] items-center justify-between gap-3 px-2 pb-1 pt-2.5 text-[length:var(--type-size-label)] text-muted-foreground">
          <p className="font-medium capitalize">{label}</p>
          {table.available > table.rows.length ? (
            <p>{showingRows(table.rows.length, table.available)}</p>
          ) : null}
        </div>
      )}
      <table className="w-full min-w-[28rem] text-start text-xs">
        <thead>
          <tr className="text-muted-foreground">
            {table.columns.map((column) => (
              <th key={column} className="border-b px-2 py-2 font-medium capitalize">
                {formatLabel(column)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, index) => (
            <tr key={index}>
              {table.columns.map((column) => (
                <td
                  key={column}
                  className="max-w-48 border-b border-border/45 px-2 py-2 [overflow-wrap:anywhere]"
                >
                  {formatValue(row[column])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollableRegion>
  );
}
