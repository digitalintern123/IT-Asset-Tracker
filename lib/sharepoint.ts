/**
 * SharePoint Online Database Service via Microsoft Graph API.
 * Authoritative cloud database for all assets.
 */

import { MS_CONFIG, isMsConfigured } from "./msConfig";
import { getCategoryCode } from "@/lib/assetId";
import type { Asset, AssetCategory, AssetInput, AssetStatus } from "@/types/asset";

const GRAPH = "https://graph.microsoft.com/v1.0";

// Memory cache for SharePoint site and list IDs
let cachedSiteId: string | null = null;
const cachedListIds = new Map<string, string>();

function mapCategory(raw: string): AssetCategory {
  const c = (raw || "").trim().toLowerCase();
  // Match on word boundaries so short keywords ("pc", "desk") do not capture
  // unrelated custom categories such as "Epcot Kiosk" or "Desk Lamp".
  if (/\b(laptop|macbook|thinkpad)/.test(c)) return "Laptop";
  if (/\b(desktop|imac)|\bpc\b/.test(c)) return "Desktop";
  if (/\b(monitor|screen|display)/.test(c)) return "Monitor";
  if (/\b(phone|iphone|mobile|smartphone)/.test(c)) return "Phone";
  if (/\b(tablet|ipad)/.test(c)) return "Tablet";
  if (/\b(furniture|chair)|\bdesks?$/.test(c)) return "Furniture";
  if (/\b(equip|network|server|printer)/.test(c)) return "Equipment";
  // Preserve a custom category the user typed rather than flattening it to "Other".
  const original = (raw || "").trim();
  return original || "Other";
}

function mapStatus(raw: string): AssetStatus {
  const s = (raw || "").trim().toLowerCase();

  if (s === "new" || s === "new device" || s === "new_device") return "new";
  if (s.includes("out of order")) return "retired";

  // Check negations and terminal states before the substring matches below,
  // otherwise "Not in Use" / "Unused" fall into the "use" branch.
  if (/\b(not|un|never)\b/.test(s) || s.startsWith("un")) {
    if (s.includes("use") || s.includes("issue") || s.includes("assign")) return "available";
  }
  if (s.includes("retir") || s.includes("dispos") || s.includes("written off") ||
      s.includes("lost") || s.includes("stolen") || s.includes("scrap")) return "retired";
  if (s.includes("maint") || s.includes("repair") || s.includes("service")) return "maintenance";
  if (s.includes("use") || s.includes("issue") || s.includes("assigned")) return "in_use";
  if (s.includes("avail") || s.includes("spare") || s.includes("stock") || s.includes("store")) return "available";
  return "available";
}

