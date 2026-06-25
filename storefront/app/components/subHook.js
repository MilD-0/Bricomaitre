// hooks/useOrderSubmission.js
import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { orderQueue } from "./queue";

// hooks/useOrderSubmission.js

const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 3000, 10000];

export function useOrderSubmission() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );

  // 1. Define submitWithRetry FIRST
  const submitWithRetry = useCallback(async (data, attempt = 0) => {
    try {
      const response = await axios.post("/api/orders", data, {
        timeout: 15000,
      });
      return { success: true, response };
    } catch (error) {
      const isNetworkError =
        !error.response ||
        error.code === "ECONNABORTED" ||
        (typeof navigator !== "undefined" && !navigator.onLine);

      if (isNetworkError && attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt]));
        return submitWithRetry(data, attempt + 1);
      }

      return { success: false, error, isNetworkError };
    }
  }, []);

  // 2. Define processQueue SECOND (depends on submitWithRetry)
  const processQueue = useCallback(async () => {
    const pending = orderQueue.getAll();

    for (const order of pending) {
      if (order._attempts >= MAX_RETRIES) continue;

      orderQueue.incrementAttempts(order._queueId);
      const { _queueId, _queuedAt, _attempts, ...orderData } = order;

      const result = await submitWithRetry(orderData);
      if (result.success) {
        orderQueue.remove(_queueId);
      }
    }
  }, [submitWithRetry]);

  // 3. Online/offline listener
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // 4. Process queue when coming back online (NOW processQueue is defined)
  useEffect(() => {
    if (isOnline && orderQueue.hasPending()) {
      processQueue();
    }
  }, [isOnline, processQueue]);

  // 5. Define submit LAST
  const submit = useCallback(
    async (data, { onSuccess, onError, onQueued }) => {
      setIsSubmitting(true);

      try {
        if (typeof navigator !== "undefined" && !navigator.onLine) {
          const queueId = orderQueue.add(data);
          onQueued?.(queueId);
          return { queued: true, queueId };
        }

        const result = await submitWithRetry(data);

        if (result.success) {
          onSuccess?.(result.response);
          return { success: true, response: result.response };
        }

        if (result.isNetworkError) {
          const queueId = orderQueue.add(data);
          onQueued?.(queueId);
          return { queued: true, queueId };
        }

        onError?.(result.error);
        return { success: false, error: result.error };
      } finally {
        setIsSubmitting(false);
      }
    },
    [submitWithRetry]
  );

  return { submit, isSubmitting, isOnline, processQueue };
}
