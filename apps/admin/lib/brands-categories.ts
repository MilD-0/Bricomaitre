import { z } from 'zod';

import { paginationMetaSchema, paginationQuerySchema } from './pagination';

export { paginationQuerySchema };

const auditFieldsSchema = z.object({
  createdAt: z.string(),
  updatedAt: z.string(),
  createdBy: z.string().nullable().optional(),
  createdByName: z.string().nullable().optional(),
  updatedBy: z.string().nullable().optional(),
  updatedByName: z.string().nullable().optional(),
});

const brandRowSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    isActive: z.boolean(),
    featured: z.boolean().optional(),
    status: z.enum(['active', 'draft']),
    image: z.string().nullable().optional(),
    productCount: z.number().int().nonnegative().default(0),
  })
  .extend(auditFieldsSchema.shape);

const categoryRowSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    nameAr: z.string().nullable().optional(),
    image: z.string().nullable().optional(),
    isActive: z.boolean(),
    featured: z.boolean().optional(),
    status: z.enum(['active', 'draft']),
    parentId: z.string().nullable(),
    parentName: z.string().nullable(),
    productCount: z.number().int().nonnegative().default(0),
  })
  .extend(auditFieldsSchema.shape);

export const brandFormSchema = z.object({
  name: z.string().trim().min(1).max(120),
  imageUrl: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((value) => {
      const normalized = value?.trim() ?? '';
      return normalized.length > 0 ? normalized : null;
    }),
});

export const brandUpdateSchema = brandFormSchema.partial().extend({
  status: z.enum(['active', 'draft']).optional(),
});

const categoryParentIdSchema = z
  .union([z.coerce.number().int().positive(), z.literal(''), z.literal(0), z.nan(), z.null()])
  .transform((value) =>
    typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null,
  );

export const categoryFormSchema = z.object({
  name: z.string().trim().min(1).max(120),
  nameAr: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((value) => {
      const normalized = value?.trim() ?? '';
      return normalized.length > 0 ? normalized : null;
    }),
  imageUrl: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((value) => {
      const normalized = value?.trim() ?? '';
      return normalized.length > 0 ? normalized : null;
    }),
  parentId: categoryParentIdSchema.optional(),
});

export const categoryUpdateSchema = categoryFormSchema.partial().extend({
  status: z.enum(['active', 'draft']).optional(),
});

export const brandsListResponseSchema = z.object({
  writable: z.boolean(),
  items: z.array(brandRowSchema),
  pagination: paginationMetaSchema,
});

export const categoriesListResponseSchema = z.object({
  writable: z.boolean(),
  items: z.array(categoryRowSchema),
  parentOptions: z.array(z.object({ id: z.string(), name: z.string() })),
  pagination: paginationMetaSchema,
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
