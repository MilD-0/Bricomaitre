export type ToastTone = 'loading' | 'success' | 'error';

export type ToastRecord = {
  id: string;
  message: string;
  tone: ToastTone;
};

type ToastInput = {
  id?: string;
  duration?: number;
  message: string;
  tone: ToastTone;
};

let toasts: ToastRecord[] = [];
const listeners = new Set<() => void>();
const timeouts = new Map<string, ReturnType<typeof setTimeout>>();

function emit() {
  listeners.forEach((listener) => listener());
}

function scheduleRemoval(id: string, duration = 3000) {
  const existingTimeout = timeouts.get(id);
  if (existingTimeout) {
    clearTimeout(existingTimeout);
  }

  const timeout = setTimeout(() => {
    dismissToast(id);
  }, duration);

  timeouts.set(id, timeout);
}

function upsertToast({ duration, id = crypto.randomUUID(), message, tone }: ToastInput) {
  const record = { id, message, tone };
  const existingIndex = toasts.findIndex((toast) => toast.id === id);

  if (existingIndex === -1) {
    toasts = [...toasts, record];
  } else {
    toasts = toasts.map((toast) => (toast.id === id ? record : toast));
  }

  if (tone === 'loading') {
    const existingTimeout = timeouts.get(id);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
      timeouts.delete(id);
    }
  } else {
    scheduleRemoval(id, duration);
  }

  emit();
  return id;
}

export function dismissToast(id: string) {
  toasts = toasts.filter((toast) => toast.id !== id);
  const existingTimeout = timeouts.get(id);
  if (existingTimeout) {
    clearTimeout(existingTimeout);
    timeouts.delete(id);
  }
  emit();
}

export function clearToasts() {
  toasts = [];
  timeouts.forEach((timeout) => clearTimeout(timeout));
  timeouts.clear();
  emit();
}

export function subscribeToToasts(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getToastSnapshot() {
  return toasts;
}

export const toast = {
  loading(message: string) {
    return upsertToast({ message, tone: 'loading' });
  },
  success(message: string, options?: { id?: string; duration?: number }) {
    return upsertToast({ ...options, message, tone: 'success' });
  },
  error(message: string, options?: { id?: string; duration?: number }) {
    return upsertToast({ ...options, message, tone: 'error' });
  },
  dismiss: dismissToast,
  clear: clearToasts,
};