export function fromSpItem(item: any): Asset {
  const f = item.fields || item;
  const spId = String(item.id || f.id || f.ID || "");
  const assetId = String(f.AssetId || f.AssetID || spId || Date.now().toString(36));

  // Extract Assignment History (Notes first; a legacy AssignmentHistory
  // column only if Notes has none)
  let assignmentHistory: any[] = [];
  if (f.Notes && typeof f.Notes === "string" && f.Notes.includes("<!-- HISTORY:")) {
    try {
      const match = f.Notes.match(/<!-- HISTORY:([\s\S]*?) -->/);
      if (match && match[1]) {
        assignmentHistory = JSON.parse(match[1]);
      }
    } catch {}
  } else if (Array.isArray(f.AssignmentHistory)) {
    assignmentHistory = f.AssignmentHistory;
  } else if (typeof f.AssignmentHistory === "string" && f.AssignmentHistory.trim()) {
    try {
      assignmentHistory = JSON.parse(f.AssignmentHistory);
    } catch {}
  }
  // A receipt confirmation only counts when it comes from the Asset
  // Confirmations list (applyConfirmations); never trust one stored in Notes.
  assignmentHistory = Array.isArray(assignmentHistory)
    ? assignmentHistory.map((r: any) => {
        const { confirmedAt: _c, confirmedBy: _b, ...rest } = r || {};
        return rest;
      })
    : [];

  // Extract Approval Request if pending or recorded
  let approvalRequest = undefined;
  if (f.Notes && typeof f.Notes === "string" && f.Notes.includes("<!-- APPROVAL:")) {
    try {
      const match = f.Notes.match(/<!-- APPROVAL:([\s\S]*?) -->/);
      if (match && match[1]) {
        approvalRequest = JSON.parse(match[1]);
      }
    } catch {}
  }

  // Extract the audit trail (report logs)
  let events = [];
  if (f.Notes && typeof f.Notes === "string" && f.Notes.includes("<!-- EVENTS:")) {
    try {
      const match = f.Notes.match(/<!-- EVENTS:([\s\S]*?) -->/);
      if (match && match[1]) {
        events = JSON.parse(match[1]);
      }
    } catch {}
  }

  const cleanNotes = (f.Notes || f.Description || "")
    .replace(/<!-- HISTORY:[\s\S]*? -->/g, "")
    .replace(/<!-- APPROVAL:[\s\S]*? -->/g, "")
    .replace(/<!-- EVENTS:[\s\S]*? -->/g, "")
    .trim();

  return {
    id: assetId,
    spItemId: spId,
    name: String(f.Title || f.ComputerName || f.AssetID || f.name || "Unknown"),
    category: mapCategory(f.Category || f.AssetType || "Other"),
    serialNumber: String(f.SerialNumber || f.Serial_x0020_Number || ""),
    status: mapStatus(f.Status || f.AssetStatus || "available"),
    assignee: String(
      f.AssignedTo?.Title ||
      f.Assignee ||
      f.Assign ||
      (typeof f.AssignedTo === "string" ? f.AssignedTo : "") ||
      ""
    ),
    location: String(f.Location || ""),
    vertical: String(f.Vertical || ""),
    make: String(f.Make || ""),
    model: String(f.Model || ""),
    department: String(f.Department || ""),
    custodianship: String(f.Custodianship || ""),
    criticality: String(f.Criticality || ""),
    operationalStatus: String(f.OperationalStatus || ""),
    assetClass: String(f.AssetClass || ""),
    accessories: String(f.Accessories || ""),
    purchaseDate: toDateOnly(f.PurchaseDate),
    purchasePrice: Number(f.PurchasePrice) || 0,
    warrantyExpiry: toDateOnly(f.WarrantyExpiry) || null,
    notes: cleanNotes,
    assignmentHistory,
    events,
    approvalRequest,
    etag: item["@odata.etag"] || item.eTag || null,
    version: Number(item.version || f._UIVersionString || 1),
    createdAt: String(f.Created || item.createdDateTime || new Date().toISOString()),
    updatedAt: String(f.Modified || item.lastModifiedDateTime || new Date().toISOString()),
    _syncStatus: "synced",
  };
}

const MAX_STORED_EVENTS = 200;

export const OPTIONAL_COLUMNS = [
  "Vertical",
  "Make",
  "Model",
  "Department",
  "Custodianship",
  "Criticality",
  "OperationalStatus",
  "AssetClass",
  "Accessories",
];

/** Graph rejects writes to a column the list doesn't have; say which one. */
function missingColumnError(status: number, body: string): Error | null {
  if (status !== 400) return null;
  const column = OPTIONAL_COLUMNS.find((c) => new RegExp(`\\b${c}\\b`).test(body || ""));
  if (!column) return null;
  const err: any = new Error(
    `SharePoint list is missing the '${column}' column. Add it to the IT Asset Register list (see docs/DEPLOY.md), then try again.`
  );
  err.statusCode = 400;
  return err;
}

/** ENC-LAP-2026-0007 → ENC-LAP-2026-0008 (keeps the zero padding). */
export function nextAssetId(id: string): string {
  const m = id.match(/^(.*?)(\d+)$/);
  if (!m) return `${id}-2`;
  const n = String(Number(m[2]) + 1).padStart(m[2].length, "0");
  return m[1] + n;
}

/** App field → optional SharePoint column. */
const OPTIONAL_FIELDS: [string, string][] = [
  ["vertical", "Vertical"],
  ["make", "Make"],
  ["model", "Model"],
  ["department", "Department"],
  ["custodianship", "Custodianship"],
  ["criticality", "Criticality"],
  ["operationalStatus", "OperationalStatus"],
  ["assetClass", "AssetClass"],
  ["accessories", "Accessories"],
];

