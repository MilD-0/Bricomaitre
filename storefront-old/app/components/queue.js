// utils/orderQueue.js
const QUEUE_KEY = "pendingOrders";

export const orderQueue = {
  add(order) {
    const queue = this.getAll();
    const orderWithMeta = {
      ...order,
      _queueId: crypto.randomUUID(),
      _queuedAt: Date.now(),
      _attempts: 0,
    };
    queue.push(orderWithMeta);
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    return orderWithMeta._queueId;
  },

  getAll() {
    try {
      return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
    } catch {
      return [];
    }
  },

  remove(queueId) {
    const queue = this.getAll().filter((o) => o._queueId !== queueId);
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  },

  incrementAttempts(queueId) {
    const queue = this.getAll().map((o) =>
      o._queueId === queueId ? { ...o, _attempts: o._attempts + 1 } : o
    );
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  },

  hasPending() {
    return this.getAll().length > 0;
  },
};