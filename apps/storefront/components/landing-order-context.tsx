'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

const LandingOrderContext = createContext<{
  productId: number;
  quantity: number;
  setQuantity: (quantity: number) => void;
  locked: boolean;
  setLocked: (locked: boolean) => void;
} | null>(null);

export function LandingOrderProvider({
  productId,
  children,
}: {
  productId: number;
  children: ReactNode;
}) {
  const [quantity, setQuantity] = useState(1);
  const [locked, setLocked] = useState(false);
  const value = useMemo(
    () => ({ productId, quantity, setQuantity, locked, setLocked }),
    [productId, quantity, locked],
  );
  return <LandingOrderContext value={value}>{children}</LandingOrderContext>;
}

export function useLandingOrder() {
  return useContext(LandingOrderContext);
}