/**
 * SharePoint Date columns come back from Graph as UTC date-times
 * (e.g. local midnight in IST is "2024-03-14T18:30:00Z"). Shifting by 12h
 * before taking the date gives the calendar date for any UTC-12..+12 site.
 */
function toDateOnly(value: unknown): string {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const d = new Date(text);
  if (isNaN(d.getTime())) return text;
  return new Date(d.getTime() + 12 * 3600 * 1000).toISOString().slice(0, 10);
}

/**
 * JSON for a <!-- KEY:... --> block in Notes. "-->" inside user text would end
 * the comment early, so ">" is escaped (JSON.parse restores it).
 */
function toNotesJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/>/g, "\\u003e")
    // Line/paragraph separators are valid in JSON strings but break the
    // single-block match on read; escape them too.
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export function toSpFields(input: AssetInput, assetId?: string): Record<string, unknown> {
  // Comment markers typed into Notes would be read back as (forged)
  // history/approval/event blocks, so they are removed from user text.
  let notesWithHistory = String(input.notes || "").replace(/<!--|-->/g, "");
  if (Array.isArray(input.assignmentHistory) && input.assignmentHistory.length > 0) {
    notesWithHistory = `${notesWithHistory}\n<!-- HISTORY:${toNotesJson(input.assignmentHistory)} -->`.trim();
  }
  if (input.approvalRequest) {
    notesWithHistory = `${notesWithHistory}\n<!-- APPROVAL:${toNotesJson(input.approvalRequest)} -->`.trim();
  }
  if (Array.isArray(input.events) && input.events.length > 0) {
    // Keep the newest events so the Notes field stays within SharePoint's limit.
    const recent = input.events.slice(-MAX_STORED_EVENTS);
    notesWithHistory = `${notesWithHistory}\n<!-- EVENTS:${toNotesJson(recent)} -->`.trim();
  }

  const fields: Record<string, unknown> = {
    Title: input.name,
    Category: input.category,
    SerialNumber: input.serialNumber || "",
    Status: input.status,
    Assignee: input.assignee || "",
    Location: input.location || "",
    // Date columns reject "" — send null so a cleared date clears in SharePoint.
    PurchaseDate: input.purchaseDate || null,
    PurchasePrice: Number(input.purchasePrice) || 0,
    WarrantyExpiry: input.warrantyExpiry || null,
    Notes: notesWithHistory,
  };

  // On create, only set columns are sent, so a list that lacks an optional
  // column still accepts items that don't use it. On update, a field present
  // in the input is always sent ("" clears it in SharePoint).
  for (const [key, column] of OPTIONAL_FIELDS) {
    const value = (input as any)[key];
    if (value) fields[column] = value;
    else if (!assetId && value !== undefined && value !== null) fields[column] = "";
  }

  if (assetId) {
    fields.AssetId = assetId;
  }

  return fields;
}

export async function resolveSiteId(token: string): Promise<string> {
  if (cachedSiteId) return cachedSiteId;

  const url = new URL(MS_CONFIG.SHAREPOINT_SITE_URL);
  const hostname = url.hostname;
  const sitePath = url.pathname.replace(/^\/|\/$/g, "");
  const endpoint = sitePath
    ? `${GRAPH}/sites/${hostname}:/${sitePath}`
    : `${GRAPH}/sites/${hostname}`;

  const res = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 403 || res.status === 401) {
    const err: any = new Error(
      `Access denied reading SharePoint site (HTTP ${res.status}). The signed-in ` +
      `account is missing Sites.ReadWrite.All or Sites.Selected on ` +
      `${MS_CONFIG.SHAREPOINT_SITE_URL}.`
    );
    err.statusCode = res.status;
    throw err;
  }

  if (!res.ok) {
    throw new Error(`Failed to resolve SharePoint site: HTTP ${res.status}`);
  }

  const data = await res.json();
  cachedSiteId = data.id;
  return data.id;
}

async function resolveListId(token: string, siteId: string): Promise<string> {
  return resolveListIdByName(token, siteId, MS_CONFIG.LIST_NAME);
}

