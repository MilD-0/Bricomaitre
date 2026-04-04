import { z } from 'zod';

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(50),
  search: z.string().trim().optional().default(''),
});

const auditFieldsSchema = z.object({
  createdAt: z.string(),
  updatedAt: z.string(),
  createdBy: z.string().nullable().optional(),
  createdByName: z.string().nullable().optional(),
  updatedBy: z.string().nullable().optional(),
  updatedByName: z.string().nullable().optional(),
});

export const brandRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  isActive: z.boolean(),
  status: z.enum(['active', 'draft']),
  image: z.string().nullable().optional(),
}).extend(auditFieldsSchema.shape);

export const categoryRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  nameAr: z.string().nullable().optional(),
  image: z.string().nullable().optional(),
  isActive: z.boolean(),
  status: z.enum(['active', 'draft']),
  parentId: z.string().nullable(),
  parentName: z.string().nullable(),
}).extend(auditFieldsSchema.shape);

export const brandFormSchema = z.object({
  name: z.string().trim().min(1).max(120),
  imageUrl: z.string().trim().min(1),
});

export const brandUpdateSchema = brandFormSchema.partial().extend({
  status: z.enum(['active', 'draft']).optional(),
});

export const categoryFormSchema = z.object({
  name: z.string().trim().min(1).max(120),
  nameAr: z.string().trim().optional().nullable().transform((value) => {
    const normalized = value?.trim() ?? '';
    return normalized.length > 0 ? normalized : null;
  }),
  imageUrl: z.string().trim().optional().nullable().transform((value) => {
    const normalized = value?.trim() ?? '';
    return normalized.length > 0 ? normalized : null;
  }),
  parentId: z.coerce.number().int().positive().nullable().optional(),
});

export const categoryUpdateSchema = categoryFormSchema.partial().extend({
  status: z.enum(['active', 'draft']).optional(),
});

export const paginatedListMetaSchema = z.object({
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().positive(),
  hasNextPage: z.boolean(),
  hasPreviousPage: z.boolean(),
});

export const brandsListResponseSchema = z.object({
  writable: z.boolean(),
  items: z.array(brandRowSchema),
  pagination: paginatedListMetaSchema,
});

export const categoriesListResponseSchema = z.object({
  writable: z.boolean(),
  items: z.array(categoryRowSchema),
  parentOptions: z.array(z.object({ id: z.string(), name: z.string() })),
  pagination: paginatedListMetaSchema,
});

export type BrandRow = z.infer<typeof brandRowSchema>;
export type CategoryRow = z.infer<typeof categoryRowSchema>;
export type BrandFormValues = z.infer<typeof brandFormSchema>;
export type CategoryFormValues = z.infer<typeof categoryFormSchema>;
export type BrandFormInput = z.input<typeof brandFormSchema>;
export type CategoryFormInput = z.input<typeof categoryFormSchema>;
export type BrandUpdateValues = z.infer<typeof brandUpdateSchema>;
export type CategoryUpdateValues = z.infer<typeof categoryUpdateSchema>;
export type BrandsListResponse = z.infer<typeof brandsListResponseSchema>;
export type CategoriesListResponse = z.infer<typeof categoriesListResponseSchema>;
