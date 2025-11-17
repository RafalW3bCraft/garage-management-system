

import type { Role } from '@shared/schema';

export interface ResourcePermissions {
  read: boolean;
  write: boolean;
  delete: boolean;
}

export interface RoleCapabilities {
  appointments: ResourcePermissions;
  services: ResourcePermissions;
  locations: ResourcePermissions;
  cars: ResourcePermissions;
  users: ResourcePermissions;
  bids: ResourcePermissions;
  contacts: ResourcePermissions;
  invoices: ResourcePermissions;
  analytics: ResourcePermissions;
  notifications: ResourcePermissions;
}

export const ROLE_PERMISSIONS: Record<Role, RoleCapabilities> = {
  admin: {
    appointments: { read: true, write: true, delete: true },
    services: { read: true, write: true, delete: true },
    locations: { read: true, write: true, delete: true },
    cars: { read: true, write: true, delete: true },
    users: { read: true, write: true, delete: true },
    bids: { read: true, write: true, delete: true },
    contacts: { read: true, write: true, delete: true },
    invoices: { read: true, write: true, delete: true },
    analytics: { read: true, write: true, delete: true },
    notifications: { read: true, write: true, delete: true },
  },
  staff: {
    appointments: { read: true, write: true, delete: false },
    services: { read: true, write: true, delete: false },
    locations: { read: true, write: true, delete: false },
    cars: { read: true, write: true, delete: false },
    users: { read: true, write: false, delete: false }, 
    bids: { read: true, write: true, delete: false },
    contacts: { read: true, write: true, delete: false },
    invoices: { read: true, write: true, delete: false },
    analytics: { read: true, write: false, delete: false }, 
    notifications: { read: true, write: true, delete: false },
  },
  customer: {
    appointments: { read: true, write: true, delete: false }, 
    services: { read: true, write: false, delete: false }, 
    locations: { read: true, write: false, delete: false }, 
    cars: { read: true, write: true, delete: false }, 
    users: { read: false, write: false, delete: false }, 
    bids: { read: true, write: true, delete: false }, 
    contacts: { read: false, write: true, delete: false }, 
    invoices: { read: true, write: false, delete: false }, 
    analytics: { read: false, write: false, delete: false },
    notifications: { read: true, write: false, delete: false }, 
  },
};

export function hasPermission(
  role: Role,
  resource: keyof RoleCapabilities,
  action: keyof ResourcePermissions
): boolean {
  const rolePerms = ROLE_PERMISSIONS[role];
  if (!rolePerms) return false;
  
  const resourcePerms = rolePerms[resource];
  if (!resourcePerms) return false;
  
  return resourcePerms[action];
}

export function isAdminOrStaff(role: Role): boolean {
  return role === 'admin' || role === 'staff';
}

export function isAdmin(role: Role): boolean {
  return role === 'admin';
}