/** Resolve (and cache) a SharePoint list id by its display name. */
export async function resolveListIdByName(
  token: string,
  siteId: string,
  listName: string
): Promise<string> {
  const cached = cachedListIds.get(listName);
  if (cached) return cached;

  const filterUrl = `${GRAPH}/sites/${siteId}/lists?$filter=displayName eq '${encodeURIComponent(listName.replace(/'/g, "''"))}'`;
  const res = await fetch(filterUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 403 || res.status === 401) {
    const err: any = new Error(
      `Access denied reading SharePoint lists (HTTP ${res.status}). The signed-in ` +
      `account is missing Sites.ReadWrite.All or Sites.Selected on ` +
      `${MS_CONFIG.SHAREPOINT_SITE_URL}.`
    );
    err.statusCode = res.status;
    throw err;
  }

  if (res.ok) {
    const data = await res.json();
    if (data.value && data.value.length > 0) {
      cachedListIds.set(listName, data.value[0].id);
      return data.value[0].id;
    }
  }

  // Fallback: list all lists in case filter has casing difference
  const allRes = await fetch(`${GRAPH}/sites/${siteId}/lists`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (allRes.ok) {
    const data = await allRes.json();
    const target = listName.trim().toLowerCase();
    const match = (data.value || []).find(
      (l: any) =>
        (l.displayName && l.displayName.trim().toLowerCase() === target) ||
        (l.name && l.name.trim().toLowerCase() === target)
    );
    if (match) {
      cachedListIds.set(listName, match.id);
      return match.id;
    }
  }

  const notFound: any = new Error(`SharePoint list "${listName}" not found`);
  notFound.statusCode = 404;
  throw notFound;
}

export interface SharePointService {
  fetchAll: () => Promise<Asset[]>;
  create: (input: AssetInput & { id?: string }) => Promise<Asset>;
  update: (spItemId: string, input: AssetInput, ifMatchEtag?: string) => Promise<Asset>;
  remove: (spItemId: string) => Promise<void>;
  findItemIdByAssetId: (assetId: string) => Promise<string | null>;
}

export async function createSharePointService(
  accessToken: string
): Promise<SharePointService> {
  if (!isMsConfigured()) {
    throw new Error("Microsoft SharePoint integration is not configured");
  }

  const siteId = await resolveSiteId(accessToken);
  const listId = await resolveListId(accessToken, siteId);
  const base = `${GRAPH}/sites/${siteId}/lists/${listId}/items`;
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  async function fetchAll(): Promise<Asset[]> {
    let nextUrl: string | null = `${base}?expand=fields&$top=200`;
    let allAssets: Asset[] = [];
    let pageCount = 0;

    while (nextUrl && pageCount < 50) {
      pageCount++;
      const res: Response = await fetch(nextUrl, { headers });
      if (!res.ok) {
        throw new Error(`Failed to load assets from SharePoint: HTTP ${res.status}`);
      }
      const data: any = await res.json();
      const items = (data.value || []).map(fromSpItem);
      allAssets = allAssets.concat(items);
      nextUrl = data["@odata.nextLink"] || null;
    }

    return allAssets;
  }

  async function create(input: AssetInput & { id?: string }): Promise<Asset> {
    const year = new Date().getFullYear();
    const rand = Math.floor(1000 + Math.random() * 9000);
    const assetId = input.id && input.id.startsWith("ENC-")
      ? input.id
      : `ENC-${getCategoryCode(input.category)}-${year}-${rand}`;
    // Each client numbers IDs from its own copy of the list, so two people
    // (or an offline create) can pick the same one; take the next free one.
    let uniqueId = assetId;
    for (let i = 0; i < 50 && (await findItemIdByAssetId(uniqueId)); i++) {
      uniqueId = nextAssetId(uniqueId);
    }
    const fields = toSpFields(input, uniqueId);

    const res = await fetch(base, {
      method: "POST",
      headers,
      body: JSON.stringify({ fields }),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      throw (
        missingColumnError(res.status, errBody) ||
        new Error(
          `Failed to create asset in SharePoint (HTTP ${res.status}): ${errBody || res.statusText}`
        )
      );
    }

    const createdItem = await res.json();
    return fromSpItem(createdItem);
  }

  async function update(
    spItemId: string,
    input: AssetInput,
    ifMatchEtag?: string
  ): Promise<Asset> {
    const fields = toSpFields(input);
    const patchHeaders: Record<string, string> = { ...headers };
    if (ifMatchEtag) patchHeaders["If-Match"] = ifMatchEtag;

    const res = await fetch(`${base}/${spItemId}/fields`, {
      method: "PATCH",
      headers: patchHeaders,
      body: JSON.stringify(fields),
    });

    if (res.status === 412 || res.status === 409) {
      const conflictErr: any = new Error(
        "Conflict: Asset was modified by another user (ETag mismatch)."
      );
      conflictErr.statusCode = 412;
      // Attach the current SharePoint record so the caller can merge the
      // other user's changes with this edit instead of guessing.
      try {
        const currentRes = await fetch(`${base}/${spItemId}?expand=fields`, { headers });
        if (currentRes.ok) {
          conflictErr.serverAsset = fromSpItem(await currentRes.json());
        }
      } catch {}
      throw conflictErr;
    }

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      throw (
        missingColumnError(res.status, errBody) ||
        new Error(
          `Failed to update asset in SharePoint (HTTP ${res.status}): ${errBody || res.statusText}`
        )
      );
    }

    // Fetch the updated item with its fields
    const itemRes = await fetch(`${base}/${spItemId}?expand=fields`, { headers });
    if (itemRes.ok) {
      const updatedItem = await itemRes.json();
      return fromSpItem(updatedItem);
    }

    // Fallback if read-after-write fails
    return {
      id: spItemId,
      spItemId,
      ...input,
      // Carry the caller's etag forward so the next update still sends If-Match.
      etag: ifMatchEtag ?? undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      _syncStatus: "synced",
    };
  }

  async function remove(spItemId: string): Promise<void> {
    const res = await fetch(`${base}/${spItemId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok && res.status !== 404) {
      const errBody = await res.text().catch(() => "");
      throw new Error(
        `Failed to delete asset from SharePoint (HTTP ${res.status}): ${errBody || res.statusText}`
      );
    }
  }

  async function findItemIdByAssetId(assetId: string): Promise<string | null> {
    const res = await fetch(
      `${base}?expand=fields&$filter=fields/AssetId eq '${encodeURIComponent(assetId.replace(/'/g, "''"))}'`,
      // AssetId isn't indexed by default; without this Graph rejects the filter.
      { headers: { ...headers, Prefer: "HonorNonIndexedQueriesWarningMayFailRandomly" } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.value?.[0]?.id ? String(data.value[0].id) : null;
  }

  return {
    fetchAll,
    create,
    update,
    remove,
    findItemIdByAssetId,
  };
}

