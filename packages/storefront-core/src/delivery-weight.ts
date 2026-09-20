type WeightedItem = { weightKg?: number | string | null; quantity: number };

// Add grams as integers so fractional kilos cannot cross a billing boundary through rounding.
export function getTotalWeightKg(items: readonly WeightedItem[]) {
  return (
    items.reduce((grams, item) => {
      const weight = Number(item.weightKg ?? 0);
      return grams + Math.round(weight * 1000) * item.quantity;
    }, 0) / 1000
  );
}

// The first 5 kg are included. Each started additional kilo costs 50 DA.
export function getWeightSurcharge(weightKg: number) {
  return Math.ceil(Math.max(0, Math.round(weightKg * 1000) - 5000) / 1000) * 50;
}
