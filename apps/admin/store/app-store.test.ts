import { beforeEach, describe, expect, it, vi } from 'vitest';

const storageKey = 'admin-store-v1';

describe('useAppStore', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });

  it('initializes with default role', async () => {
    const { useAppStore } = await import('./app-store');

    expect(useAppStore.getState().role).toBe('viewer');
    expect(useAppStore.getState().permissions).toEqual([]);
  });

  it('setAccess updates access data in state', async () => {
    const { useAppStore } = await import('./app-store');

    useAppStore.getState().setAccess({
      permissions: ['products_write'],
      role: 'campaign-manager',
      roleLabel: 'Campaign Manager',
    });

    expect(useAppStore.getState().role).toBe('campaign-manager');
    expect(useAppStore.getState().roleLabel).toBe('Campaign Manager');
    expect(useAppStore.getState().permissions).toEqual(['products_write']);
  });

  it('wires persist storage key and saves role changes', async () => {
    const { useAppStore } = await import('./app-store');

    expect(useAppStore.persist.getOptions().name).toBe(storageKey);

    useAppStore.getState().setAccess({
      permissions: ['products_write', 'assets_write'],
      role: 'employee',
    });

    const raw = localStorage.getItem(storageKey);
    expect(raw).toBeTruthy();
    expect(raw).toContain('"role":"employee"');
    expect(raw).toContain('"permissions":["products_write","assets_write"]');
  });
});
