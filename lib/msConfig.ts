/**
 * Microsoft Azure AD + SharePoint configuration.
 * Reduced least-privilege scopes (Mail.Send eliminated).
 */

const sharepointScope =
  (typeof process !== "undefined" && process.env?.EXPO_PUBLIC_SHAREPOINT_SCOPE) ||
  "Sites.ReadWrite.All"; // Supports "Sites.Selected" for least-privilege site-specific access

const baseScopes = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "User.Read",
  sharepointScope,
] as const;

export const MS_CONFIG = {
  ENABLED: true,

  TENANT_ID: "cee20abc-e97b-434e-a89b-e8c8ca3d3d75",
  CLIENT_ID: "96823f1a-bdb9-49c5-8461-d181438c74e3",

  SHAREPOINT_SITE_URL: "https://encalmit.sharepoint.com",
  LIST_NAME: "IT Asset Register",

  // Least privilege SharePoint scope: "Sites.Selected" or "Sites.ReadWrite.All"
  SHAREPOINT_SCOPE: sharepointScope,

  // Minimal scopes (Mail.Send completely removed)
  SCOPES: baseScopes,
  WEB_SCOPES: baseScopes,

  // Configured Enterprise IT Administrators (fallback if Entra ID App Roles not assigned)
  ADMIN_EMAILS: [
    "digital.intern@encalm.com",
    "admin@encalmhospitality.com",
    "it@encalmhospitality.com",
  ],
} as const;

export type MsConfig = typeof MS_CONFIG;

export function isMsConfigured(): boolean {
  return (
    MS_CONFIG.ENABLED &&
    MS_CONFIG.TENANT_ID.length > 0 &&
    MS_CONFIG.CLIENT_ID.length > 0 &&
    MS_CONFIG.SHAREPOINT_SITE_URL.length > 0
  );
}
