/**
 * "Test SharePoint Connection" in Settings: checks everything the app needs
 * from SharePoint, Graph and Entra ID, and says how to fix what's missing.
 */

import { MS_CONFIG } from "@/lib/msConfig";
import {
  OPTIONAL_COLUMNS,
  resolveListIdByName,
  resolveSiteId,
} from "@/lib/sharepoint";

const GRAPH = "https://graph.microsoft.com/v1.0";

/** Columns written on every save (Title is built in). */
export const CORE_COLUMNS = [
  "AssetId",
  "Category",
  "SerialNumber",
  "Status",
  "Assignee",
  "Location",
  "PurchaseDate",
  "PurchasePrice",
  "WarrantyExpiry",
  "Notes",
];

export const CONFIRMATION_COLUMNS = ["CustodyId", "AssetName", "ConfirmedAt"];

/** Delegated Graph permissions the app uses, and what breaks without each. */
export const REQUIRED_SCOPES: { scope: string; why: string }[] = [
  { scope: "Sites.ReadWrite.All", why: "read and save assets" },
  { scope: "User.ReadBasic.All", why: "the Assigned-to people picker" },
  { scope: "Mail.Send", why: "maintenance and approval emails" },
  { scope: "Mail.Send.Shared", why: "confirmation emails from the helpdesk mailbox" },
];

export interface SetupItem {
  label: string;
  ok: boolean;
  /** Unknown = could not be checked (e.g. an earlier step failed). */
  unknown?: boolean;
  detail?: string;
}

export interface SetupReport {
  ok: boolean;
  items: SetupItem[];
  latencyMs: number;
}

/** Delegated scopes (`scp`) in an access token; null if it can't be read. */
export function tokenScopes(accessToken?: string): string[] | null {
  try {
    const part = (accessToken || "").split(".")[1];
    if (!part) return null;
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    const scp = JSON.parse(json).scp;
    return typeof scp === "string" ? scp.split(" ").filter(Boolean) : null;
  } catch {
    return null;
  }
}

export function scopeItems(accessToken?: string): SetupItem[] {
  const scopes = tokenScopes(accessToken);
  if (!scopes) {
    return [{ label: "Microsoft Graph permissions", ok: true, unknown: true, detail: "Couldn't read the token's permissions." }];
  }
  const have = new Set(scopes.map((s) => s.toLowerCase()));
  return REQUIRED_SCOPES.map(({ scope, why }) => {
    // Sites.Selected also covers SharePoint access.
    const ok = have.has(scope.toLowerCase()) || (scope === "Sites.ReadWrite.All" && have.has("sites.selected"));
    return {
      label: `Permission ${scope}`,
      ok,
      detail: ok ? undefined : `Needed for ${why}. Add it in Entra ID → App registrations → API permissions, grant admin consent, then sign in again.`,
    };
  });
}

/** Internal names of the list's columns. */
async function listColumns(token: string, siteId: string, listId: string): Promise<Set<string>> {
  const res = await fetch(`${GRAPH}/sites/${siteId}/lists/${listId}/columns?$select=name,displayName`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} reading the list's columns`);
  const data = await res.json();
  return new Set((data.value || []).map((c: any) => String(c.name)));
}

export function missingColumns(have: Set<string>, wanted: string[]): string[] {
  return wanted.filter((c) => !have.has(c));
}

export async function checkSetup(accessToken: string): Promise<SetupReport> {
  const start = Date.now();
  const items: SetupItem[] = [];
  let siteId = "";

  try {
    siteId = await resolveSiteId(accessToken);
    items.push({ label: `SharePoint site ${MS_CONFIG.SHAREPOINT_SITE_URL}`, ok: true });
  } catch (err: any) {
    items.push({ label: `SharePoint site ${MS_CONFIG.SHAREPOINT_SITE_URL}`, ok: false, detail: err?.message });
  }

  // Asset register: readable + columns
  if (siteId) {
    try {
      const listId = await resolveListIdByName(accessToken, siteId, MS_CONFIG.LIST_NAME);
      const read = await fetch(`${GRAPH}/sites/${siteId}/lists/${listId}/items?$top=1`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      items.push({
        label: `List "${MS_CONFIG.LIST_NAME}"`,
        ok: read.ok,
        detail: read.ok ? undefined : `HTTP ${read.status} reading items — check the account's access to this list.`,
      });
      try {
        const have = await listColumns(accessToken, siteId, listId);
        const missing = missingColumns(have, [...CORE_COLUMNS, ...OPTIONAL_COLUMNS]);
        items.push({
          label: "Asset register columns",
          ok: missing.length === 0,
          detail: missing.length
            ? `Missing: ${missing.join(", ")}. Add them as "Single line of text" columns (see docs/DEPLOY.md).`
            : undefined,
        });
      } catch (err: any) {
        items.push({ label: "Asset register columns", ok: true, unknown: true, detail: err?.message });
      }
    } catch (err: any) {
      items.push({ label: `List "${MS_CONFIG.LIST_NAME}"`, ok: false, detail: err?.message });
    }

    // Confirmations list
    try {
      const confId = await resolveListIdByName(accessToken, siteId, MS_CONFIG.CONFIRMATIONS_LIST_NAME);
      let detail: string | undefined;
      let ok = true;
      try {
        const missing = missingColumns(await listColumns(accessToken, siteId, confId), CONFIRMATION_COLUMNS);
        if (missing.length) {
          ok = false;
          detail = `Missing: ${missing.join(", ")}.`;
        }
      } catch {
        /* list exists; columns unreadable — don't fail on it */
      }
      items.push({ label: `List "${MS_CONFIG.CONFIRMATIONS_LIST_NAME}"`, ok, detail });
    } catch {
      items.push({
        label: `List "${MS_CONFIG.CONFIRMATIONS_LIST_NAME}"`,
        ok: false,
        detail: "Not found. Create it so users can confirm receipt (see docs/DEPLOY.md).",
      });
    }
  }

  items.push(...scopeItems(accessToken));

  return { ok: items.every((i) => i.ok), items, latencyMs: Date.now() - start };
}
