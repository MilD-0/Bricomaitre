export const ADMIN_AI_CATALOG_KNOWLEDGE = {
  system:
    'Products, brands, categories, and inventory are one catalog system centered on the product record.',
  availability:
    'A non-archived product must be active to appear on the Storefront. Once active, inStock determines whether it appears available or out of stock and whether it can be ordered. inventoryQuantity is the internal count; inventory movements update the related availability state, while operators can still control stock state. Archived products remain available to Inventory. Restoring only removes the archive state; it does not reactivate or restock the product.',
  pricing:
    'price is the selling price, oldPrice is the compare-at price, and purchasePrice is internal cost. Promo codes are separate, time-bounded product discounts and apply only when exactly one product in the cart matches the code.',
  taxonomy:
    'Brands and categories classify products. Making taxonomy inactive does not hide its products. Categories can form parent-child hierarchies, and parent catalog views include descendants.',
  historyAndPerformance:
    'Catalog values describe the product now. Existing orders retain their captured product, price, discount, and cost facts. Use Analytics for dated business performance; Products workspace purchase and confirmation counts describe order lifecycle participation, not completed sales.',
} as const;
