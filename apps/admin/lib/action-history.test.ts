import { describe, expect, it, vi } from 'vitest';

import {
  applyHistoryAction,
  getActionEntityConfig,
  getActionHistoryChanges,
  getActionHistoryPreview,
  mutateEntityWithHistory,
  recordExplicitActionLog,
  resolveActionHistoryRecovery,
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
        for: vi.fn(() => ({ limit: vi.fn().mockResolvedValue(row ? [row] : []) })),
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
      inHouseStatus: 0,
      createdAt: new Date('2026-03-20T00:00:00.000Z'),
      updatedAt: new Date('2026-03-20T00:00:00.000Z'),
    };
    const afterRow = {
      ...beforeRow,
      inHouseStatus: 2,
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
        beforeState: expect.objectContaining({ inHouseStatus: 0 }),
        afterState: expect.objectContaining({ inHouseStatus: 2 }),
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
        inHouseStatus: 0,
        createdAt: '2026-03-20T00:00:00.000Z',
        updatedAt: '2026-03-20T00:00:00.000Z',
      },
      afterState: {
        id: 11,
        phoneNumber1: '0550',
        inHouseStatus: 2,
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

    expect(entityUpdateSet).toHaveBeenCalledWith(expect.objectContaining({ inHouseStatus: 0 }));

    await applyHistoryAction(db as never, {
      actionLogId: 7,
      direction: 'redo',
      actor: { email: 'admin@example.com' },
    });

    expect(entityUpdateSet).toHaveBeenLastCalledWith(expect.objectContaining({ inHouseStatus: 2 }));
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
      afterState: { id: 9, title: 'Updated widget', color: '#000000', inventoryQuantity: 2 },
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
      execute: vi.fn().mockResolvedValue({ rows: [] }),
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
      beforeState: { id: 11, inHouseStatus: 0 },
      afterState: { id: 11, inHouseStatus: 2 },
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
      beforeState: { id: 11, inHouseStatus: 2 },
      afterState: { id: 11, inHouseStatus: 3 },
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
        key: 'inStock',
        field: 'In Stock',
        before: false,
        after: true,
      },
    ]);
  });

  it('extracts recorded fields for create and delete details', () => {
    expect(
      getActionHistoryChanges({
        operation: 'create',
        beforeState: null,
        afterState: { id: 9, title: 'Widget', active: true },
      } as never),
    ).toEqual([
      { key: 'title', field: 'Title', before: null, after: 'Widget' },
      { key: 'active', field: 'Active', before: null, after: true },
    ]);
    expect(
      getActionHistoryChanges({
        operation: 'delete',
        beforeState: { id: 9, title: 'Widget' },
        afterState: null,
      } as never),
    ).toEqual([{ key: 'title', field: 'Title', before: 'Widget', after: null }]);
  });

  it('collapses confirmation and shipment metadata into semantic preview groups', () => {
    expect(
      getActionHistoryPreview({
        operation: 'update',
        beforeState: { inHouseStatus: 0, confirmedBy: null, ecotrackStatus: null, note: null },
        afterState: {
          inHouseStatus: 2,
          confirmedBy: 'admin@example.com',
          ecotrackStatus: 'posted',
          note: 'Call first',
        },
      } as never),
    ).toEqual({
      items: [
        { key: 'confirmation', kind: 'group', field: 'Confirmation' },
        { key: 'shipment', kind: 'group', field: 'Shipment' },
      ],
      total: 3,
    });
  });

  it('resolves the exact next recovery action', () => {
    const applied = [
      { id: 1, isUndone: false },
      { id: 2, isUndone: false },
    ];
    expect(
      resolveActionHistoryRecovery({ id: 2, isReversible: true, isUndone: false }, applied),
    ).toEqual({ nextAction: 'undo', blockedReason: null });
    expect(
      resolveActionHistoryRecovery({ id: 1, isReversible: true, isUndone: false }, applied),
    ).toEqual({ nextAction: null, blockedReason: 'newer_action' });

    const undone = [
      { id: 1, isUndone: false },
      { id: 2, isUndone: true },
      { id: 3, isUndone: true },
    ];
    expect(
      resolveActionHistoryRecovery({ id: 2, isReversible: true, isUndone: true }, undone),
    ).toEqual({ nextAction: 'redo', blockedReason: null });
    expect(
      resolveActionHistoryRecovery({ id: 3, isReversible: true, isUndone: true }, undone),
    ).toEqual({ nextAction: null, blockedReason: 'redo_order' });
    expect(
      resolveActionHistoryRecovery({ id: 1, isReversible: false, isUndone: false }, [
        { id: 1, isUndone: false },
      ]),
    ).toEqual({ nextAction: null, blockedReason: 'non_reversible' });
    expect(
      resolveActionHistoryRecovery({ id: 2, isReversible: true, isUndone: true }, [
        { id: 1, isUndone: true },
        { id: 2, isUndone: false },
      ]),
    ).toEqual({ nextAction: null, blockedReason: 'history_out_of_sync' });
  });
});
