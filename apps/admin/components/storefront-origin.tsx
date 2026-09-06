'use client';

import { createContext, useContext } from 'react';

const StorefrontOrigin = createContext('https://bricomaitre.com');
export const StorefrontOriginProvider = StorefrontOrigin.Provider;
export function useStorefrontBaseUrl() {
  return useContext(StorefrontOrigin);
}
