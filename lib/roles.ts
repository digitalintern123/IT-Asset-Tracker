/**
 * Role-Based Access Control (RBAC) System for ENCALM Asset Tracker.
 * Manages user roles, permission matrices, and token claim resolution.
 */

import { MS_CONFIG } from "./msConfig";

export type UserRole = "admin" | "technician" | "viewer";

export interface RolePermissions {
  canCreateAsset: boolean;
  canEditAsset: boolean;
  canDeleteAsset: boolean;
  canManageSettings: boolean;
  canExportReports: boolean;
}

export const ROLE_PERMISSIONS: Record<UserRole, RolePermissions> = {
  admin: {
    canCreateAsset: true,
    canEditAsset: true,
    canDeleteAsset: true,
    canManageSettings: true,
    canExportReports: true,
  },
  technician: {
    canCreateAsset: true,
    canEditAsset: true,
    canDeleteAsset: false, // Technicians CANNOT delete assets
    canManageSettings: false,
    canExportReports: true,
  },
  viewer: {
    canCreateAsset: false, // Viewers CANNOT create assets
    canEditAsset: false,   // Viewers CANNOT edit assets
    canDeleteAsset: false, // Viewers CANNOT delete assets
    canManageSettings: false,
    canExportReports: true,
  },
};

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "IT Administrator",
  technician: "IT Technician",
  viewer: "Auditor / Viewer",
};

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  admin: "Full administrative access: create, edit, delete assets & manage system.",
  technician: "Operational staff: register assets, edit assignments & scan QR codes.",
  viewer: "Read-only access: browse inventory, search specs & scan to inspect.",
};

/**
 * Extract roles claim from a JWT (id_token or access_token).
 */
export function parseJwtRoles(token?: string): string[] {
  if (!token) return [];
  try {
    const parts = token.split(".");
    if (parts.length < 2) return [];

    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    const decoded = JSON.parse(jsonPayload);

    if (Array.isArray(decoded.roles)) {
      return decoded.roles;
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * Determine a user's role from token claims, admin emails list, or demo settings.
 */
export function resolveUserRole(
  email: string,
  tokenRoles: string[] = [],
  isDemo = false,
  demoRole?: UserRole
): UserRole {
  // 1. Demo Mode role selection
  if (isDemo) {
    return demoRole || "admin";
  }

  const normalizedEmail = (email || "").toLowerCase().trim();

  // 2. Azure AD App Roles from token
  const lowerRoles = tokenRoles.map((r) => r.toLowerCase());
  if (lowerRoles.some((r) => r.includes("admin"))) {
    return "admin";
  }
  if (lowerRoles.some((r) => r.includes("technician") || r.includes("staff"))) {
    return "technician";
  }
  if (lowerRoles.some((r) => r.includes("viewer") || r.includes("reader") || r.includes("auditor"))) {
    return "viewer";
  }

  // 3. Fallback: Configured administrator emails
  const isAdminEmail = MS_CONFIG.ADMIN_EMAILS.some(
    (adminEmail) => adminEmail.toLowerCase() === normalizedEmail
  );
  if (isAdminEmail) {
    return "admin";
  }

  // 4. Default corporate user role: read-only until explicitly granted
  //    an Azure AD app role (Technician / Admin) or listed in ADMIN_EMAILS.
  return "viewer";
}

/**
 * Get permissions for a specific role.
 */
export function getPermissionsForRole(role: UserRole): RolePermissions {
  return ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.viewer;
}
