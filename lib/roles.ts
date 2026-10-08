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
  canRequestApproval: boolean;
  canManageSettings: boolean;
  canExportReports: boolean;
}

export const ROLE_PERMISSIONS: Record<UserRole, RolePermissions> = {
  admin: {
    canCreateAsset: true,
    canEditAsset: true,
    canDeleteAsset: true,
    canRequestApproval: true,
    canManageSettings: true,
    canExportReports: true,
  },
  technician: {
    canCreateAsset: true,
    canEditAsset: true,
    canDeleteAsset: false, // Technicians CANNOT delete assets
    canRequestApproval: true,
    canManageSettings: false,
    canExportReports: true,
  },
  viewer: {
    canCreateAsset: false, // Viewers CANNOT create assets
    canEditAsset: false,   // Viewers CANNOT edit assets
    canDeleteAsset: false, // Viewers CANNOT delete assets
    canRequestApproval: false,
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
 * Entra ID app role values (case-insensitive, exact match) → app role.
 * `Asset.*` is the recommended naming; the short names keep roles that
 * were already set up working. Keep in sync with server/serve-web.js.
 */
export const ROLE_CLAIMS: Record<string, UserRole> = {
  "asset.admin": "admin",
  admin: "admin",
  "asset.technician": "technician",
  technician: "technician",
  "asset.viewer": "viewer",
  viewer: "viewer",
};

const ROLE_RANK: Record<UserRole, number> = { viewer: 0, technician: 1, admin: 2 };

/** The highest app role in the token's `roles` claim, and which value granted it. */
export function roleFromClaims(tokenRoles: string[] = []): { role: UserRole; claim: string } | null {
  let best: { role: UserRole; claim: string } | null = null;
  for (const raw of tokenRoles) {
    const role = ROLE_CLAIMS[String(raw).trim().toLowerCase()];
    if (role && (!best || ROLE_RANK[role] > ROLE_RANK[best.role])) best = { role, claim: String(raw) };
  }
  return best;
}

function isAdminEmail(email: string): boolean {
  const normalizedEmail = (email || "").toLowerCase().trim();
  return (
    !!normalizedEmail &&
    MS_CONFIG.ADMIN_EMAILS.some((adminEmail) => adminEmail.toLowerCase() === normalizedEmail)
  );
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

  // 2. Azure AD App Roles from the signed id_token (highest wins)
  const fromClaims = roleFromClaims(tokenRoles);
  // 3. Emergency fallback: configured administrator emails
  if (isAdminEmail(email)) return "admin";
  if (fromClaims) return fromClaims.role;

  // 4. Default: read-only until granted an app role in Entra ID.
  return "viewer";
}

/** Human-readable reason for the user's role (shown in Settings). */
export function roleSource(email: string, tokenRoles: string[] = [], isDemo = false): string {
  if (isDemo) return "Demo role switcher";
  const fromClaims = roleFromClaims(tokenRoles);
  if (fromClaims && fromClaims.role === "admin") return `Entra app role ${fromClaims.claim}`;
  if (isAdminEmail(email)) return "Admin email list (emergency fallback)";
  if (fromClaims) return `Entra app role ${fromClaims.claim}`;
  return "Default — no app role assigned";
}

/**
 * Get permissions for a specific role.
 */
export function getPermissionsForRole(role: UserRole): RolePermissions {
  return ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.viewer;
}
