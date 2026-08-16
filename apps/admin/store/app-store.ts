'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { PermissionKey, Role } from '../lib/permissions';

type AppState = {
  permissions: PermissionKey[];
  role: Role;
  roleLabel: string | null;
  setAccess: (access: {
    permissions: PermissionKey[];
    role: Role;
    roleLabel?: string | null;
  }) => void;
};

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      permissions: [],
      role: 'viewer',
      roleLabel: null,
      setAccess: ({ permissions, role, roleLabel = null }) => set({ permissions, role, roleLabel }),
    }),
    { name: 'adminstration-store-v1' },
  ),
);
