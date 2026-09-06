'use client';

import { useEffect, useState } from 'react';
import type { z } from 'zod';
import { fetchNavigationMeta, type navigationMetaSchema } from '@/lib/navigation-categories';

export function useNavigationMeta() {
  const [meta, setMeta] = useState<z.infer<typeof navigationMetaSchema>>({
    categories: [],
    brands: [],
  });
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void fetchNavigationMeta(controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setMeta(value);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [attempt]);
  function retry() {
    setFailed(false);
    setLoading(true);
    setAttempt((value) => value + 1);
  }
  return { meta, loading, failed, retry };
}
