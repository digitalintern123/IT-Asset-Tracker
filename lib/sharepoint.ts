/**
 * SharePoint Online Database Service via Microsoft Graph API.
 * Authoritative cloud database for all assets.
 */

import { MS_CONFIG, isMsConfigured } from "./msConfig";
import type { Asset, AssetCategory, AssetInput, AssetStatus } from "@/types/asset";

const GRAPH = "https://graph.microsoft.com/v1.0";

// Memory cache for SharePoint site and list IDs
let cachedSiteId: string | null = null;
let cachedListId: string | null = null;

function mapCategory(raw: string): AssetCategory {
  const c = (raw || "").trim().toLowerCase();
  if (c.includes("laptop") || c.includes("macbook") || c.includes("thinkpad")) return "Laptop";
  if (c.includes("desktop") || c.includes("pc") || c.includes("imac")) return "Desktop";
  if (c.includes("monitor") || c.includes("screen") || c.includes("display")) return "Monitor";
  if (c.includes("phone") || c.includes("iphone") || c.includes("mobile")) return "Phone";
  if (c.includes("tablet") || c.includes("ipad")) return "Tablet";
  if (c.includes("furniture") || c.includes("chair") || c.includes("desk")) return "Furniture";
  if (c.includes("equip") || c.includes("network") || c.includes("server") || c.includes("printer")) return "Equipment";
  return "Other";
}

function mapStatus(raw: string): AssetStatus {
  const s = (raw || "").trim().toLowerCase();
  if (s.includes("use") || s.includes("issue") || s.includes("assigned")) return "in_use";
  if (s.includes("maint") || s.includes("repair")) return "maintenance";
  if (s.includes("retir") || s.includes("dispos")) return "retired";
  return "available";
}

export function fromSpItem(item: any): Asset {
  const f = item.fields || item;
  const spId = String(item.id || f.id || f.ID || "");
  const assetId = String(f.AssetId || f.AssetID || spId || Date.now().toString(36));

  return {
    id: assetId,
    spItemId: spId,
    name: String(f.Title || f.ComputerName || f.AssetID || f.name || "Unknown"),
    category: mapCategory(f.Category || f.AssetType || "Other"),
    serialNumber: String(f.SerialNumber || f.Serial_x0020_Number || ""),
    status: mapStatus(f.Status || f.AssetStatus || "available"),
    assignee: String(
      f.AssignedTo?.Title ||
      f.Assign ||
      f.Assignee ||
      (typeof f.AssignedTo === "string" ? f.AssignedTo : "") ||
      ""
    ),
    location: String(f.Location || ""),
    purchaseDate: String(f.PurchaseDate || ""),
    purchasePrice: Number(f.PurchasePrice) || 0,
    warrantyExpiry: f.WarrantyExpiry ? String(f.WarrantyExpiry) : null,
    notes: String(f.Notes || f.Description || ""),
    createdAt: String(f.Created || item.createdDateTime || new Date().toISOString()),
    updatedAt: String(f.Modified || item.lastModifiedDateTime || new Date().toISOString()),
    _syncStatus: "synced",
  };
}

export function toSpFields(input: AssetInput, assetId?: string): Record<string, unknown> {
  const fields: Record<string, unknown> = {
    Title: input.name,
    Category: input.category,
    SerialNumber: input.serialNumber || "",
    Status: input.status,
    Assignee: input.assignee || "",
    Location: input.location || "",
    PurchaseDate: input.purchaseDate || "",
    PurchasePrice: input.purchasePrice || 0,
    WarrantyExpiry: input.warrantyExpiry || "",
    Notes: input.notes || "",
  };

  if (assetId) {
    fields.AssetId = assetId;
  }

  return fields;
}

async function resolveSiteId(token: string): Promise<string> {
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

  if (!res.ok) {
    throw new Error(`Failed to resolve SharePoint site: HTTP ${res.status}`);
  }

  const data = await res.json();
  cachedSiteId = data.id;
  return data.id;
}

async function resolveListId(token: string, siteId: string): Promise<string> {
  if (cachedListId) return cachedListId;

  const filterUrl = `${GRAPH}/sites/${siteId}/lists?$filter=displayName eq '${encodeURIComponent(MS_CONFIG.LIST_NAME)}'`;
  const res = await fetch(filterUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.ok) {
    const data = await res.json();
    if (data.value && data.value.length > 0) {
      cachedListId = data.value[0].id;
      return data.value[0].id;
    }
  }

  // Fallback: list all lists in case filter has casing difference
  const allRes = await fetch(`${GRAPH}/sites/${siteId}/lists`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (allRes.ok) {
    const data = await allRes.json();
    const target = MS_CONFIG.LIST_NAME.trim().toLowerCase();
    const match = (data.value || []).find(
      (l: any) =>
        (l.displayName && l.displayName.trim().toLowerCase() === target) ||
        (l.name && l.name.trim().toLowerCase() === target)
    );
    if (match) {
      cachedListId = match.id;
      return match.id;
    }
  }

  throw new Error(`SharePoint list "${MS_CONFIG.LIST_NAME}" not found`);
}

export interface SharePointService {
  fetchAll: () => Promise<Asset[]>;
  create: (input: AssetInput) => Promise<Asset>;
  update: (spItemId: string, input: AssetInput) => Promise<Asset>;
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
    const res = await fetch(`${base}?expand=fields&$top=500`, { headers });
    if (!res.ok) {
      throw new Error(`Failed to load assets from SharePoint: HTTP ${res.status}`);
    }
    const data = await res.json();
    return (data.value || []).map(fromSpItem);
  }

  async function create(input: AssetInput): Promise<Asset> {
    const assetId = "AST-" + Date.now().toString(36).toUpperCase();
    const fields = toSpFields(input, assetId);

    const res = await fetch(base, {
      method: "POST",
      headers,
      body: JSON.stringify({ fields }),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      throw new Error(
        `Failed to create asset in SharePoint (HTTP ${res.status}): ${errBody || res.statusText}`
      );
    }

    const createdItem = await res.json();
    return fromSpItem(createdItem);
  }

  async function update(spItemId: string, input: AssetInput): Promise<Asset> {
    const fields = toSpFields(input);

    const res = await fetch(`${base}/${spItemId}/fields`, {
      method: "PATCH",
      headers,
      body: JSON.stringify(fields),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      throw new Error(
        `Failed to update asset in SharePoint (HTTP ${res.status}): ${errBody || res.statusText}`
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
      `${base}?expand=fields&$filter=fields/AssetId eq '${encodeURIComponent(assetId)}'`,
      { headers }
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
