import { z } from 'zod';

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(50),
  search: z.string().trim().optional().default(''),
});

export const paginationMetaSchema = z.object({
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().positive(),
  hasNextPage: z.boolean(),
  hasPreviousPage: z.boolean(),
});

export type PaginationMeta = z.infer<typeof paginationMetaSchema>;

export type PaginationItem = number | `ellipsis-${number}`;

export function getPaginationItems(currentPage: number, totalPages: number): PaginationItem[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);

  const visiblePages =
    currentPage <= 4
      ? [1, 2, 3, 4, 5, totalPages]
      : currentPage >= totalPages - 3
        ? [1, totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages]
        : [1, currentPage - 1, currentPage, currentPage + 1, totalPages];
  const items: PaginationItem[] = [];

  visiblePages.forEach((page, index) => {
    const previousPage = visiblePages[index - 1];
    if (previousPage && page - previousPage > 1) items.push(`ellipsis-${previousPage}`);
    items.push(page);
  });

  return items;
}