export interface SharePointTestResult {
  ok: boolean;
  message: string;
  latencyMs: number;
  siteId?: string;
  listId?: string;
}

export async function testSharePointConnection(
  accessToken: string
): Promise<SharePointTestResult> {
  const start = Date.now();
  try {
    if (!isMsConfigured()) {
      return {
        ok: false,
        message: "SharePoint integration is not configured in MS_CONFIG",
        latencyMs: 0,
      };
    }

    const siteId = await resolveSiteId(accessToken);
    const listId = await resolveListId(accessToken, siteId);

    // Verify list permissions by requesting top 1 item
    const base = `${GRAPH}/sites/${siteId}/lists/${listId}/items?$top=1`;
    const res = await fetch(base, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });

    const latencyMs = Date.now() - start;

    if (!res.ok) {
      return {
        ok: false,
        message: `HTTP ${res.status}: ${res.statusText}`,
        latencyMs,
        siteId,
        listId,
      };
    }

    return {
      ok: true,
      message: `Successfully connected to list "${MS_CONFIG.LIST_NAME}"`,
      latencyMs,
      siteId,
      listId,
    };
  } catch (err: any) {
    return {
      ok: false,
      message: err?.message || "Failed to reach SharePoint Online",
      latencyMs: Date.now() - start,
    };
  }
}
