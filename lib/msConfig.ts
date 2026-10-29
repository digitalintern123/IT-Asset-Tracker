/**
 * Microsoft Azure AD + SharePoint configuration.
 * Mail.Send is used to email maintenance notices and reassignment approvals
 * automatically; it needs admin consent in Azure (see docs/DEPLOY.md).
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
  "User.ReadBasic.All", // "Assigned to" people picker (names + emails from Azure AD)
  "Mail.Send",
  "Mail.Send.Shared", // send hand-over emails as corpit.helpdesk@encalm.com
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

  SCOPES: baseScopes,
  WEB_SCOPES: baseScopes,

  // Configured Enterprise IT Administrators (fallback if Entra ID App Roles not assigned)
  // Must stay in sync with the ADMIN_EMAILS environment variable on the server
  // (server/serve-web.js), which enforces the same list on /api/assets.
  ADMIN_EMAILS: ["encalmit@encalm.com"],

  // Hand-over confirmation emails are sent as this shared mailbox
  // (needs Mail.Send.Shared + Exchange "Send As" for IT staff).
  HELPDESK_MAILBOX: "corpit.helpdesk@encalm.com",
  // CC'd on every hand-over email. Add the IT team's addresses here.
  IT_CC_EMAILS: ["encalmit@encalm.com"],

  // Receives a copy when a user confirms receipt of an assigned device.
  CONFIRMATION_EMAIL: "encalmit@encalm.com",
  // SharePoint list where users record "I have received this device".
  CONFIRMATIONS_LIST_NAME: "Asset Confirmations",

  // Approval matrix: who receives "Approval required" emails for every
  // hand-over (assign / reassign / import) and technician edit request. They
  // approve by signing in, and must be members of the "IT-Asset Approver"
  // group (app role Asset.Approver) — anyone else is refused.
  // Put the Head of IT (and deputies) here.
  APPROVAL_EMAILS: ["prasenjit.baidya@encalm.com"],

  // Receive maintenance notices (with the device's user).
  IT_MANAGER_EMAILS: ["encalmit@encalm.com"],
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

/**
 * Origin of the Node backend (/api/...). On web it is the site itself. The
 * Android/iOS app has no page origin: it uses EXPO_PUBLIC_API_URL (e.g. the
 * Render URL) when set at build time, else "" — the /api call then fails and
 * the app talks to SharePoint (Microsoft Graph) directly.
 */
export function backendOrigin(): string {
  if (typeof window !== "undefined" && window.location?.origin) return window.location.origin;
  const configured = typeof process !== "undefined" ? process.env?.EXPO_PUBLIC_API_URL : undefined;
  return (configured || "").replace(/\/+$/, "");
}
