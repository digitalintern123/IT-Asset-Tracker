/**
 * Microsoft Azure AD + SharePoint configuration.
 */

export const MS_CONFIG = {
  ENABLED: true,

  TENANT_ID: "cee20abc-e97b-434e-a89b-e8c8ca3d3d75",
  CLIENT_ID: "96823f1a-bdb9-49c5-8461-d181438c74e3",

  SHAREPOINT_SITE_URL: "https://encalmit.sharepoint.com",
  LIST_NAME: "IT Asset Register",

  SCOPES: [
    "openid",
    "profile",
    "email",
    "offline_access",
    "Sites.ReadWrite.All",
    "User.Read",
    "Mail.Send",
  ],

  // Standard scopes used for OAuth 2.0 PKCE flow on both Web and Native
  WEB_SCOPES: [
    "openid",
    "profile",
    "email",
    "offline_access",
    "Sites.ReadWrite.All",
    "User.Read",
    "Mail.Send",
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
