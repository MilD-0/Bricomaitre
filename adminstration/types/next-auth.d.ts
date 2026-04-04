import type { DefaultSession } from 'next-auth';

import type { PermissionKey, Role } from '../lib/permissions';

declare module 'next-auth' {
  interface Session {
    user: DefaultSession['user'] & {
      isAllowed: boolean;
      permissions: PermissionKey[];
      role: Role;
      roleDefinitionId?: number;
      roleLabel?: string;
    };
  }

  interface User {
    isAllowed?: boolean;
    permissions?: PermissionKey[];
    role?: Role;
    roleDefinitionId?: number;
    roleLabel?: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    isAllowed?: boolean;
    permissions?: PermissionKey[];
    role?: Role;
    roleDefinitionId?: number;
    roleLabel?: string;
  }
}
