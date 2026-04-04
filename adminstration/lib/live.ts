'use client';

import { useEffect } from 'react';
import type { EntityType } from './entity-types';

export function useLiveUpdates(entityType: EntityType) {
  useEffect(() => {
    void entityType;
    // Placeholder for websocket/SSE hooks once backend real-time updates are added.
  }, [entityType]);
}
