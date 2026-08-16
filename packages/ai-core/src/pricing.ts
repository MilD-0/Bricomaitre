import { z } from 'zod';

export const minimumGrossMarginSchema = z.number().min(0).max(0.95);

export function calculateGrossMargin(input: { sellingPrice: number; purchaseCost: number }) {
  if (input.sellingPrice <= 0) return 0;
  return (input.sellingPrice - input.purchaseCost) / input.sellingPrice;
}

export function minimumSellingPriceForMargin(input: {
  purchaseCost: number;
  minimumGrossMargin?: number;
}) {
  const margin = minimumGrossMarginSchema.parse(input.minimumGrossMargin ?? 0.15);
  if (input.purchaseCost < 0) throw new Error('Purchase cost cannot be negative.');
  return Math.ceil((input.purchaseCost / (1 - margin)) * 100) / 100;
}

export function evaluateDiscountPrice(input: {
  proposedPrice: number;
  purchaseCost: number;
  minimumGrossMargin?: number;
}) {
  const minimumPrice = minimumSellingPriceForMargin(input);
  const grossMargin = calculateGrossMargin({
    sellingPrice: input.proposedPrice,
    purchaseCost: input.purchaseCost,
  });
  return { allowed: input.proposedPrice >= minimumPrice, minimumPrice, grossMargin };
}
