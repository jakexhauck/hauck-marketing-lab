import type { Role } from "../types";

export const RolePermissions = {
  owner: { seeRevenue: true, assignedOnly: false },
  manager: { seeRevenue: false, assignedOnly: false },
  rep: { seeRevenue: false, assignedOnly: true },
} as const;

export type RolePermission = typeof RolePermissions[keyof typeof RolePermissions];

export function permissionsFor(role: Role): RolePermission {
  return RolePermissions[role];
}

export function roleLabel(role: Role): string {
  switch (role) {
    case "owner":
      return "Owner";
    case "manager":
      return "Manager";
    case "rep":
      return "Rep";
  }
}
