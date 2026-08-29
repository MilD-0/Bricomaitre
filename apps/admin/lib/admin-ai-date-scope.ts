import { z } from 'zod';

import { dayInTimezone } from './analytics/date-range';

export const adminAiDateScopeSchema = z
  .discriminatedUnion('kind', [
    z.object({ kind: z.literal('rolling'), period: z.enum(['7d', '14d', '30d', '90d']) }).strict(),
    z.object({ kind: z.literal('year_to_date') }).strict(),
    z.object({ kind: z.literal('all') }).strict(),
    z.object({ kind: z.literal('day'), date: z.iso.date() }).strict(),
    z.object({ kind: z.literal('range'), from: z.iso.date(), to: z.iso.date() }).strict(),
    z.object({ kind: z.literal('since'), date: z.iso.date() }).strict(),
    z.object({ kind: z.literal('through'), date: z.iso.date() }).strict(),
  ])
  .default({ kind: 'rolling', period: '30d' })
  .superRefine((value, context) => {
    if (value.kind === 'range' && value.from > value.to) {
      context.addIssue({
        code: 'custom',
        path: ['from'],
        message: 'Date range from must not be after to.',
      });
    }
  })
  .describe(
    'Date scope. Use a rolling period only when requested; otherwise distinguish one day, an inclusive range, since, through, year to date, and all history.',
  );

export type AdminAiDateScope = z.output<typeof adminAiDateScopeSchema>;

export function canonicalAdminAiDateQuery(date: AdminAiDateScope, now = new Date()) {
  if (date.kind === 'rolling') return { range: date.period };
  if (date.kind === 'year_to_date') return { range: 'year' as const };
  if (date.kind === 'all') return { range: 'all' as const };
  if (date.kind === 'day') {
    return { range: 'custom' as const, startDate: date.date, endDate: date.date };
  }
  if (date.kind === 'range') {
    return { range: 'custom' as const, startDate: date.from, endDate: date.to };
  }
  if (date.kind === 'since') {
    return { range: 'custom' as const, startDate: date.date, endDate: dayInTimezone(now) };
  }
  return { range: 'all' as const, endDate: date.date };
}
