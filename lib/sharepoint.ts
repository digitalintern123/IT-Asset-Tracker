/**
 * SharePoint list sync via Microsoft Graph.
 * Active only when MS_CONFIG.ENABLED = true.
 *
 * SharePoint list column → Asset field mapping:
 *   Title          → name
 *   Category       → category
 *   SerialNumber   → serialNumber
 *   Status         → status
 *   Assignee       → assignee
 *   AssigneeEmail  → (stored separately)
 *   Location       → location
 *   PurchaseDate   → purchaseDate
 *   PurchasePrice  → purchasePrice
 *   WarrantyExpiry → warrantyExpiry
 *   Notes          → notes
 *   AssetId        → id (our local id, for upsert matching)
 */

import { MS_CONFIG, isMsConfigured } from "./msConfig";
import type { Asset, AssetInput } from "@/types/asset";

const GRAPH = "https://graph.microsoft.com/v1.0";

async function getSiteId(accessToken: string): Promise<string> {
  const url = new URL(MS_CONFIG.SHAREPOINT_SITE_URL);
  const hostname = url.hostname;
  const sitePath = url.pathname;
  const res = await fetch(
    `${GRAPH}/sites/${hostname}:${sitePath}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) throw new Error(`getSiteId failed: ${res.status}`);
  const data = (await res.json()) as { id: string };
  return data.id;
}

async function getListId(
  accessToken: string,
  siteId: string,
): Promise<string> {
  const res = await fetch(
    `${GRAPH}/sites/${siteId}/lists?$filter=displayName eq '${MS_CONFIG.LIST_NAME}'`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) throw new Error(`getListId failed: ${res.status}`);
  const data = (await res.json()) as { value: { id: string }[] };
  if (!data.value.length) throw new Error(`List "${MS_CONFIG.LIST_NAME}" not found`);
  return data.value[0].id;
}

function toFields(asset: Asset, assigneeEmail?: string): Record<string, unknown> {
  return {
    Title: asset.name,
    Category: asset.category,
    SerialNumber: asset.serialNumber ?? "",
    Status: asset.status,
    Assignee: asset.assignee ?? "",
    AssigneeEmail: assigneeEmail ?? "",
    Location: asset.location ?? "",
    PurchaseDate: asset.purchaseDate ?? "",
    PurchasePrice: asset.purchasePrice ?? 0,
    WarrantyExpiry: asset.warrantyExpiry ?? "",
    Notes: asset.notes ?? "",
    AssetId: asset.id,
  };
}

function fromFields(
  itemId: string,
  fields: Record<string, unknown>,
): Asset {
  return {
    id: String(fields["AssetId"] ?? itemId),
    name: String(fields["Title"] ?? ""),
    category: (fields["Category"] as Asset["category"]) ?? "Other",
    serialNumber: String(fields["SerialNumber"] ?? ""),
    status: (fields["Status"] as Asset["status"]) ?? "available",
    assignee: String(fields["Assignee"] ?? ""),
    location: String(fields["Location"] ?? ""),
    purchaseDate: String(fields["PurchaseDate"] ?? ""),
    purchasePrice: Number(fields["PurchasePrice"] ?? 0),
    warrantyExpiry: String(fields["WarrantyExpiry"] ?? "") || null,
    notes: String(fields["Notes"] ?? ""),
    createdAt: String(fields["Created"] ?? new Date().toISOString()),
    updatedAt: String(fields["Modified"] ?? new Date().toISOString()),
  };
}

export interface SharePointClient {
  fetchAll: () => Promise<Asset[]>;
  upsert: (asset: Asset, assigneeEmail?: string) => Promise<void>;
  remove: (assetId: string) => Promise<void>;
}

export async function createSharePointClient(
  accessToken: string,
): Promise<SharePointClient> {
  if (!isMsConfigured()) throw new Error("Microsoft integration not configured");

  const siteId = await getSiteId(accessToken);
  const listId = await getListId(accessToken, siteId);
  const base = `${GRAPH}/sites/${siteId}/lists/${listId}/items`;
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };

  async function fetchAll(): Promise<Asset[]> {
    const res = await fetch(`${base}?expand=fields`, { headers });
    if (!res.ok) throw new Error(`fetchAll failed: ${res.status}`);
    const data = (await res.json()) as {
      value: { id: string; fields: Record<string, unknown> }[];
    };
    return data.value.map((item) => fromFields(item.id, item.fields));
  }

  async function findItemId(assetId: string): Promise<string | null> {
    const res = await fetch(
      `${base}?expand=fields&$filter=fields/AssetId eq '${assetId}'`,
      { headers },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { value: { id: string }[] };
    return data.value[0]?.id ?? null;
  }

  async function upsert(asset: Asset, assigneeEmail?: string): Promise<void> {
    const fields = toFields(asset, assigneeEmail);
    const existingId = await findItemId(asset.id);
    if (existingId) {
      await fetch(`${base}/${existingId}/fields`, {
        method: "PATCH",
        headers,
        body: JSON.stringify(fields),
      });
    } else {
      await fetch(base, {
        method: "POST",
        headers,
        body: JSON.stringify({ fields }),
      });
    }
  }

  async function remove(assetId: string): Promise<void> {
    const existingId = await findItemId(assetId);
    if (!existingId) return;
    await fetch(`${base}/${existingId}`, { method: "DELETE", headers });
  }

  return { fetchAll, upsert, remove };
}
