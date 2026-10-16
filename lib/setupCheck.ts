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
  /** "Fix automatically" (fixSharePointSetup) can repair this item. */
  fixable?: boolean;
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
async function listColumnDefs(token: string, siteId: string, listId: string): Promise<any[]> {
  const res = await fetch(`${GRAPH}/sites/${siteId}/lists/${listId}/columns?$select=name,displayName,text`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} reading the list's columns`);
  const data = await res.json();
  return data.value || [];
}

async function listColumns(token: string, siteId: string, listId: string): Promise<Set<string>> {
  return new Set((await listColumnDefs(token, siteId, listId)).map((c: any) => String(c.name)));
}

/**
 * Column type to create for each app field. Notes holds the custody history
 * and audit log, so it must be multi-line (a single-line column stops at 255
 * characters); price is a number and the dates are date-only.
 */
export function columnDefinition(name: string): Record<string, unknown> {
  if (name === "Notes") return { name, text: { allowMultipleLines: true, textType: "plain", linesForEditing: 6 } };
  if (name === "PurchasePrice") return { name, number: {} };
  if (name === "PurchaseDate" || name === "WarrantyExpiry") return { name, dateTime: { format: "dateOnly" } };
  return { name, text: {} };
}

/** True when the list's Notes column is explicitly single-line (255 chars). */
export function notesTooShort(columns: any[]): boolean {
  const notes = columns.find((c) => c?.name === "Notes");
  return !!notes?.text && notes.text.allowMultipleLines === false;
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
        const defs = await listColumnDefs(accessToken, siteId, listId);
        const have = new Set(defs.map((c: any) => String(c.name)));
        const missing = missingColumns(have, [...CORE_COLUMNS, ...OPTIONAL_COLUMNS]);
        if (notesTooShort(defs)) {
          items.push({
            label: "Notes column type",
            ok: false,
            detail:
              'Notes is "Single line of text" (255 characters) — it stores the custody history. Change it: List settings → Notes → "Multiple lines of text", Plain text.',
          });
        }
        items.push({
          label: "Asset register columns",
          ok: missing.length === 0,
          fixable: missing.length > 0,
          detail: missing.length
            ? `Missing: ${missing.join(", ")}. Use "Fix automatically", or add them as "Single line of text" columns (docs/DEPLOY.md).`
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
      items.push({ label: `List "${MS_CONFIG.CONFIRMATIONS_LIST_NAME}"`, ok, fixable: !ok, detail });
    } catch {
      items.push({
        label: `List "${MS_CONFIG.CONFIRMATIONS_LIST_NAME}"`,
        ok: false,
        fixable: true,
        detail: "Not found. Use \"Fix automatically\" to create it, then set its permissions (docs/DEPLOY.md).",
      });
    }
  }

  items.push(...scopeItems(accessToken));

  return { ok: items.every((i) => i.ok), items, latencyMs: Date.now() - start };
}

/** Graph permission needed only by "Fix automatically" (creating columns and lists). */
export const MANAGE_SCOPE = "Sites.Manage.All";

export interface FixResult {
  created: string[];
  failed: { name: string; error: string }[];
}

async function graphPost(token: string, url: string, body: unknown): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let message = "";
    try {
      message = JSON.parse(text)?.error?.message || "";
    } catch {}
    throw new Error(
      res.status === 403
        ? "Access denied: the signed-in admin must be a site owner and Sites.Manage.All must have admin consent."
        : `HTTP ${res.status}${message ? `: ${message}` : ""}`,
    );
  }
}

/**
 * One-click repair for the SharePoint side: adds the missing asset register
 * columns (as "Single line of text") and creates the Asset Confirmations list
 * with its columns. Only creates what is missing, so it is safe to run again.
 * Needs a token with Sites.Manage.All (see AuthContext.getTokenForScopes).
 */
export async function fixSharePointSetup(manageToken: string): Promise<FixResult> {
  const result: FixResult = { created: [], failed: [] };
  const siteId = await resolveSiteId(manageToken);

  const addColumns = async (listId: string, wanted: string[], label: string) => {
    const missing = missingColumns(await listColumns(manageToken, siteId, listId), wanted);
    for (const name of missing) {
      try {
        await graphPost(manageToken, `${GRAPH}/sites/${siteId}/lists/${listId}/columns`, {
          ...columnDefinition(name),
          displayName: name,
        });
        result.created.push(`${label}: column ${name}`);
      } catch (err: any) {
        result.failed.push({ name: `${label}: column ${name}`, error: err?.message || String(err) });
      }
    }
  };

  // Asset register (must already exist — it holds the data)
  const registerId = await resolveListIdByName(manageToken, siteId, MS_CONFIG.LIST_NAME);
  await addColumns(registerId, [...CORE_COLUMNS, ...OPTIONAL_COLUMNS], MS_CONFIG.LIST_NAME);

  // Asset Confirmations
  let confId: string | null = null;
  try {
    confId = await resolveListIdByName(manageToken, siteId, MS_CONFIG.CONFIRMATIONS_LIST_NAME);
  } catch {
    confId = null;
  }
  if (!confId) {
    try {
      await graphPost(manageToken, `${GRAPH}/sites/${siteId}/lists`, {
        displayName: MS_CONFIG.CONFIRMATIONS_LIST_NAME,
        columns: CONFIRMATION_COLUMNS.map((name) => ({ name, text: {} })),
        list: { template: "genericList" },
      });
      result.created.push(`List "${MS_CONFIG.CONFIRMATIONS_LIST_NAME}"`);
    } catch (err: any) {
      result.failed.push({ name: `List "${MS_CONFIG.CONFIRMATIONS_LIST_NAME}"`, error: err?.message || String(err) });
    }
  } else {
    await addColumns(confId, CONFIRMATION_COLUMNS, MS_CONFIG.CONFIRMATIONS_LIST_NAME);
  }
  return result;
}
