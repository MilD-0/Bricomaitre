import { describe, expect, it, vi } from 'vitest';

import {
  applyHistoryAction,
  getActionEntityConfig,
  getActionHistoryChanges,
  mutateEntityWithHistory,
  recordExplicitActionLog,
  toActionHistoryItem,
} from './action-history';

function createSelectBuilder(row: unknown) {
  return {
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn().mockResolvedValue(row ? [row] : []),
      })),
      orderBy: vi.fn(() => ({
        limit: vi.fn().mockResolvedValue(Array.isArray(row) ? row : row ? [row] : []),
      })),
    })),
  };
}

function createActionLogSelectBuilder(row: unknown) {
  return {
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn().mockResolvedValue(row ? [row] : []),
      })),
    })),
  };
}

function createHistoryListSelectBuilder(historyRows: Array<{ id: number; isUndone: boolean }>) {
  return {
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        orderBy: vi.fn().mockResolvedValue(historyRows),
      })),
    })),
  };
}

describe('action-history helpers', () => {
  it('registers bulletin posts as a tracked entity', () => {
    expect(getActionEntityConfig('bulletinPosts')).toMatchObject({
      entityType: 'bulletinPosts',
      resource: 'bulletin',
    });
  });

  it('registers ecotrack shipments as a non-reversible tracked entity', () => {
    expect(getActionEntityConfig('ecotrackShipments')).toMatchObject({
      entityType: 'ecotrackShipments',
      resource: 'ecotrack',
      reversible: false,
    });
  });

  it('records before/after snapshots around a mutation', async () => {
    const beforeRow = {
      id: 3,
      phoneNumber1: '0550',
      confirmed: 0,
      createdAt: new Date('2026-03-20T00:00:00.000Z'),
      updatedAt: new Date('2026-03-20T00:00:00.000Z'),
    };
    const afterRow = {
      ...beforeRow,
      confirmed: 2,
      updatedAt: new Date('2026-03-21T00:00:00.000Z'),
    };
    const selectMock = vi
      .fn()
      .mockReturnValueOnce(createSelectBuilder(beforeRow))
      .mockReturnValueOnce(createSelectBuilder(afterRow));
    const actionLogValues = vi.fn().mockResolvedValue(undefined);
    const tx = {
      select: selectMock,
      insert: vi.fn(() => ({ values: actionLogValues })),
    };
    const db = {
      transaction: vi.fn(async (callback: (innerTx: typeof tx) => Promise<unknown>) =>
        callback(tx),
      ),
    };

    await mutateEntityWithHistory(db as never, {
      entityType: 'orders',
      entityId: 3,
      operation: 'update',
      actor: { email: 'admin@example.com', name: 'Admin' },
      execute: vi.fn().mockResolvedValue(undefined),
    });

    expect(actionLogValues).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'orders',
        entityId: 3,
        operation: 'update',
        createdBy: 'admin@example.com',
        createdByName: 'Admin',
        isReversible: true,
        beforeState: expect.objectContaining({ confirmed: 0 }),
        afterState: expect.objectContaining({ confirmed: 2 }),
      }),
    );
  });

  it('records explicit non-reversible action logs', async () => {
    const actionLogValues = vi.fn().mockResolvedValue(undefined);
    const tx = {
      insert: vi.fn(() => ({ values: actionLogValues })),
    };

    await recordExplicitActionLog(tx as never, {
      entityType: 'ecotrackShipments',
      entityId: 11,
      operation: 'update',
      beforeState: { orderId: 11, trackingNumber: 'TRK-OLD' },
      afterState: { orderId: 11, trackingNumber: 'TRK-NEW' },
      actor: { name: 'ECOTRACK sync' },
    });

    expect(actionLogValues).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'ecotrackShipments',
        entityId: 11,
        resource: 'ecotrack',
        isReversible: false,
        createdByName: 'ECOTRACK sync',
      }),
    );
  });

  it('undoes and redoes an update action log', async () => {
    const historyEntry = {
      id: 7,
      resource: 'orders',
      entityType: 'orders',
      entityId: 11,
      entityLabel: '0550',
      operation: 'update',
      beforeState: {
        id: 11,
        phoneNumber1: '0550',
        confirmed: 0,
        createdAt: '2026-03-20T00:00:00.000Z',
        updatedAt: '2026-03-20T00:00:00.000Z',
      },
      afterState: {
        id: 11,
        phoneNumber1: '0550',
        confirmed: 2,
        createdAt: '2026-03-20T00:00:00.000Z',
        updatedAt: '2026-03-21T00:00:00.000Z',
      },
      createdBy: 'admin@example.com',
      createdByName: 'Admin',
      isReversible: true,
      isUndone: false,
      undoneAt: null,
      undoneBy: null,
      redoneAt: null,
      redoneBy: null,
      createdAt: new Date('2026-03-21T00:00:00.000Z'),
      updatedAt: new Date('2026-03-21T00:00:00.000Z'),
    };

    const entityUpdateSet = vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) }));
    const logUpdateSet = vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) }));
    const tx = {
      select: vi
        .fn()
        .mockReturnValueOnce(createActionLogSelectBuilder(historyEntry))
        .mockReturnValueOnce(
          createHistoryListSelectBuilder([
            { id: 6, isUndone: false },
            { id: 7, isUndone: false },
          ]),
        )
        .mockReturnValueOnce(createActionLogSelectBuilder({ ...historyEntry, isUndone: true }))
        .mockReturnValueOnce(
          createHistoryListSelectBuilder([
            { id: 6, isUndone: false },
            { id: 7, isUndone: true },
          ]),
        ),
      update: vi
        .fn()
        .mockReturnValueOnce({ set: entityUpdateSet })
        .mockReturnValueOnce({ set: logUpdateSet })
        .mockReturnValueOnce({ set: entityUpdateSet })
        .mockReturnValueOnce({ set: logUpdateSet }),
      insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue(undefined) })),
      delete: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
    };
    const db = {
      transaction: vi.fn(async (callback: (innerTx: typeof tx) => Promise<unknown>) =>
        callback(tx),
      ),
    };

    await applyHistoryAction(db as never, {
      actionLogId: 7,
      direction: 'undo',
      actor: { email: 'admin@example.com' },
    });

    expect(entityUpdateSet).toHaveBeenCalledWith(expect.objectContaining({ confirmed: 0 }));

    await applyHistoryAction(db as never, {
      actionLogId: 7,
      direction: 'redo',
      actor: { email: 'admin@example.com' },
    });

    expect(entityUpdateSet).toHaveBeenLastCalledWith(expect.objectContaining({ confirmed: 2 }));
  });

  it('ignores removed columns when replaying historical snapshots', async () => {
    const historyEntry = {
      id: 12,
      resource: 'products',
      entityType: 'products',
      entityId: 9,
      entityLabel: 'Widget',
      operation: 'update',
      beforeState: { id: 9, title: 'Widget', color: '#ffffff', inventoryQuantity: 2 },
      afterState: { id: 9, title: 'Widget', color: '#000000', inventoryQuantity: 4 },
      createdBy: 'admin@example.com',
      createdByName: 'Admin',
      isReversible: true,
      isUndone: false,
      undoneAt: null,
      undoneBy: null,
      redoneAt: null,
      redoneBy: null,
      createdAt: new Date('2026-03-21T00:00:00.000Z'),
      updatedAt: new Date('2026-03-21T00:00:00.000Z'),
    };

    const entityUpdateSet = vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) }));
    const logUpdateSet = vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) }));
    const tx = {
      select: vi
        .fn()
        .mockReturnValueOnce(createActionLogSelectBuilder(historyEntry))
        .mockReturnValueOnce(createHistoryListSelectBuilder([{ id: 12, isUndone: false }])),
      update: vi
        .fn()
        .mockReturnValueOnce({ set: entityUpdateSet })
        .mockReturnValueOnce({ set: logUpdateSet }),
      insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue(undefined) })),
      delete: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
    };
    const db = {
      transaction: vi.fn(async (callback: (innerTx: typeof tx) => Promise<unknown>) =>
        callback(tx),
      ),
    };

    await applyHistoryAction(db as never, {
      actionLogId: 12,
      direction: 'undo',
      actor: { email: 'admin@example.com' },
    });

    expect(entityUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        inventoryQuantity: 2,
        title: 'Widget',
      }),
    );
    expect(entityUpdateSet).not.toHaveBeenCalledWith(
      expect.objectContaining({
        color: expect.anything(),
      }),
    );
  });

  it('rejects undo for a stale action log when a newer applied entry exists', async () => {
    const historyEntry = {
      id: 7,
      resource: 'orders',
      entityType: 'orders',
      entityId: 11,
      entityLabel: '0550',
      operation: 'update',
      beforeState: { id: 11, confirmed: 0 },
      afterState: { id: 11, confirmed: 2 },
      createdBy: 'admin@example.com',
      createdByName: 'Admin',
      isReversible: true,
      isUndone: false,
      undoneAt: null,
      undoneBy: null,
      redoneAt: null,
      redoneBy: null,
      createdAt: new Date('2026-03-21T00:00:00.000Z'),
      updatedAt: new Date('2026-03-21T00:00:00.000Z'),
    };

    const tx = {
      select: vi
        .fn()
        .mockReturnValueOnce(createActionLogSelectBuilder(historyEntry))
        .mockReturnValueOnce(
          createHistoryListSelectBuilder([
            { id: 7, isUndone: false },
            { id: 8, isUndone: false },
          ]),
        ),
      update: vi.fn(),
      insert: vi.fn(),
      delete: vi.fn(),
    };
    const db = {
      transaction: vi.fn(async (callback: (innerTx: typeof tx) => Promise<unknown>) =>
        callback(tx),
      ),
    };

    await expect(
      applyHistoryAction(db as never, {
        actionLogId: 7,
        direction: 'undo',
      }),
    ).rejects.toThrow('Only the latest applied action can be undone');

    expect(tx.update).not.toHaveBeenCalled();
    expect(tx.delete).not.toHaveBeenCalled();
  });

  it('rejects redo for a stale action log when an older undone entry must be replayed first', async () => {
    const historyEntry = {
      id: 8,
      resource: 'orders',
      entityType: 'orders',
      entityId: 11,
      entityLabel: '0550',
      operation: 'update',
      beforeState: { id: 11, confirmed: 2 },
      afterState: { id: 11, confirmed: 3 },
      createdBy: 'admin@example.com',
      createdByName: 'Admin',
      isReversible: true,
      isUndone: true,
      undoneAt: new Date('2026-03-21T01:00:00.000Z'),
      undoneBy: 'admin@example.com',
      redoneAt: null,
      redoneBy: null,
      createdAt: new Date('2026-03-21T00:30:00.000Z'),
      updatedAt: new Date('2026-03-21T01:00:00.000Z'),
    };

    const tx = {
      select: vi
        .fn()
        .mockReturnValueOnce(createActionLogSelectBuilder(historyEntry))
        .mockReturnValueOnce(
          createHistoryListSelectBuilder([
            { id: 7, isUndone: true },
            { id: 8, isUndone: true },
          ]),
        ),
      update: vi.fn(),
      insert: vi.fn(),
      delete: vi.fn(),
    };
    const db = {
      transaction: vi.fn(async (callback: (innerTx: typeof tx) => Promise<unknown>) =>
        callback(tx),
      ),
    };

    await expect(
      applyHistoryAction(db as never, {
        actionLogId: 8,
        direction: 'redo',
      }),
    ).rejects.toThrow('Only the next undone action can be redone');

    expect(tx.update).not.toHaveBeenCalled();
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it('rejects undo for non-reversible action logs', async () => {
    const historyEntry = {
      id: 21,
      resource: 'ecotrack',
      entityType: 'ecotrackShipments',
      entityId: 11,
      entityLabel: 'TRK-123',
      operation: 'update',
      beforeState: { trackingNumber: 'TRK-123', currentStatus: 'created' },
      afterState: { trackingNumber: 'TRK-123', currentStatus: 'vers_hub' },
      createdBy: null,
      createdByName: 'ECOTRACK sync',
      isReversible: false,
      isUndone: false,
      undoneAt: null,
      undoneBy: null,
      redoneAt: null,
      redoneBy: null,
      createdAt: new Date('2026-03-21T00:00:00.000Z'),
      updatedAt: new Date('2026-03-21T00:00:00.000Z'),
    };

    const tx = {
      select: vi.fn().mockReturnValueOnce(createActionLogSelectBuilder(historyEntry)),
      update: vi.fn(),
      insert: vi.fn(),
      delete: vi.fn(),
    };
    const db = {
      transaction: vi.fn(async (callback: (innerTx: typeof tx) => Promise<unknown>) =>
        callback(tx),
      ),
    };

    await expect(
      applyHistoryAction(db as never, {
        actionLogId: 21,
        direction: 'undo',
      }),
    ).rejects.toThrow('This action cannot be undone.');
  });

  it('serializes action log entries for the API', () => {
    expect(
      toActionHistoryItem({
        id: 1,
        resource: 'products',
        entityType: 'products',
        entityId: 9,
        entityLabel: 'Widget',
        operation: 'create',
        beforeState: null,
        afterState: { id: 9 },
        createdBy: 'admin@example.com',
        createdByName: 'Admin',
        isReversible: true,
        isUndone: false,
        undoneAt: null,
        undoneBy: null,
        redoneAt: null,
        redoneBy: null,
        createdAt: new Date('2026-03-21T00:00:00.000Z'),
        updatedAt: new Date('2026-03-21T00:00:00.000Z'),
      } as never),
    ).toEqual(
      expect.objectContaining({
        id: 1,
        entityLabel: 'Widget',
        isReversible: true,
        changes: [],
        createdAt: '2026-03-21T00:00:00.000Z',
      }),
    );
  });

  it('extracts field-level changes for update entries', () => {
    expect(
      getActionHistoryChanges({
        operation: 'update',
        beforeState: {
          id: 9,
          inStock: false,
          price: '10.00',
          updatedAt: '2026-03-21T00:00:00.000Z',
        },
        afterState: {
          id: 9,
          inStock: true,
          price: '10.00',
          updatedAt: '2026-03-21T00:01:00.000Z',
        },
      } as never),
    ).toEqual([
      {
        field: 'In Stock',
        before: false,
        after: true,
      },
    ]);
  });
});
