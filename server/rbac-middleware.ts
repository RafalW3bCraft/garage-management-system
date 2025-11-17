

import type { Role } from '@shared/schema';
import { hasPermission, isAdminOrStaff, isAdmin } from './permissions';

export function hasRole(userRole: string, allowedRoles: Role[]): boolean {
  return allowedRoles.includes(userRole as Role);
}

export { hasPermission, isAdminOrStaff, isAdmin };

