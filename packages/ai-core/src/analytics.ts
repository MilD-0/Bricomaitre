import { z } from 'zod';

export const semanticAnalyticsQueryNameSchema = z.enum([
  'catalog_summary',
  'sales_summary',
  'order_summary',
  'funnel_summary',
  'meta_commerce_performance',
  'product_performance',
  'category_performance',
  'brand_performance',
  'inventory_risk',
  'promotion_performance',
  'bundle_performance',
  'missing_content',
]);

const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD dates.');

export const semanticAnalyticsQuerySchema = z
  .object({
    query: semanticAnalyticsQueryNameSchema,
    startDate: dateOnlySchema.optional(),
    endDate: dateOnlySchema.optional(),
    productId: z.number().int().positive().optional(),
    categoryId: z.number().int().positive().optional(),
    brandId: z.number().int().positive().optional(),
    confirmedOnly: z.boolean().default(false),
    limit: z.number().int().min(1).max(50).default(10),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.startDate && value.endDate) {
      const start = Date.parse(`${value.startDate}T00:00:00.000Z`);
      const end = Date.parse(`${value.endDate}T23:59:59.999Z`);
      if (start > end)
        ctx.addIssue({
          code: 'custom',
          path: ['endDate'],
          message: 'End date must not precede start date.',
        });
      if ((end - start) / 86_400_000 > 366)
        ctx.addIssue({
          code: 'custom',
          path: ['endDate'],
          message: 'Analytics date ranges are limited to 366 days.',
        });
    }
    const dateAware = [
      'sales_summary',
      'order_summary',
      'funnel_summary',
      'meta_commerce_performance',
      'promotion_performance',
    ];
    if ((value.startDate || value.endDate) && !dateAware.includes(value.query)) {
      ctx.addIssue({
        code: 'custom',
        path: ['query'],
        message: `${value.query} does not support date filters.`,
      });
    }
    const productFilterAware = [
      'product_performance',
      'inventory_risk',
      'bundle_performance',
      'missing_content',
    ];
    if (value.productId && !productFilterAware.includes(value.query))
      ctx.addIssue({
        code: 'custom',
        path: ['productId'],
        message: `${value.query} does not support a product filter.`,
      });
    const categoryFilterAware = [
      'product_performance',
      'category_performance',
      'inventory_risk',
      'missing_content',
    ];
    if (value.categoryId && !categoryFilterAware.includes(value.query))
      ctx.addIssue({
        code: 'custom',
        path: ['categoryId'],
        message: `${value.query} does not support a category filter.`,
      });
    const brandFilterAware = [
      'product_performance',
      'brand_performance',
      'inventory_risk',
      'missing_content',
    ];
    if (value.brandId && !brandFilterAware.includes(value.query))
      ctx.addIssue({
        code: 'custom',
        path: ['brandId'],
        message: `${value.query} does not support a brand filter.`,
      });
    if (value.confirmedOnly && !['order_summary', 'promotion_performance'].includes(value.query))
      ctx.addIssue({
        code: 'custom',
        path: ['confirmedOnly'],
        message: `${value.query} does not support confirmedOnly.`,
      });
  });

export type SemanticAnalyticsQuery = z.infer<typeof semanticAnalyticsQuerySchema>;

export const semanticAnalyticsComparisonSchema = z
  .object({
    query: z.enum(['sales_summary', 'order_summary', 'funnel_summary', 'promotion_performance']),
    currentStartDate: dateOnlySchema,
    currentEndDate: dateOnlySchema,
    previousStartDate: dateOnlySchema,
    previousEndDate: dateOnlySchema,
    confirmedOnly: z.boolean().default(false),
    limit: z.number().int().min(1).max(50).default(10),
  })
  .strict()
  .superRefine((value, ctx) => {
    const ranges = [
      ['currentStartDate', 'currentEndDate'],
      ['previousStartDate', 'previousEndDate'],
    ] as const;
    for (const [startKey, endKey] of ranges) {
      const start = Date.parse(`${value[startKey]}T00:00:00.000Z`);
      const end = Date.parse(`${value[endKey]}T23:59:59.999Z`);
      if (start > end)
        ctx.addIssue({
          code: 'custom',
          path: [endKey],
          message: 'Period end must not precede its start.',
        });
      if ((end - start) / 86_400_000 > 366)
        ctx.addIssue({
          code: 'custom',
          path: [endKey],
          message: 'Each comparison period is limited to 366 days.',
        });
    }
  });

export type SemanticAnalyticsComparison = z.infer<typeof semanticAnalyticsComparisonSchema>;

export const SEMANTIC_ANALYTICS_CATALOG = {
  catalog_summary:
    'Current catalog counts, stock coverage, inventory retail value, and inventory cost value.',
  sales_summary:
    'Imported fulfilled-order revenue, fees, product cost, and profit over a date range.',
  order_summary:
    'Storefront order volume, confirmation rate, order value, and discounts over a date range.',
  funnel_summary:
    'Storefront sessions, views, carts, checkouts, purchases, and step conversion rates.',
  meta_commerce_performance:
    'Meta ad delivery and spend joined to first-party orders, product economics, ECOTRACK outcomes, and imported settlements.',
  product_performance: 'Current all-time product commerce counters and conversion signals.',
  category_performance: 'Current category-level product counters and conversion signals.',
  brand_performance: 'Current brand-level product counters and conversion signals.',
  inventory_risk: 'Current low-stock, out-of-stock, and missing-cost product risks.',
  promotion_performance:
    'Order usage, original subtotal, discount, and final subtotal grouped by promo code.',
  bundle_performance:
    'Current bundle listing state, pricing, component count, sales, and conversion signals.',
  missing_content: 'Active products missing Arabic title or French/Arabic descriptions.',
} as const;
